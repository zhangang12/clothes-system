// 样衣制作单打印/导出 PDF —— 浏览器原生打印（可"另存为 PDF"，与 contractPrint 同模式）
// 对外单据脱敏：材料明细不含「参考价格」（设计稿：版师/外发单据不见价格）。
//
// 【整份排版由 PrintLayout 驱动】(2026-08-07 反馈：「打出来没有成一行」「部位想拉到品名后面」
// 「成分码带克重这种可以不用打印，占格子」「做成一个可以自己设计页面元素的操作台」)
// 区块的取舍与顺序、基本信息印哪些字段、材料明细印哪些列与顺序、纸张方向、字号，全部外部传入。
//
// **buildSampleHtml 同时供「打印」和「操作台预览」使用**——预览必须和真打印是同一份代码，
// 否则就成了所见非所得，调半天打出来还是另一个样。区别只有 autoPrint 一个开关。

import type { PrintLayout } from './printLayout';
import { splitColorGroups, maxColorGroups, colorGroupLabel } from './colorGroups';

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const d10 = (v: unknown): string => (v ? esc(String(v).slice(0, 10)) : '—');
const dash = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : esc(v));

// ── 可配置的三类元素 ──────────────────────────────────────────────

export interface MatCol {
  key: string;
  label: string;
  width?: number;            // 打印列宽(px)；不给则自适应（留给品名/备注这类长文本）
  align?: 'c' | 'r';         // 居中 / 右对齐；不给则左对齐
  get: (m: any, i: number) => string;
}

/** 材料明细可打印的全部列。**数组顺序 = 默认顺序**；用户调的顺序覆盖它。
 *
 * 【列宽是有预算的，别随手加宽】(2026-08-12 #85 YSM：「一个字一行，很浪费纸」)
 * A4 竖版去掉 14mm 页边距后正文宽约 **680px**（横版约 1017px）。
 * 默认要印 11 列，其中品名、备注**不设宽度**、留给它们自己撑——
 * 改版前固定列合计 600px，只剩 80px 给这两列平分，每列 40px，
 * 而一个汉字在 12px 字号下就占约 12px，三个字就换行，长品名于是被压成一条竖线。
 * 现在固定列合计约 490px，给品名+备注留出约 190px。
 * **再往里加列、或调宽某列时，先把这笔账算一遍**；操作台里也有超宽告警兜底。 */
export const SAMPLE_MAT_COLS: MatCol[] = [
  { key: 'idx', label: '#', width: 32, align: 'c', get: (_m, i) => String(i + 1) },
  { key: 'item_name', label: '品名', get: (m) => dash(m.item_name) },
  { key: 'part', label: '部位', width: 48, align: 'c', get: (m) => dash(m.part) },
  { key: 'width', label: '门幅', width: 56, align: 'c', get: (m) => dash(m.width) },
  { key: 'colors', label: '颜色', width: 70, align: 'c', get: (m) => dash(m.colors) },
  { key: 'composition', label: '成份', width: 70, align: 'c', get: (m) => dash(m.composition) },
  { key: 'code_band', label: '码带', width: 48, align: 'c', get: (m) => dash(m.code_band) },
  { key: 'zipper_length', label: '拉链长度', width: 64, align: 'c', get: (m) => dash(m.zipper_length) },
  { key: 'puller', label: '拉头', width: 52, align: 'c', get: (m) => dash(m.puller) },
  { key: 'qty', label: '数量', width: 48, align: 'r', get: (m) => dash(m.qty) },
  { key: 'gram_weight', label: '克重', width: 56, align: 'c', get: (m) => dash(m.gram_weight) },
  { key: 'size', label: '尺寸', width: 60, align: 'c', get: (m) => dash(m.size) },
  { key: 'actual_usage', label: '实际耗用', width: 76, align: 'r', get: (m) => dash(m.actual_usage) },
  { key: 'supplier_name', label: '供应商', width: 110, get: (m) => dash(m.supplier_name) },
  { key: 'remark', label: '备注', get: (m) => dash(m.remark) },
];

export interface MetaField { key: string; label: string; get: (d: any, ctx: any) => string }

