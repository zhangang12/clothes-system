// 单据导出 Excel 的公共层 —— 各单据(样衣/报价/合同/对账/付款/结算)只声明自己的区块结构(Block[]),
// 排版/转义/落盘都收在这里。**同一份 Block[] 有两个渲染出口**：
//
//   exportDocExcel  → HTML 工作表存 .xls：零依赖，纯数据单据用它（对账/付款/结算）。三个坑收在这:
//                     1. UTF-8 BOM + meta —— 否则 Excel 按 GBK 打开,中文全乱码;
//                     2. 单元格 mso-number-format:"\@" —— 强制文本,否则款号(如 I27.230.03929)被当数字截断;
//                     3. <x:Name> 工作表名 —— 否则 Excel 里标签页叫一串乱码文件名。
//   exportDocXlsx   → 真 .xlsx(exceljs)：**带图片的单据必须用它**（合同/报价）。
//
// 【为什么带图片就不能用 .xls】(2026-08-06)
// HTML 工作表里图片只能写成 <img src="data:image/...;base64,...">，而 **Excel 打开 HTML 工作表时
// 根本不渲染 data: URI 图片**——文件里有、界面上就是不显示，且不报任何错。用户看到的是
// 「表格下来了、图没了」。这不是参数问题，是格式层面的限制，只能换成真 .xlsx：
// 那边图片是独立媒体条目打包进 zip、再由 drawing 锚定到单元格，Excel/WPS 都正常显示。
// 先在样衣导出上验证过（YSM 反馈），本层是把同一套办法收成公共能力，合同/报价随即接上。
//
// 【为什么剩下三张单还留在 .xls】它们压根没有图片列，HTML 路子在生产上跑了几个月没出过问题；
// 换格式对用户零收益、却要重测三条导出链路。**要迁的时候把 exportDocExcel 换成 exportDocXlsx 即可**，
// 区块声明一个字都不用动——这正是留两个出口的原因。
//
// 【为什么可以引 exceljs】它已是 packages/web 既有依赖（导入功能解析 .xlsx 在用），且一律
// **动态 import**：不点导出就不加载，主包体积不受影响（解包 20MB+，见 sheetPreview.ts 说明）。

const BOM = String.fromCharCode(0xfeff);

export const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 日期取前 10 位(后端回的是 ISO 串,Excel 里不需要时分秒) */
export const d10 = (v: unknown): string => (v ? String(v).slice(0, 10) : '');

/** 图片单元格：放进 Block 的 rows 里，由 exportDocXlsx 真正嵌图（HTML 路径退回 fallback 文字）。
 *  box 是**最长边**上限（px），实际尺寸按原图比例缩进去，不是硬拉成 box×box。 */
export interface ImageCell { img: string; box?: number; fallback?: string }

export const imgCell = (url: string, box?: number, fallback?: string): ImageCell =>
  ({ img: url, box, fallback });

export const isImageCell = (c: unknown): c is ImageCell =>
  !!c && typeof c === 'object' && typeof (c as { img?: unknown }).img === 'string';

/** 数字单元格：**xlsx 路径写成真数字**，Excel 里能直接 SUM / 排序 / 筛选。
 *
 *  【为什么需要它】本层给所有单元格钉了 `numFmt='@'`（文本）——款号形如 I27.230.03929，
 *  不钉成文本会被 Excel 截成 27.23。代价是**金额也成了文本**，选中一列右下角不显示求和、
 *  写 =SUM() 得 0。单据导出无所谓（一张单自己就带合计行），但「拉一家工厂所有账单」这种
 *  是拿去二次加工的，金额必须是数字。
 *
 *  【空值仍然是空单元格】沿用 n2 的口径：未填 ≠ 0，别让"没填金额"在表里读成"金额为零"。 */
export interface NumCell { num: number; fmt?: string }

export const isNumCell = (c: unknown): c is NumCell =>
  !!c && typeof c === 'object' && typeof (c as { num?: unknown }).num === 'number';

