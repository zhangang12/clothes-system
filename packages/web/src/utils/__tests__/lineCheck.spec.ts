import { describe, it, expect } from 'vitest';
import { checkGoodsLines, isEmptyLine } from '../lineCheck';

const ok = (over = {}) => ({ item_name: '门襟拉链', qty: 105, color: '粉色', ...over });

describe('货物明细校验', () => {
  it('UT-GL-01: 全部合格时放行', () => {
    expect(checkGoodsLines([ok(), ok({ qty: 221 })])).toBeNull();
  });

  it('UT-GL-02: 一行都没有时提示至少 1 行', () => {
    expect(checkGoodsLines([])).toContain('至少 1 行');
  });

  it('UT-GL-03: 点名到第几行——原来只说「品名必填」，二三十行里没人找得到', () => {
    const msg = checkGoodsLines([ok(), ok(), { qty: 5, color: '黑' }])!;
    expect(msg).toContain('第 3 行');
    expect(msg).toContain('品名');
  });

  it('UT-GL-04: 数量不合格时把填的值原样带出来，好对照', () => {
    const msg = checkGoodsLines([ok({ qty: 0 })])!;
    expect(msg).toContain('第 1 行');
    expect(msg).toContain('0');
  });

  it('UT-GL-05: 空行说「删掉」而不是「去补品名」——它是多出来的，不是填错的', () => {
    const msg = checkGoodsLines([ok(), {}])!;
    expect(msg).toContain('第 2 行');
    expect(msg).toContain('空行');
    expect(msg).toContain('删除');
  });

  it('UT-GL-06: 空行与填错的行分开说，两种处理方式不一样', () => {
    const msg = checkGoodsLines([{}, { qty: 3 }])!;
    expect(msg).toContain('空行');
    expect(msg).toContain('品名');
  });

  it('UT-GL-07: 填了别的列但没填品名，算「填了一半」不算空行', () => {
    expect(isEmptyLine({ color: '黑色' })).toBe(false);
    const msg = checkGoodsLines([{ color: '黑色' }])!;
    expect(msg).toContain('品名');
    expect(msg).not.toContain('空行');
  });

  it('UT-GL-08: 空白字符不算填了内容', () => {
    expect(isEmptyLine({ item_name: '   ', qty: '' })).toBe(true);
  });

  it('UT-GL-09: 毛病多时最多点 3 行，并说明还有多少——列全了反而看不过来', () => {
    const rows = Array.from({ length: 6 }, () => ({ qty: 1 }));
    const msg = checkGoodsLines(rows)!;
    expect(msg).toContain('第 1 行');
    expect(msg).toContain('第 3 行');
    expect(msg).not.toContain('第 4 行');
    expect(msg).toContain('6');
  });

  it('UT-GL-10: 数量是文本时也拦下来（不会被当成 0 悄悄放过）', () => {
    const msg = checkGoodsLines([ok({ qty: '若干' })])!;
    expect(msg).toContain('若干');
  });
});

// ── 「填了一半会被静默丢掉」的行（8-26 举一反三查出：报价与样衣保存时
//    form.items.filter(i => i.itemName) 会把没填品名的行悄悄扔掉）──
import { halfFilledRows, halfFilledMessage } from '../lineCheck';

const QUOTE_TOUCHED = ['part', 'width', 'color', 'supplier', 'unit', 'quoteUsage', 'rmbPrice', 'remark'];

describe('填了一半的明细行', () => {
  it('UT-HF-01: 填了数量/颜色却没填品名 —— 必须揪出来，否则保存时被静默丢掉', () => {
    const rows = [{ itemName: '主面料', color: '黑' }, { color: '深灰', quoteUsage: '1.2' }];
    expect(halfFilledRows(rows, 'itemName', QUOTE_TOUCHED)).toEqual([2]);
  });

  it('UT-HF-02: 纯空行不算 —— 表单会自动补一行占位，丢掉它是对的', () => {
    const rows = [{ itemName: '主面料' }, { part: '', color: '', quoteUsage: '' }];
    expect(halfFilledRows(rows, 'itemName', QUOTE_TOUCHED)).toEqual([]);
  });

  it('UT-HF-03: 有默认值的列不参与判断（报价的 lossRate 自带统一损耗%）', () => {
    const rows = [{ itemName: '', lossRate: 3 }];
    expect(halfFilledRows(rows, 'itemName', QUOTE_TOUCHED)).toEqual([]);
  });

  it('UT-HF-04: 色组这类数组，空数组算没填、非空算填了', () => {
    expect(halfFilledRows([{ itemName: '', colorGroups: [] }], 'itemName', ['colorGroups'])).toEqual([]);
    expect(halfFilledRows([{ itemName: '', colorGroups: ['黑'] }], 'itemName', ['colorGroups'])).toEqual([1]);
  });

  it('UT-HF-05: 品名只有空格也算没填', () => {
    expect(halfFilledRows([{ itemName: '   ', color: '黑' }], 'itemName', QUOTE_TOUCHED)).toEqual([1]);
  });

  it('UT-HF-06: 提示里点名行号，并说清楚不补品名会丢数据', () => {
    const msg = halfFilledMessage('报价明细', [2, 5])!;
    expect(msg).toContain('第 2、5 行');
    expect(msg).toContain('丢掉');
  });

  it('UT-HF-07: 超过 3 行时只点前 3 行并给总数', () => {
    const msg = halfFilledMessage('材料明细', [1, 2, 3, 4, 5])!;
    expect(msg).toContain('第 1、2、3 行');
    expect(msg).toContain('5 行');
  });

  it('UT-HF-08: 没有问题行时不提示', () => {
    expect(halfFilledMessage('报价明细', [])).toBeNull();
  });
});
