import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportSampleExcel } from '../sampleExcel';

// 抓取写入 Blob 的内容，断言导出的工作表实际含哪些数据
function exportedHtml(detail: any): string {
  let captured = '';
  const OrigBlob = globalThis.Blob;
  // @ts-expect-error 测试替身
  globalThis.Blob = class { constructor(parts: any[]) { captured = parts.join(''); } };
  try { exportSampleExcel(detail); } finally { globalThis.Blob = OrigBlob; }
  return captured;
}

const base = {
  sample_no: 'S-20260715-001',
  style_no: 'I27.230.03929',
  categories: '上衣,外套',
  materials: [{ item_name: '面料A', qty: 3, supplier_name: '苏州市坤业纺织有限公司' }],
};

const rounds = [
  { round_no: 1, size: 'M', qty: 2, ship_date: '2026-07-08', ship_no: 'FH-001', return_date: '2026-07-10', labor_unit_price: 30, labor_amount: 60 },
  { round_no: 2, size: 'L', qty: 3, ship_date: '2026-07-12', ship_no: 'FH-002', return_date: '2026-07-14', labor_unit_price: 30, labor_amount: 90 },
];

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});

describe('样衣导出 Excel', () => {
  it('中文用 BOM、款号强制文本（防 Excel 把款号当数字截断）', () => {
    const html = exportedHtml(base);
    expect(html.charCodeAt(0)).toBe(0xfeff);
    expect(html).toContain('mso-number-format');
    expect(html).toContain('I27.230.03929');
  });

  it('多轮寄样：每轮的尺码/单号/工价都进导出，并给出合计', () => {
    const html = exportedHtml({ ...base, piece_count: 5, shipRounds: rounds });
    expect(html).toContain('寄样跟踪');
    expect(html).toContain('FH-001');
    expect(html).toContain('FH-002');
    expect(html).toContain('2026-07-14');
    // 合计：件数 2+3、工价 60+90
    expect(html).toMatch(/合计<\/td><td class="k">5</);
    expect(html).toMatch(/<td class="k">150<\/td>/);
  });

  it('多轮时基本信息的寄样日期/寄出单号回落到首轮（旧单值列已不再回填）', () => {
    const html = exportedHtml({ ...base, material_ship_no: null, ship_sample_date: null, shipRounds: rounds });
    expect(/材料寄出单号<\/td><td>([^<]*)</.exec(html)?.[1]).toBe('FH-001');
    expect(/寄样日期<\/td><td>([^<]*)</.exec(html)?.[1]).toBe('2026-07-08');
  });

  it('旧数据（无轮次）仍按原单值字段导出，不出现寄样跟踪表', () => {
    const html = exportedHtml({ ...base, material_ship_no: 'OLD-9', ship_sample_date: '2026-06-01', piece_count: 4 });
    expect(html).not.toContain('寄样跟踪');
    expect(/材料寄出单号<\/td><td>([^<]*)</.exec(html)?.[1]).toBe('OLD-9');
    expect(/寄样日期<\/td><td>([^<]*)</.exec(html)?.[1]).toBe('2026-06-01');
  });

  it('无材料明细时给出占位而不是空表', () => {
    expect(exportedHtml({ sample_no: 'S-1' })).toContain('（无材料明细）');
  });
});