export const numCell = (v: unknown, fmt = '#,##0.00'): NumCell | '' => {
  if (v === null || v === undefined || v === '') return '';
  const x = Number(v);
  return Number.isFinite(x) ? { num: x, fmt } : '';
};

/**
 * 「能转就转数值，转不了保留原文」——给**自由文本的数字列**用（样衣材料的数量/克重、
 * 报价耗用这类）。numCell 对转不动的值返回空串，用在这些列上会把「3条」「若干」直接丢掉；
 * 这里退回原文，数字照样可求和、历史脏值一个不丢（#115 收尾时的口径）。
 */
export const numOr = (v: unknown, fmt = '#,##0.00'): NumCell | string => {
  if (v === null || v === undefined || v === '') return '';
  const x = Number(v);
  return Number.isFinite(x) ? { num: x, fmt } : String(v);
};

/** 空值渲染成空单元格而不是 "null"/"undefined" */
export const val = (v: unknown): string => {
  // 图片单元格若走到 HTML 路径，String() 会渲染成 "[object Object]"。这里退回文字标注：
  // HTML 工作表本来就显示不了内联图（见文件头），与其给个看不见的 <img>，不如明说去哪儿看。
  if (isImageCell(v)) return esc(v.fallback ?? '图（系统内查看）');
  // 数字单元格在 HTML 工作表里没有"真数字"可言（整表 mso-number-format 是文本），退回两位小数文本
  if (isNumCell(v)) return esc(v.num.toFixed(2));
  return v === null || v === undefined ? '' : esc(v);
};

/** 抓图转 base64 data URI（>2MB 或失败返回 null，调用方退回链接文本）。
 *  2MB 这条线是有实据的：2026-08-06 查生产 /data/uploads 共 170 张图，p90 380KB、最大 1.89MB，
 *  无一超限——够用，不必再上「画到 canvas 压缩」那套复杂度。日后若真出现大图再说。 */
export async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > 2 * 1024 * 1024) return null;
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ''));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

/** 从 data URI 解出 exceljs 需要的扩展名与纯 base64 体 */
export function splitDataUrl(dataUrl: string): { ext: 'png' | 'jpeg' | 'gif'; body: string } | null {
  const m = /^data:image\/(png|jpe?g|gif);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  return { ext: raw === 'jpg' ? 'jpeg' : (raw as 'png' | 'jpeg' | 'gif'), body: m[2] };
}

/** 直接从图像字节里读原始像素尺寸。
 *  【为什么不用 new Image() 读 naturalWidth】那要等 onload、还只在浏览器里有，单测得整套打桩；
 *  这里纯解字节，浏览器/jsdom 行为完全一致，也不用等异步。
 *  只解前 96KB：JPEG 的 SOF 段几乎不会超出这个范围，整张 1.7MB 图 atob 一遍纯属浪费。 */
