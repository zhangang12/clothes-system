/**
 * UT-LOSS-01~11: 损耗率计算逻辑单元测试
 * 含损单价公式: loss_price = unit_price ÷ (1 - loss_rate / 100)
 */

// Extract pure functions from service for isolated testing
function calcLossPrice(unitPrice: number, lossRate: number): number {
  if (lossRate <= 0 || lossRate >= 100) return unitPrice;
  return unitPrice / (1 - lossRate / 100);
}

function calcItemFields(item: { unit_price: number; loss_rate?: number; usage_qty?: number }, globalLossRate = 0) {
  const effectiveLossRate = item.loss_rate ?? globalLossRate;
  const lossPrice = calcLossPrice(item.unit_price, effectiveLossRate);
  const totalUsage = item.usage_qty != null ? item.usage_qty / (1 - effectiveLossRate / 100) : null;
  const subtotal = totalUsage != null ? lossPrice * totalUsage : null;
  return {
    loss_rate: effectiveLossRate,
    loss_price: +lossPrice.toFixed(4),
    total_usage: totalUsage != null ? +totalUsage.toFixed(4) : null,
    subtotal: subtotal != null ? +subtotal.toFixed(4) : null,
  };
}

describe('损耗率计算 (calcLossPrice)', () => {
  it('UT-LOSS-01: 损耗率0时原价返回原价', () => {
    expect(calcLossPrice(10, 0)).toBe(10);
  });

  it('UT-LOSS-02: 损耗率5% → 原价÷(1-0.05)', () => {
    const result = calcLossPrice(10, 5);
    expect(result).toBeCloseTo(10 / 0.95, 6);
  });

  it('UT-LOSS-03: 损耗率10%', () => {
    const result = calcLossPrice(100, 10);
    expect(result).toBeCloseTo(100 / 0.9, 6);
  });

  it('UT-LOSS-04: 损耗率20%', () => {
    const result = calcLossPrice(50, 20);
    expect(result).toBeCloseTo(50 / 0.8, 6);
  });

  it('UT-LOSS-05: 负数损耗率当0处理（不增加成本）', () => {
    expect(calcLossPrice(10, -5)).toBe(10);
  });

  it('UT-LOSS-06: 损耗率>=100不允许（防除0），原价返回', () => {
    expect(calcLossPrice(10, 100)).toBe(10);
    expect(calcLossPrice(10, 110)).toBe(10);
  });
});

describe('报价项目字段计算 (calcItemFields)', () => {
  it('UT-LOSS-07: 无用量时subtotal和total_usage为null', () => {
    const result = calcItemFields({ unit_price: 12.5, loss_rate: 5 });
    expect(result.subtotal).toBeNull();
    expect(result.total_usage).toBeNull();
    expect(result.loss_price).toBeCloseTo(12.5 / 0.95, 4);
  });

  it('UT-LOSS-08: 有用量时subtotal=loss_price*total_usage', () => {
    const result = calcItemFields({ unit_price: 10, loss_rate: 10, usage_qty: 1 });
    const expectedLossPrice = 10 / 0.9;
    const expectedTotalUsage = 1 / 0.9;
    expect(result.loss_price).toBeCloseTo(expectedLossPrice, 4);
    expect(result.total_usage).toBeCloseTo(expectedTotalUsage, 4);
    expect(result.subtotal).toBeCloseTo(expectedLossPrice * expectedTotalUsage, 4);
  });

  it('UT-LOSS-09: 使用全局损耗率（item无loss_rate时）', () => {
    const result = calcItemFields({ unit_price: 20, usage_qty: 2 }, 5);
    expect(result.loss_rate).toBe(5);
    expect(result.loss_price).toBeCloseTo(20 / 0.95, 4);
  });

  it('UT-LOSS-10: item损耗率覆盖全局损耗率', () => {
    const result = calcItemFields({ unit_price: 20, loss_rate: 10, usage_qty: 2 }, 5);
    expect(result.loss_rate).toBe(10);
    expect(result.loss_price).toBeCloseTo(20 / 0.9, 4);
  });

  it('UT-LOSS-11: 精度保留4位小数', () => {
    const result = calcItemFields({ unit_price: 7, loss_rate: 3, usage_qty: 1.5 });
    const lp = 7 / 0.97;
    const tu = 1.5 / 0.97;
    expect(result.loss_price).toBe(+lp.toFixed(4));
    expect(result.total_usage).toBe(+tu.toFixed(4));
    expect(result.subtotal).toBe(+(lp * tu).toFixed(4));
  });
});
