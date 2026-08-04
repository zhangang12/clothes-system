import { describe, it, expect } from 'vitest';
import { currencySymbol, money, fxPriceLabel } from '../currency';

describe('currency（2026-08-04 反馈 #13）', () => {
  it('CNY 是 ￥——币种字典发的是 CNY 不是 RMB，这是回归的根源', () => {
    expect(currencySymbol('CNY')).toBe('￥');
    expect(currencySymbol('RMB')).toBe('￥'); // 老数据兜底
  });
  it('常见币种符号正确', () => {
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('EUR')).toBe('€');
  });
  it('不认识的币种回退成代码本身，而不是错误地显示 $', () => {
    expect(currencySymbol('SEK')).toBe('SEK');
  });
  it('空值不炸', () => {
    expect(currencySymbol(undefined)).toBe('');
    expect(currencySymbol(null)).toBe('');
  });
  it('大小写与空白容错', () => {
    expect(currencySymbol(' cny ')).toBe('￥');
  });
  it('money 拼符号；非数字给 -', () => {
    expect(money(1234.5, 'CNY')).toBe('￥1234.50');
    expect(money('abc', 'USD')).toBe('-');
    expect(money(null, 'USD')).toBe('-');
  });
  it('列头跟随币种，不再写死「美金单价」', () => {
    expect(fxPriceLabel('CNY')).toBe('CNY单价');
    expect(fxPriceLabel('USD')).toBe('USD单价');
    expect(fxPriceLabel('')).toBe('外币单价');
  });
});
