// 样衣制作单打印/导出 PDF —— 浏览器原生打印（A4，可"另存为 PDF"，与 contractPrint 同模式）
// 对外单据脱敏：材料明细不含「参考价格」（设计稿：版师/外发单据不见价格）。
//
// 【材料明细的列可由用户自选与排序】(2026-08-07 反馈：「打出来没有成一行」「部位想拉到品名后面」
// 「成分/码带/克重这种可以不用打印，占格子」)。11 列铺在 A4 竖版上，品名/备注必然折行，
// 一条材料印成两行很难读。**根治办法是让用户砍掉用不上的列**——列少了自然就一行放得下，
// 所以这里把列抽成 SAMPLE_MAT_COLS，由调用方传入「要哪几列、按什么顺序」。

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const d10 = (v: unknown): string => (v ? esc(String(v).slice(0, 10)) : '—');
const dash = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : esc(v));

export interface MatCol {
  key: string;
  label: string;
  width?: number;              // 打印列宽(px)；不给则自适应（留给品名/备注这类长文本）
  align?: 'c' | 'r';           // 居中 / 右对齐；不给则左对齐
  get: (m: any, i: number) => string;
}

/** 材料明细可打印的全部列。**顺序 = 默认顺序**；用户自选的顺序覆盖它。 */
export const SAMPLE_MAT_COLS: MatCol[] = [
  { key: 'idx', label: '#', width: 32, align: 'c', get: (_m, i) => String(i + 1) },
  { key: 'item_name', label: '品名', get: (m) => dash(m.item_name) },
  { key: 'part', label: '部位', width: 64, align: 'c', get: (m) => dash(m.part) },
  { key: 'width', label: '门幅', width: 64, align: 'c', get: (m) => dash(m.width) },
  { key: 'colors', label: '颜色', width: 90, align: 'c', get: (m) => dash(m.colors) },
  { key: 'composition', label: '成份', width: 90, align: 'c', get: (m) => dash(m.composition) },
  { key: 'code_band', label: '码带', width: 60, align: 'c', get: (m) => dash(m.code_band) },
  { key: 'zipper_length', label: '拉链长度', width: 70, align: 'c', get: (m) => dash(m.zipper_length) },
  { key: 'puller', label: '拉头', width: 60, align: 'c', get: (m) => dash(m.puller) },
  { key: 'qty', label: '数量', width: 56, align: 'r', get: (m) => dash(m.qty) },
  { key: 'gram_weight', label: '克重', width: 64, align: 'c', get: (m) => dash(m.gram_weight) },
  { key: 'size', label: '尺寸', width: 80, align: 'c', get: (m) => dash(m.size) },
  { key: 'actual_usage', label: '实际耗用', width: 76, align: 'r', get: (m) => dash(m.actual_usage) },
  { key: 'supplier_name', label: '供应商', width: 110, get: (m) => dash(m.supplier_name) },
  { key: 'remark', label: '备注', get: (m) => dash(m.remark) },
];

/** 没配过时印哪些列：保持改造前的那 11 列，避免老用户打开发现单据变样 */
export const DEFAULT_MAT_COL_KEYS = [
  'idx', 'item_name', 'width', 'colors', 'part', 'composition',
  'code_band', 'qty', 'gram_weight', 'size', 'remark',
];

/** 按用户选的 key 列表取列定义；认不出的 key 直接忽略（列改名/删除后旧配置不至于印出空列） */
export function resolveMatCols(keys?: string[] | null): MatCol[] {
  const all = new Map(SAMPLE_MAT_COLS.map((c) => [c.key, c]));
  const picked = (keys?.length ? keys : DEFAULT_MAT_COL_KEYS)
    .map((k) => all.get(k))
    .filter(Boolean) as MatCol[];
  // 全被过滤光了就退回默认，别印出一张没有列的表
  return picked.length ? picked : (DEFAULT_MAT_COL_KEYS.map((k) => all.get(k)!).filter(Boolean));
}

