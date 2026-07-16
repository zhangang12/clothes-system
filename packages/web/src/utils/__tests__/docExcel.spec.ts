import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildDocXls, sum, n2, d10, val, type Block } from '../docExcel';
import { exportQuoteExcel } from '../quoteExcel';

// 抓取写入 Blob 的内容，断言导出的工作表实际含哪些数据（同 sampleExcel.spec 的套路）
function exportedHtml(fn: () => void): string {
  let captured = '';
  const OrigBlob = globalThis.Blob;
  // @ts-expect-error 测试替身
  globalThis.Blob = class { constructor(parts: any[]) { captured = parts.join(''); } };
  try { fn(); } finally { globalThis.Blob = OrigBlob; }
  return captured;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});

describe('docExcel 公共层', () => {
  it('款号强制文本 + 工作表名进 x:Name（防 Excel 截断款号 / 标签页乱码）', () => {
    const html = buildDocXls({ sheetName: '报价Q1', title: 'T', blocks: [] });
    expect(html).toContain('mso-number-format');
    expect(html).toContain('<x:Name>报价Q1</x:Name>');
  });

  it('kv 区按 perRow 排版，末行不足时补空单元格（否则 Excel 里表格右边缺一块）', () => {
    const b: Block = { kind: 'kv', perRow: 2, pairs: [['a', 1], ['b', 2], ['c', 3]] };
    const html = buildDocXls({ sheetName: 's', title: 't', blocks: [b] });
    const rows = html.match(/<tr>(?:(?!<\/tr>).)*<\/tr>/g) ?? [];
    // 标题行 + 2 个数据行；末行 c 之后应补一对空单元格，使每行都是 4 个 td
    const dataRows = rows.filter((r) => /class="k">[abc]</.test(r));
    expect(dataRows).toHaveLength(2);
    for (const r of dataRows) expect((r.match(/<td/g) ?? [])).toHaveLength(4);
  });

  it('table 区无数据时给占位行而不是空表', () => {
    const b: Block = { kind: 'table', head: ['x', 'y'], rows: [], empty: '（没有）' };
    expect(buildDocXls({ sheetName: 's', title: 't', blocks: [b] })).toContain('（没有）');
  });

  it('HTML 特殊字符转义，不破坏表格结构', () => {
    const b: Block = { kind: 'table', head: ['h'], rows: [['<script>&"']] };
    const html = buildDocXls({ sheetName: 's', title: 't', blocks: [b] });
    expect(html).toContain('&lt;script&gt;&amp;');
    expect(html).not.toContain('<script>');
  });

  it('sum 忽略非数字并消掉浮点尾数', () => {
    expect(sum([{ v: 0.1 }, { v: 0.2 }, { v: null }, { v: 'x' }], (r) => r.v)).toBe(0.3);
  });

  it('n2/d10/val 对空值给空串而不是 NaN/undefined', () => {
    expect(n2(null)).toBe('');
    expect(n2('abc')).toBe('');
    expect(d10(null)).toBe('');
    expect(d10('2026-07-16T08:00:00.000Z')).toBe('2026-07-16');
    expect(val(undefined)).toBe('');
    expect(val(0)).toBe('0');
  });
});

describe('报价单导出 Excel', () => {
  const base = {
    quote_no: 'C026063001',
    style_no: 'I27.230.03929',
    middleman_name: 'CTM099',
    buyer_name: 'ARGENTINA 买家',
    profit_rate: 12,
    rmb_total: 45000,
    usd_total: 6923.08,
    items: [
      { part: '面', item_name: '面料A', quote_usage: 1.2, rmb_price: 30, loss_amount: 36 },
      { part: '里', item_name: '里布B', quote_usage: 0.8, rmb_price: 10, loss_amount: 8 },
    ],
  };

  it('BOM + 款号强制文本', () => {
    const html = exportedHtml(() => exportQuoteExcel(base));
    expect(html.charCodeAt(0)).toBe(0xfeff);
    expect(html).toContain('I27.230.03929');
    expect(html).toContain('mso-number-format');
  });

  it('明细逐行导出并给出含损金额合计', () => {
    const html = exportedHtml(() => exportQuoteExcel(base));
    expect(html).toContain('面料A');
    expect(html).toContain('里布B');
    expect(html).toMatch(/<td class="k">44\.00<\/td>/); // 36 + 8
  });

  it('业务要求全量不脱敏：中间商/买家/利润率都在导出件里', () => {
    const html = exportedHtml(() => exportQuoteExcel(base));
    expect(html).toContain('CTM099');
    expect(html).toContain('ARGENTINA 买家');
    expect(html).toContain('12%');
  });

  it('费用金额 = 单价 × 数量，数量缺省按 1（与 quotePrint 口径一致）', () => {
    const html = exportedHtml(() => exportQuoteExcel({
      ...base,
      fees: [{ fee_name: '快递费', rmb_price: 50 }, { fee_name: '打样费', rmb_price: 100, quote_usage: 2 }],
    }));
    expect(html).toContain('费用明细');
    // 50×1 + 100×2 = 250
    expect(html).toMatch(/<td class="k">250\.00<\/td>/);
  });

  it('无费用时不输出空的费用明细表', () => {
    expect(exportedHtml(() => exportQuoteExcel(base))).not.toContain('费用明细');
  });

  it('无报价明细时给占位而不是空表', () => {
    expect(exportedHtml(() => exportQuoteExcel({ quote_no: 'Q1' }))).toContain('（无报价明细）');
  });
});
