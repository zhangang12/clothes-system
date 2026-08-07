import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveMatCols, SAMPLE_MAT_COLS, DEFAULT_MAT_COL_KEYS, printSample } from '../samplePrint';
import { loadPrintCols, savePrintCols, resetPrintCols } from '../printCols';

// 打印是开新窗口写 HTML，这里把 window.open 打桩，直接断言写进去的那段 HTML
function printedHtml(detail: any, cols?: string[] | null): string {
  let html = '';
  const win: any = { document: { open: vi.fn(), write: (h: string) => { html = h; }, close: vi.fn() } };
  vi.stubGlobal('open', vi.fn().mockReturnValue(win));
  printSample(detail, cols);
  return html;
}
/** 取出材料明细那张表的表头文字，按出现顺序 */
function headOf(html: string): string[] {
  const table = html.split('材料明细')[1] ?? '';
  // 注意 (?:\s[^>]*)? 而不是 [^>]*：后者会把 <thead> 也当成 <th 开头的标签匹配进来
  return [...table.matchAll(/<th(?:\s[^>]*)?>(.*?)<\/th>/g)].map((m) => m[1]);
}

const detail = {
  sample_no: 'S-1', materials: [
    { item_name: '春亚纺', part: '大身', width: '145', composition: '涤 100%', qty: 3, remark: 'r' },
  ],
};

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('resolveMatCols 打印列解析', () => {
  it('不传就用默认列（老用户打开不该发现单据变了样）', () => {
    expect(resolveMatCols(null).map((c) => c.key)).toEqual(DEFAULT_MAT_COL_KEYS);
    expect(resolveMatCols([]).map((c) => c.key)).toEqual(DEFAULT_MAT_COL_KEYS);
  });

  it('按给定顺序出列——「部位拉到品名后面」正是用户要的', () => {
    expect(resolveMatCols(['idx', 'item_name', 'part', 'qty']).map((c) => c.key))
      .toEqual(['idx', 'item_name', 'part', 'qty']);
  });

  it('认不出的 key 忽略掉，不印出空列（列改名/删除后旧配置仍能用）', () => {
    expect(resolveMatCols(['item_name', 'no_such_col', 'qty']).map((c) => c.key))
      .toEqual(['item_name', 'qty']);
  });

  it('全是无效 key 时退回默认，绝不产出一张没有列的表', () => {
    expect(resolveMatCols(['zzz', 'yyy']).map((c) => c.key)).toEqual(DEFAULT_MAT_COL_KEYS);
  });

  it('默认列必须都在全集里（防以后加列时写错 key）', () => {
    const all = new Set(SAMPLE_MAT_COLS.map((c) => c.key));
    for (const k of DEFAULT_MAT_COL_KEYS) expect(all.has(k)).toBe(true);
  });
});

describe('printSample 按配置出表头', () => {
  it('砍掉成份/码带/克重后，表头里就没有它们了（用户原话：占格子）', () => {
    const head = headOf(printedHtml(detail, ['idx', 'item_name', 'part', 'qty', 'remark']));
    expect(head).toEqual(['#', '品名', '部位', '数量', '备注']);
    expect(head).not.toContain('成份');
    expect(head).not.toContain('码带');
    expect(head).not.toContain('克重');
  });

  it('列顺序按配置走：部位排在品名之后', () => {
    const head = headOf(printedHtml(detail, ['item_name', 'part']));
    expect(head.indexOf('部位')).toBeGreaterThan(head.indexOf('品名'));
  });

  it('数据单元格跟着表头一起减少，不错位', () => {
    const html = printedHtml(detail, ['item_name', 'part']);
    const body = html.split('<tbody>')[1].split('</tbody>')[0];
    expect([...body.matchAll(/<td/g)]).toHaveLength(2);
    expect(body).toContain('春亚纺');
    expect(body).toContain('大身');
    expect(body).not.toContain('涤 100%'); // 成份没选，不该出现
  });

  it('无材料明细时占位行的 colspan 跟着列数走', () => {
    const html = printedHtml({ sample_no: 'S-1', materials: [] }, ['item_name', 'part', 'qty']);
    expect(html).toContain('colspan="3"');
    expect(html).toContain('（无材料明细）');
  });
});

describe('printCols 本机偏好', () => {
  it('存了能读回来', () => {
    savePrintCols('sample', ['item_name', 'qty']);
    expect(loadPrintCols('sample')).toEqual(['item_name', 'qty']);
  });

  it('没配过返回 null（调用方据此退回默认列）', () => {
    expect(loadPrintCols('sample')).toBeNull();
  });

  it('存坏了当没配过，不让打印崩掉', () => {
    localStorage.setItem('i9.printCols.sample', 'not json');
    expect(loadPrintCols('sample')).toBeNull();
    localStorage.setItem('i9.printCols.sample', '{"a":1}');
    expect(loadPrintCols('sample')).toBeNull();
    localStorage.setItem('i9.printCols.sample', '[1,2]'); // 不是字符串数组
    expect(loadPrintCols('sample')).toBeNull();
  });

  it('恢复默认后读回 null', () => {
    savePrintCols('sample', ['item_name']);
    resetPrintCols('sample');
    expect(loadPrintCols('sample')).toBeNull();
  });

  it('不同单据互不干扰', () => {
    savePrintCols('sample', ['item_name']);
    expect(loadPrintCols('contract')).toBeNull();
  });
});