export function printSample(detail: any, matColKeys?: string[] | null): void {
  const cats = String(detail.categories ?? '').split(',').filter(Boolean).join(' · ');

  // 寄样改多轮子表后，单号/日期落在轮次上，旧单值列不再回填：为空时取首轮（与 sampleExcel 同款兜底）
  const rounds: any[] = detail.shipRounds ?? [];
  const r1: any = rounds[0] ?? {};
  const shipDate = detail.ship_sample_date ?? r1.ship_date;
  const shipNo = detail.material_ship_no ?? r1.ship_no;

  const metaBlock = `
  <div class="meta">
    <div><b>客户款号：</b>${dash(detail.style_no)}</div>
    <div><b>样衣类别：</b>${cats || '—'}</div>
    <div><b>中间商：</b>${dash(detail.middleman_name)}</div>
    <div><b>最终买家：</b>${dash(detail.buyer_name)}</div>
    <div><b>制版师：</b>${dash(detail.patternmaker_name)}</div>
    <div><b>制单人：</b>${dash(detail.maker)}</div>
    <div><b>制单日期：</b>${d10(detail.make_date)}</div>
    <div><b>寄样日期：</b>${d10(shipDate)}</div>
    <div><b>收件人：</b>${dash(detail.recipient)}</div>
    <div><b>样衣编号：</b>${dash(detail.sample_no)}</div>
    <div><b>样衣尺码：</b>${dash(detail.sample_size)}</div>
    <div><b>样衣数量：</b>${detail.sample_qty != null && detail.sample_qty !== '' ? esc(detail.sample_qty) + ' 件' : '—'}</div>
  </div>`;

  // 材料明细（脱敏：不含参考价格）；列与顺序由调用方给定
  const mats: any[] = detail.materials ?? [];
  const cols = resolveMatCols(matColKeys);
  const tableHead = `<tr>${cols.map((c) =>
    `<th${c.width ? ` style="width:${c.width}px"` : ''}>${esc(c.label)}</th>`).join('')}</tr>`;
  let rows = mats.map((m, i) => `<tr>${cols.map((c) =>
    `<td${c.align ? ` class="${c.align}"` : ''}>${c.get(m, i)}</td>`).join('')}</tr>`).join('');
  if (!rows) rows = `<tr><td class="c" colspan="${cols.length}">（无材料明细）</td></tr>`;

  // 样衣照片/图稿（用户反馈：打印时直接显示在底部；image1/2/3 每槽可多图，逗号分隔）
  const photoUrls = [detail.image1, detail.image2, detail.image3]
    .flatMap((u) => String(u ?? '').split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  const photosBlock = photoUrls.length
    ? `<h3>样衣照片/图稿</h3><div class="photos">${photoUrls.map((u) => `<img src="${esc(u)}" alt="样衣图" />`).join('')}</div>`
    : '';

  const trackBlock = `
  <div class="meta">
    <div><b>材料寄出单号：</b>${dash(shipNo)}</div>
    <div><b>材料寄出日期：</b>${d10(shipDate)}</div>
    <div><b>寄回快递单号：</b>${dash(detail.return_no)}</div>
    <div><b>寄回日期：</b>${d10(detail.return_date)}</div>
    <div><b>件数：</b>${dash(detail.piece_count)}</div>
  </div>`;

  // 多轮寄样明细表（多轮时展开；脱敏：不含工价）
  const roundsTable = rounds.length > 1
    ? `<h3>寄样轮次</h3><table><thead><tr><th>轮次</th><th>尺码</th><th>件数</th><th>寄出日期</th><th>寄出单号</th><th>寄回日期</th><th>备注</th></tr></thead><tbody>${
      rounds.map((r, i) => `<tr><td class="c">${r.round_no ?? i + 1}</td><td class="c">${dash(r.size)}</td><td class="c">${dash(r.qty)}</td><td class="c">${d10(r.ship_date)}</td><td class="c">${dash(r.ship_no)}</td><td class="c">${d10(r.return_date)}</td><td>${dash(r.remark)}</td></tr>`).join('')
    }</tbody></table>`
    : '';

  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>样衣制作单-${esc(detail.sample_no)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family:"Microsoft YaHei","PingFang SC","Songti SC",sans-serif; color:#1a1a1a; font-size:12px; }
  .head { text-align:center; border-bottom:2px solid #1E3A5F; padding-bottom:8px; }
  .title { font-size:20px; font-weight:700; letter-spacing:3px; color:#1E3A5F; }
  .sub { font-size:12px; color:#666; margin-top:4px; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:2px 16px; margin:12px 0; }
  .meta b { color:#555; font-weight:600; }
  h3 { font-size:13px; color:#1E3A5F; margin:14px 0 4px; border-left:3px solid #D17A40; padding-left:6px; }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #ccc; padding:4px 6px; }
  th { background:#f2f5f8; color:#1E3A5F; font-weight:600; }
  /* 短值列（门幅/数量/克重这类）不折行，省得一条材料被挤成两行；
     品名/备注这种长文本仍允许换行，否则会顶破表格宽度 */
  td.c { text-align:center; white-space:nowrap; } td.r { text-align:right; white-space:nowrap; }
  td { word-break:break-word; }
  .remark { margin-top:8px; line-height:1.7; }
  .photos { display:flex; flex-wrap:wrap; gap:8px; }
  .photos img { max-width:250px; max-height:190px; object-fit:cover; border:1px solid #ddd; border-radius:4px; }
  @media screen { body { max-width:820px; margin:20px auto; } }
</style></head><body onload="window.print()">
  <div class="head">
    <div class="title">样衣制作单</div>
    <div class="sub">样衣编号：${esc(detail.sample_no)}</div>
  </div>

  <h3>基本信息</h3>
  ${metaBlock}

  <h3>材料明细</h3>
  <table><thead>${tableHead}</thead><tbody>${rows}</tbody></table>

  <h3>寄样跟踪</h3>
  ${trackBlock}
  ${roundsTable}
  ${detail.garment_remark ? `<h3>成衣备注</h3><div class="remark">${esc(detail.garment_remark)}</div>` : ''}
  ${photosBlock}
</body></html>`;

  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) throw new Error('无法打开打印窗口，请允许弹出窗口后重试');
  win.document.open();
  win.document.write(html);
  win.document.close();
}