export function imageSize(base64: string): { w: number; h: number } | null {
  let b: Uint8Array;
  try {
    const head = base64.slice(0, 128 * 1024);
    const bin = atob(head.slice(0, head.length - (head.length % 4))); // atob 要求 4 的倍数
    b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  } catch { return null; }
  const u16 = (i: number) => (b[i] << 8) | b[i + 1];
  const u32 = (i: number) => (((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0);

  if (b[0] === 0x89 && b[1] === 0x50) return { w: u32(16), h: u32(20) };            // PNG：IHDR 里的宽高
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46)                              // GIF：逻辑屏幕宽高（小端）
    return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
  if (b[0] === 0xff && b[1] === 0xd8) {                                             // JPEG：逐段跳到 SOFn
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const mk = b[i + 1];
      // C4=DHT / C8=JPG / CC=DAC 长得像 SOF 但不是，跳过它们否则读出一堆垃圾尺寸
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) {
        return { h: u16(i + 5), w: u16(i + 7) };
      }
      const len = u16(i + 2);
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return null;
}

/** 等比缩放进 box×box 的方框（读不出原始尺寸就用方框兜底）。
 *  【为什么必须等比】2026-08-06 用真实生产照片（2480×3508 竖图）实测：直接把 ext 设成
 *  固定的 96×72 横框，Excel 就照这个尺寸把图拉扁，人像/工艺图全变形。用方框而不是长方框，
 *  是因为材料照竖拍横拍都有，方框对两种都不吃亏。 */
function fitBox(base64: string, box: number): { width: number; height: number } {
  const s = imageSize(base64);
  if (!s || !s.w || !s.h) return { width: box, height: box };
  const k = Math.min(box / s.w, box / s.h);
  return { width: Math.max(1, Math.round(s.w * k)), height: Math.max(1, Math.round(s.h * k)) };
}

/** 敏感附件（发票/水单/纸质章等 private/ 目录）导出占位：裸 URL 点开必 403 死链，统一标注引导系统内查看 */
export const sensitiveMark = (u?: string | null): string => (u ? '🔒 敏感附件·请登录系统内查看' : '');

// 金额:非数字回退空,避免表格里出现 NaN。空值必须先挡掉——Number(null)/Number('') 都是 0,
// 不挡的话「未填」会导出成 0.00,业务读起来是「金额为零」,含义完全不同。
const blank = (v: unknown): boolean => v === null || v === undefined || v === '';

export const n2 = (v: unknown): string => {
  if (blank(v)) return '';
  const x = Number(v);
  return Number.isFinite(x) ? x.toFixed(2) : '';
};

export const n4 = (v: unknown): string => {
  if (blank(v)) return '';
  const x = Number(v);
  return Number.isFinite(x) ? x.toFixed(4) : '';
};

/** 求和:忽略非数字,保留两位(浮点累加会出 0.1+0.2 那类尾数) */
export const sum = (rows: any[], pick: (r: any) => unknown): number =>
  +rows.reduce((s, r) => s + (Number(pick(r)) || 0), 0).toFixed(2);

/** 键值区:成对字段,按 perRow 对/行自动排版 */
export interface KvBlock {
  kind: 'kv';
  title?: string;
  perRow?: number;
  pairs: Array<[string, unknown]>;
}

/** 明细表区:表头 + 数据行 + 可选合计行 */
export interface TableBlock {
  kind: 'table';
  title?: string;
  head: string[];
  rows: unknown[][];
  foot?: unknown[];
  empty?: string;
}

export type Block = KvBlock | TableBlock;

function buildKv(b: KvBlock): string {
  const perRow = b.perRow ?? 2;
  const cols = perRow * 2;
  const trs: string[] = [];
  for (let i = 0; i < b.pairs.length; i += perRow) {
    const cells = b.pairs
      .slice(i, i + perRow)
      .map(([k, v]) => `<td class="k">${val(k)}</td><td>${val(v)}</td>`)
      .join('');
    // 最后一行不足 perRow 对时补空单元格，否则 Excel 里表格右边会缺一块
    const padPairs = (i + perRow > b.pairs.length) ? (i + perRow - b.pairs.length) : 0;
    trs.push(`<tr>${cells}${'<td class="k"></td><td></td>'.repeat(padPairs)}</tr>`);
  }
  const title = b.title ? `<tr><td colspan="${cols}" class="title">${esc(b.title)}</td></tr>` : '';
  return `<table>${title}${trs.join('')}</table>`;
}

function buildTable(b: TableBlock): string {
  const cols = b.head.length;
  const title = b.title ? `<tr><td colspan="${cols}" class="title">${esc(b.title)}</td></tr>` : '';
  const head = `<tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`;
  const body = b.rows.length
    ? b.rows.map((r) => `<tr>${r.map((c) => `<td>${val(c)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols}">${esc(b.empty ?? '（无明细）')}</td></tr>`;
  const foot = b.foot
    ? `<tr>${b.foot.map((c) => `<td class="k">${val(c)}</td>`).join('')}</tr>`
    : '';
  return `<table>${title}${head}${body}${foot}</table>`;
}

export function buildDocXls(opts: { sheetName: string; title: string; blocks: Block[] }): string {
  const body = opts.blocks
    .map((b) => (b.kind === 'kv' ? buildKv(b) : buildTable(b)))
    .join('<br/>');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${esc(opts.sheetName)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  table { border-collapse: collapse; }
  td, th { border: 0.5pt solid #999; padding: 3px 6px; mso-number-format:"\\@"; }
  th { background: #1E3A5F; color: #fff; font-weight: 700; }
  td.k { background: #f2f5f8; font-weight: 700; }
  .title { font-size: 15pt; font-weight: 700; }
</style></head>
<body>
  <table><tr><td class="title">${esc(opts.title)}</td></tr></table>
  ${body}
</body></html>`;
}

/** 落盘：两个渲染出口共用 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻 revoke 在部分浏览器（移动端 Safari、旧版 Chrome）上会让下载拿不到数据，延后释放
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function downloadXls(html: string, filename: string): void {
  downloadBlob(new Blob([BOM + html], { type: 'application/vnd.ms-excel;charset=utf-8' }), filename);
}

/** 组装 + 落盘:各单据导出器的统一出口(HTML 工作表 .xls) */
export function exportDocExcel(opts: {
  sheetName: string;
  title: string;
  filename: string;
  blocks: Block[];
}): void {
  downloadXls(buildDocXls({ sheetName: opts.sheetName, title: opts.title, blocks: opts.blocks }), opts.filename);
}

// ── 真 .xlsx 渲染出口（带图片的单据走这条）────────────────────────────────

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } } as const;
const KEY_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F5F8' } } as const;
const THIN = { style: 'thin' } as const;
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN } as const;

/** Excel 工作表名：≤31 字符，且不能含 : \ / ? * [ ]。**非法名会让 addWorksheet 直接抛错**，
 *  整份导出跟着失败——单号里混进斜杠这种事不该炸掉导出，所以在这里兜掉而不是让它抛。 */
const safeSheetName = (s: string): string =>
  String(s ?? '').replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || 'Sheet1';

/** xlsx 单元格不经过 HTML，绝不能用 esc()——否则「面料 A&B」会写成「面料 A&amp;B」 */
const plain = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export async function exportDocXlsx(opts: {
  sheetName: string;
  title: string;
  filename: string;
  blocks: Block[];
}): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(safeSheetName(opts.sheetName));

  // 图片是「浮」在单元格之上的，不是单元格的值：必须记下位置，等行都写完再统一贴，
  // 并把所在行高/列宽撑开，否则图会压住相邻行列。
  const pending: Array<{ cell: ImageCell; row: number; col: number }> = [];
  const colPx: Record<number, number> = {};

  const addRow = (cells: unknown[]) => {
    const row = ws.addRow(cells.map((c) => (isImageCell(c) ? '' : isNumCell(c) ? c.num : plain(c))));
    for (let i = 0; i < cells.length; i++) {
      const c = row.getCell(i + 1);
      const src = cells[i];
      if (isNumCell(src)) {
        // 数字单元格例外：钉成文本就没法 SUM 了（见 NumCell 说明）
        c.numFmt = src.fmt ?? '#,##0.00';
        c.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        c.numFmt = '@'; // 强制文本：款号形如 I27.230.03929，不强制会被 Excel 截断成 27.23
        c.alignment = { vertical: 'middle', wrapText: true };
      }
      c.border = BORDER as never;
      if (isImageCell(src)) pending.push({ cell: src as ImageCell, row: row.number, col: i + 1 });
    }
    return row;
  };

  // 【标题/表头行必须写死行高】图片是按「行号」锚定的，渲染器要把行号换算成像素偏移。
  // 不写 ht 的行是「自动行高」，而大字号标题行各家算出来的高度并不一致——qlmanage 实测
  // 图片会往上飘、压住表头。标题/表头都是单行短文本，钉死行高没有副作用；
  // 数据行则继续保持自动行高，否则长备注一 wrap 就被切掉。
  const titleRow = (text: string, span: number, size: number) => {
    const row = ws.addRow([text]);
    if (span > 1) ws.mergeCells(row.number, 1, row.number, span); // 合并单格会抛错，只在 >1 时合
    row.getCell(1).font = { size, bold: true };
    row.height = size + 8;
    return row;
  };

  const blockCols = (b: Block): number => (b.kind === 'kv' ? (b.perRow ?? 2) * 2 : b.head.length);
  titleRow(opts.title, Math.max(2, ...opts.blocks.map(blockCols)), 15);

  for (const b of opts.blocks) {
    if (b.kind === 'kv') {
      const perRow = b.perRow ?? 2;
      if (b.title) titleRow(b.title, perRow * 2, 13);
      for (let i = 0; i < b.pairs.length; i += perRow) {
        const cells: unknown[] = [];
        for (const [k, v] of b.pairs.slice(i, i + perRow)) cells.push(k, v);
        while (cells.length < perRow * 2) cells.push(''); // 末行补齐，否则 Excel 里表格右边缺一块
        const row = addRow(cells);
        for (let p = 0; p < perRow; p++) {
          const c = row.getCell(p * 2 + 1);
          c.fill = KEY_FILL as never;
          c.font = { bold: true };
        }
      }
    } else {
      if (b.title) titleRow(b.title, b.head.length, 13);
      const head = ws.addRow(b.head);
      head.height = 20; // 同上：表头也钉死，别让自动行高把下面的图挤走位
      for (let i = 0; i < b.head.length; i++) {
        const c = head.getCell(i + 1);
        c.fill = HEAD_FILL as never;
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.border = BORDER as never;
      }
      if (b.rows.length) {
        for (const r of b.rows) addRow(r);
      } else {
        const r = addRow([b.empty ?? '（无明细）']);
        if (b.head.length > 1) ws.mergeCells(r.number, 1, r.number, b.head.length);
      }
      if (b.foot) {
        const r = addRow(b.foot);
        for (let i = 0; i < b.foot.length; i++) r.getCell(i + 1).font = { bold: true };
      }
    }
    ws.addRow([]); // 区块间留一行，跟 HTML 版的 <br/> 对齐
  }

  // 图片：并发抓取（一份合同可能有多张材料照，串行会明显拖慢导出），再按记录的位置逐一落位
  const fetched = await Promise.all(pending.map((p) => toDataUrl(p.cell.img)));
  pending.forEach((p, i) => {
    const parsed = fetched[i] ? splitDataUrl(fetched[i] as string) : null;
    if (!parsed) {
      // 抓不到 / 超 2MB / 不是 png-jpg-gif（如 webp、heic）：退回可点链接，别让整份导出失败
      const c = ws.getCell(p.row, p.col);
      c.value = { text: p.cell.fallback ?? '图（点开查看）', hyperlink: p.cell.img } as never;
      c.font = { color: { argb: 'FF1E5FA8' }, underline: true };
      return;
    }
    const ext = fitBox(parsed.body, p.cell.box ?? 96);
    const id = wb.addImage({ base64: parsed.body, extension: parsed.ext });
    // tl 是 0 基的，行列都要减 1，否则整体偏移一格
    ws.addImage(id, { tl: { col: p.col - 1, row: p.row - 1 } as never, ext });
    const row = ws.getRow(p.row);
    row.height = Math.max(row.height ?? 0, ext.height * 0.75 + 6); // 行高单位是磅：1px ≈ 0.75pt
    colPx[p.col] = Math.max(colPx[p.col] ?? 0, ext.width);
  });

  for (let i = 1; i <= ws.columnCount; i++) {
    const col = ws.getColumn(i);
    const px = colPx[i];
    // 列宽单位≈字符数，默认字体下 1 字符 ≈ 7px；+2 留出边距，不然图贴着边框
    col.width = px ? Math.max(col.width ?? 0, px / 7 + 2) : (col.width ?? 16);
  }

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: XLSX_MIME }), opts.filename);
}
