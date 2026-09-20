import { describe, it, expect } from 'vitest';
import { payableOf } from '../paymentExcel';

/**
 * B146：未付余额回退口径。后端建单时 actual_pay = amount − prepay_offset，
 * 老单 actual_pay 为空时前端退回 amount（不扣冲抵），于是列表/导出显示「未付 3000」、
 * 工厂账单显示 0——同一笔钱两个数。
 */
describe('payableOf 应付总额口径（B146）', () => {
  it('B146 actual_pay 有值时直接用它', () => {
    expect(payableOf({ actual_pay: '2500.00', amount: '3000', prepay_offset: '500' })).toBe(2500);
  });

  it('B146 老单 actual_pay 为空时按 amount − prepay_offset 回退，不能只退回 amount', () => {
    expect(payableOf({ actual_pay: null, amount: '3000', prepay_offset: '3000' })).toBe(0);
    expect(payableOf({ amount: '3000', prepay_offset: '500' })).toBe(2500);
  });

  it('B146 没有冲抵的老单退回申请金额', () => {
    expect(payableOf({ amount: '3000' })).toBe(3000);
  });

  it('B146 空行不炸，给 0', () => {
    expect(payableOf({})).toBe(0);
    expect(payableOf(null)).toBe(0);
  });

  it('B146 actual_pay 为 0 是合法值（全额冲抵），不能被 ?? 之外的假值判断吃掉', () => {
    expect(payableOf({ actual_pay: 0, amount: '3000', prepay_offset: '3000' })).toBe(0);
  });
});
