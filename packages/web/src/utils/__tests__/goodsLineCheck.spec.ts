import { describe, it, expect } from 'vitest';
import { checkGoodsLines, isEmptyLine } from '../goodsLineCheck';

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
