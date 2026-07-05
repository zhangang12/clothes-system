/**
 * UT-LOSS: 报价明细「含损金额」计算（客户报价设计稿公式）
 * 含损金额 = 人民币单价 × 报价耗用 × (1 + 损耗%)
 */
import { calcLossAmount } from '../quote.service';

describe('报价含损金额 (calcLossAmount)', () => {
  it('UT-LOSS-01: 损耗0% → 单价×耗用', () => {
    expect(calcLossAmount(28.5, 1.2, 0)).toBeCloseTo(28.5 * 1.2, 6);
  });

  it('UT-LOSS-02: 损耗3%（默认）', () => {
    // 28.50 × 1.20 × 1.03 = 35.226
    expect(calcLossAmount(28.5, 1.2, 3)).toBeCloseTo(28.5 * 1.2 * 1.03, 6);
  });

  it('UT-LOSS-03: 设计稿示例里料 18.20 × 0.40 × 1.03', () => {
    expect(calcLossAmount(18.2, 0.4, 3)).toBeCloseTo(18.2 * 0.4 * 1.03, 6);
  });

  it('UT-LOSS-04: 辅料无损耗 1.80 × 1 × 1 = 1.80', () => {
    expect(calcLossAmount(1.8, 1, 0)).toBeCloseTo(1.8, 6);
  });

  it('UT-LOSS-05: 损耗10%', () => {
    expect(calcLossAmount(10, 2, 10)).toBeCloseTo(10 * 2 * 1.1, 6);
  });

  it('UT-LOSS-06: 缺省参数按 0 处理', () => {
    expect(calcLossAmount()).toBe(0);
    expect(calcLossAmount(10)).toBe(0); // 耗用缺省=0
  });

  it('UT-LOSS-07: 大损耗率 50%', () => {
    expect(calcLossAmount(100, 1, 50)).toBeCloseTo(150, 6);
  });
});
