// 单据导出 Excel 的公共层 —— 无第三方依赖(项目零新增依赖约定):生成 Excel 可直接打开的
// HTML 工作表(.xls)。各单据(样衣/报价/合同/对账/付款/结算)只声明自己的区块结构,
// 以下三个坑一次性收在这里,不再各写一遍:
//   1. UTF-8 BOM + meta —— 否则 Excel 按 GBK 打开,中文全乱码;
//   2. 单元格 mso-number-format:"\@" —— 强制文本,否则款号(如 I27.230.03929)被当数字截断;
//   3. <x:Name> 工作表名 —— 否则 Excel 里标签页叫一串乱码文件名。

const BOM = String.fromCharCode(0xfeff);

export const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 日期取前 10 位(后端回的是 ISO 串,Excel 里不需要时分秒) */
export const d10 = (v: unknown): string => (v ? String(v).slice(0, 10) : '');

/** 空值渲染成空单元格而不是 "null"/"undefined" */
export const val = (v: unknown): string => (v === null || v === undefined ? '' : esc(v));

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

export function downloadXls(html: string, filename: string): void {
  const blob = new Blob([BOM + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 组装 + 落盘:各单据导出器的统一出口 */
export function exportDocExcel(opts: {
  sheetName: string;
  title: string;
  filename: string;
  blocks: Block[];
}): void {
  downloadXls(buildDocXls({ sheetName: opts.sheetName, title: opts.title, blocks: opts.blocks }), opts.filename);
}
