import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElMessage } from 'element-plus';
import { exportAll, csvCell, EXPORT_ALL_MAX_PAGES } from '../exportAll';

/** 抓住写进 Blob 的 CSV 文本 */
let captured = '';
const OrigBlob = globalThis.Blob;

beforeEach(() => {
  captured = '';
  // @ts-expect-error 测试替身
  globalThis.Blob = class { constructor(parts: any[]) { captured = parts.join(''); } };
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
  vi.restoreAllMocks();
});

describe('csvCell（B143 公式注入）', () => {
  it('B143 = + - @ 开头的文本前加单引号，Excel 按文本显示', () => {
    expect(csvCell('+86-13800138000')).toBe(`"'+86-13800138000"`);
    expect(csvCell('-待定')).toBe(`"'-待定"`);
    expect(csvCell('=HYPERLINK("http://x","点我")')).toContain(`"'=HYPERLINK`);
    expect(csvCell('@somebody')).toBe(`"'@somebody"`);
  });

  it('B143 真数字不加引号前缀，负数金额还是负数', () => {
    expect(csvCell(-5)).toBe('"-5"');
    expect(csvCell('+3.2')).toBe('"+3.2"');
    expect(csvCell(12.5)).toBe('"12.5"');
  });

  it('双引号照旧转义，空值出空串', () => {
    expect(csvCell('5" 拉链')).toBe('"5"" 拉链"');
    expect(csvCell(null)).toBe('""');
  });
});

describe('exportAll 逐页拉取', () => {
  const COLS = [{ key: 'name', title: '名称' }];

  it('拉完所有页后合成 CSV', async () => {
    const fetchPage = vi.fn(async (p: number) => ({
      data: p === 1 ? Array.from({ length: 100 }, (_, i) => ({ name: `A${i}` })) : [{ name: 'B0' }],
      total: 101,
    }));
    const n = await exportAll(fetchPage as any, COLS, '工厂资料');
    expect(n).toBe(101);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(captured).toContain('"名称"');
    expect(captured).toContain('"B0"');
  });

  it('B143 被 1 万条封顶截断时明确告警，不能静默少一截', async () => {
    const warn = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ id: '' } as any));
    const fetchPage = vi.fn(async () => ({
      data: Array.from({ length: 100 }, (_, i) => ({ name: `X${i}` })),
      total: 50000,
    }));
    const n = await exportAll(fetchPage as any, COLS, '客户资料');
    expect(n).toBe(EXPORT_ALL_MAX_PAGES * 100);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('只导出了前'));
  });

  it('B143 没截断时不多嘴告警', async () => {
    const warn = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ id: '' } as any));
    await exportAll((async () => ({ data: [{ name: 'a' }], total: 1 })) as any, COLS, 'x');
    expect(warn).not.toHaveBeenCalled();
  });

  afterEach(() => { globalThis.Blob = OrigBlob; });
});