/** 基本信息区可印的字段 */
export const SAMPLE_META_FIELDS: MetaField[] = [
  { key: 'style_no', label: '客户款号', get: (d) => dash(d.style_no) },
  { key: 'categories', label: '样衣类别', get: (d) => String(d.categories ?? '').split(',').filter(Boolean).map(esc).join(' · ') || '—' },
  { key: 'middleman_name', label: '中间商', get: (d) => dash(d.middleman_name) },
  { key: 'buyer_name', label: '最终买家', get: (d) => dash(d.buyer_name) },
  { key: 'patternmaker_name', label: '制版师', get: (d) => dash(d.patternmaker_name) },
  { key: 'maker', label: '制单人', get: (d) => dash(d.maker) },
  { key: 'make_date', label: '制单日期', get: (d) => d10(d.make_date) },
  { key: 'ship_date', label: '寄样日期', get: (_d, c) => d10(c.shipDate) },
  { key: 'recipient', label: '收件人', get: (d) => dash(d.recipient) },
  { key: 'sample_no', label: '样衣编号', get: (d) => dash(d.sample_no) },
  { key: 'sample_size', label: '样衣尺码', get: (d) => dash(d.sample_size) },
  { key: 'sample_qty', label: '样衣数量', get: (d) => (d.sample_qty != null && d.sample_qty !== '' ? esc(d.sample_qty) + ' 件' : '—') },
];

export interface BlockDef { key: string; label: string }

/** 可摆放的页面区块。数组顺序 = 默认顺序 */
export const SAMPLE_BLOCKS: BlockDef[] = [
  { key: 'meta', label: '基本信息' },
  { key: 'materials', label: '材料明细' },
  { key: 'track', label: '寄样跟踪' },
  { key: 'rounds', label: '寄样轮次（多轮时）' },
  { key: 'remark', label: '成衣备注' },
  { key: 'photos', label: '样衣照片/图稿' },
];

/** 默认排版：**与改造前印出来的东西完全一致**，没配过的人不该发现单据变了样 */
export const DEFAULT_SAMPLE_LAYOUT: PrintLayout = {
  paper: 'A4',
  fontSize: 12,
  blocks: SAMPLE_BLOCKS.map((b) => ({ key: b.key, on: true })),
  metaFields: SAMPLE_META_FIELDS.map((f) => f.key),
  matCols: ['idx', 'item_name', 'width', 'colors', 'part', 'composition',
    'code_band', 'qty', 'gram_weight', 'size', 'remark'],
  rowPad: 4,        // 与改造前的 padding:4px 一致，没配过的人印出来一模一样
  colWidths: {},
};

/** 按 key 列表取定义；认不出的 key 忽略（列改名/删除后旧配置仍能用），全无效则退回默认 */
function pick<T extends { key: string }>(all: T[], keys: string[] | undefined, fallback: string[]): T[] {
  const map = new Map(all.map((c) => [c.key, c]));
  const got = (keys?.length ? keys : fallback).map((k) => map.get(k)).filter(Boolean) as T[];
  return got.length ? got : (fallback.map((k) => map.get(k)).filter(Boolean) as T[]);
}

/** 把「颜色」一列摊成「颜色一/颜色二/…」——工厂要横着对每个色组下的辅料颜色（2026-08-10 Grace）。
 *  只有一个色组时保持原样，别让单色样衣平白多出一堆空列。 */
export function expandColorCols(cols: MatCol[], materials: any[]): MatCol[] {
  const n = maxColorGroups(materials);
  if (n <= 1) return cols;
  const at = cols.findIndex((c) => c.key === 'colors');
  if (at < 0) return cols; // 用户在操作台里关掉了颜色列，就不要自作主张加回来
  const made: MatCol[] = Array.from({ length: n }, (_, i) => ({
    key: `colors_${i}`,
    label: colorGroupLabel(i),
    width: 84,
    align: 'c' as const,
    get: (m: any) => dash(splitColorGroups(m.colors)[i] ?? ''),
  }));
  return [...cols.slice(0, at), ...made, ...cols.slice(at + 1)];
}

/** 某列的内置默认宽度（操作台里作为输入框的占位提示；0 = 自适应） */
export const defaultColWidth = (key: string): number =>
  SAMPLE_MAT_COLS.find((c) => c.key === key)?.width ?? 0;

export const resolveMatCols = (keys?: string[] | null): MatCol[] =>
  pick(SAMPLE_MAT_COLS, keys ?? undefined, DEFAULT_SAMPLE_LAYOUT.matCols);
export const resolveMetaFields = (keys?: string[] | null): MetaField[] =>
  pick(SAMPLE_META_FIELDS, keys ?? undefined, DEFAULT_SAMPLE_LAYOUT.metaFields);

// ── HTML 生成 ────────────────────────────────────────────────────

export function buildSampleHtml(detail: any, layout?: Partial<PrintLayout>, autoPrint = false): string {
  const L: PrintLayout = { ...DEFAULT_SAMPLE_LAYOUT, ...(layout ?? {}) };
  // 行高：单元格上下内边距。**0 是合法值**（最省纸），所以不能用 `|| 4` 兜底；
  // 越界值钳到 0~20，别把离谱数字原样写进样式。
  const pad = Number.isFinite(Number(L.rowPad)) ? Math.max(0, Math.min(20, Number(L.rowPad))) : 4;
  const widths = L.colWidths ?? {};
  const on = (k: string) => L.blocks.find((b) => b.key === k)?.on !== false;
  const order = L.blocks.length ? L.blocks : DEFAULT_SAMPLE_LAYOUT.blocks;

  // 寄样改多轮子表后，单号/日期落在轮次上，旧单值列不再回填：为空时取首轮（与 sampleExcel 同款兜底）
  const rounds: any[] = detail.shipRounds ?? [];
  const r1: any = rounds[0] ?? {};
  const ctx = {
    shipDate: detail.ship_sample_date ?? r1.ship_date,
    shipNo: detail.material_ship_no ?? r1.ship_no,
  };

  const metaBlock = () => {
    const fields = resolveMetaFields(L.metaFields);
    if (!fields.length) return '';
    return `<h3>基本信息</h3><div class="meta">${
      fields.map((f) => `<div><b>${esc(f.label)}：</b>${f.get(detail, ctx)}</div>`).join('')
    }</div>`;
  };

  /** 列宽：用户在操作台里调过的优先，没调过用内置默认。0 视为「自适应」，不输出 width */
  const colWidth = (c: MatCol): number => {
    const w = Number(widths[c.key]);
    if (Number.isFinite(w) && w > 0) return Math.round(w);
    return c.width ?? 0;
  };

  const materialsBlock = () => {
    const mats: any[] = detail.materials ?? [];
    const cols = expandColorCols(resolveMatCols(L.matCols), mats);
    const head = `<tr>${cols.map((c) =>
      `<th${colWidth(c) ? ` style="width:${colWidth(c)}px"` : ''}>${esc(c.label)}</th>`).join('')}</tr>`;
    const body = mats.length
      ? mats.map((m, i) => `<tr>${cols.map((c) =>
        `<td${c.align ? ` class="${c.align}"` : ''}>${c.get(m, i)}</td>`).join('')}</tr>`).join('')
      : `<tr><td class="c" colspan="${cols.length}">（无材料明细）</td></tr>`;
    return `<h3>材料明细</h3><table><thead>${head}</thead><tbody>${body}</tbody></table>`;
  };

  const trackBlock = () => `<h3>寄样跟踪</h3><div class="meta">
    <div><b>材料寄出单号：</b>${dash(ctx.shipNo)}</div>
    <div><b>材料寄出日期：</b>${d10(ctx.shipDate)}</div>
    <div><b>寄回快递单号：</b>${dash(detail.return_no)}</div>
    <div><b>寄回日期：</b>${d10(detail.return_date)}</div>
    <div><b>件数：</b>${dash(detail.piece_count)}</div>
  </div>`;

  // 多轮寄样明细表（多轮时才展开；脱敏：不含工价）
  const roundsBlock = () => (rounds.length > 1
    ? `<h3>寄样轮次</h3><table><thead><tr><th>轮次</th><th>尺码</th><th>件数</th><th>寄出日期</th><th>寄出单号</th><th>寄回日期</th><th>备注</th></tr></thead><tbody>${
      rounds.map((r, i) => `<tr><td class="c">${r.round_no ?? i + 1}</td><td class="c">${dash(r.size)}</td><td class="c">${dash(r.qty)}</td><td class="c">${d10(r.ship_date)}</td><td class="c">${dash(r.ship_no)}</td><td class="c">${d10(r.return_date)}</td><td>${dash(r.remark)}</td></tr>`).join('')
    }</tbody></table>`
    : '');

  const remarkBlock = () => (detail.garment_remark
    ? `<h3>成衣备注</h3><div class="remark">${esc(detail.garment_remark)}</div>` : '');

  // 样衣照片/图稿（image1/2/3 每槽可多图，逗号分隔）
  const photosBlock = () => {
    const urls = [detail.image1, detail.image2, detail.image3]
      .flatMap((u) => String(u ?? '').split(','))
      .map((s) => s.trim())
      .filter(Boolean);
    return urls.length
      ? `<h3>样衣照片/图稿</h3><div class="photos">${urls.map((u) => `<img src="${esc(u)}" alt="样衣图" />`).join('')}</div>`
      : '';
  };

  const RENDER: Record<string, () => string> = {
    meta: metaBlock, materials: materialsBlock, track: trackBlock,
    rounds: roundsBlock, remark: remarkBlock, photos: photosBlock,
  };
  const body = order.filter((b) => on(b.key)).map((b) => RENDER[b.key]?.() ?? '').join('\n');

  const landscape = L.paper === 'A4L';
  const fs = Number(L.fontSize) || 12;

  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>样衣制作单-${esc(detail.sample_no)}</title>
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family:"Microsoft YaHei","PingFang SC","Songti SC",sans-serif; color:#1a1a1a; font-size:${fs}px; }
  .head { text-align:center; border-bottom:2px solid #1E3A5F; padding-bottom:8px; }
  .title { font-size:${fs + 8}px; font-weight:700; letter-spacing:3px; color:#1E3A5F; }
  .sub { font-size:${fs}px; color:#666; margin-top:4px; }
  .meta { display:grid; grid-template-columns:${landscape ? '1fr 1fr 1fr' : '1fr 1fr'}; gap:2px 16px; margin:12px 0; }
  .meta b { color:#555; font-weight:600; }
  h3 { font-size:${fs + 1}px; color:#1E3A5F; margin:14px 0 4px; border-left:3px solid #D17A40; padding-left:6px; }
  table { width:100%; border-collapse:collapse; }
  /* table-layout:fixed —— 让设定的列宽**说了算**。auto 布局下浏览器会按内容重新分配，
     用户在操作台里调的宽度经常不生效，"能自己调"就成了空话。
     注意：fixed 本身不解决「一个字一行」，那是列宽预算的问题（见 SAMPLE_MAT_COLS 的说明）；
     它解决的是"调了没用"。两件事要一起做才有效。 */
  table { table-layout: fixed; }
  th, td { border:1px solid #ccc; padding:${pad}px 6px; }
  th { background:#f2f5f8; color:#1E3A5F; font-weight:600; }
  /* 短值列（门幅/数量/克重这类）不折行，省得一条材料被挤成两行；
     品名/备注这种长文本仍允许换行，否则会顶破表格宽度 */
  td.c { text-align:center; white-space:nowrap; } td.r { text-align:right; white-space:nowrap; }
  td { word-break:break-word; }
  .remark { margin-top:8px; line-height:1.7; }
  .photos { display:flex; flex-wrap:wrap; gap:8px; }
  .photos img { max-width:250px; max-height:190px; object-fit:cover; border:1px solid #ddd; border-radius:4px; }
  @media screen { body { max-width:${landscape ? '1120px' : '820px'}; margin:20px auto; } }
</style></head><body${autoPrint ? ' onload="window.print()"' : ''}>
  <div class="head">
    <div class="title">样衣制作单</div>
    <div class="sub">样衣编号：${esc(detail.sample_no)}</div>
  </div>
${body}
</body></html>`;
}

export function printSample(detail: any, layout?: Partial<PrintLayout>): void {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) throw new Error('无法打开打印窗口，请允许弹出窗口后重试');
  win.document.open();
  win.document.write(buildSampleHtml(detail, layout, true));
  win.document.close();
}
