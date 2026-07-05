import { maskQuote, maskOrder, maskContract, maskSettlement } from '../field-mask';
import { UserRole } from '@i9/types';

describe('field-mask 字段级角色脱敏', () => {
  const quote = () => ({
    id: 1, rmb_total: 1000, usd_total: 140,
    items: [{ item_name: '面料', rmb_price: 8, usd_price: 1.1, loss_amount: 12 }],
    fees: [{ fee_name: '打样费', rmb_price: 50 }],
  });

  it('UT-MASK-01 版师(PATTERNMAKER) 看不到报价对客单价/合计', () => {
    const r = maskQuote(quote(), UserRole.PATTERNMAKER);
    expect(r.rmb_total).toBeNull();
    expect(r.usd_total).toBeNull();
    expect(r.items[0].rmb_price).toBeNull();
    expect(r.items[0].loss_amount).toBeNull();
    expect(r.items[0].item_name).toBe('面料'); // 非价字段保留
  });

  it('UT-MASK-02 打样(SAMPLE_MAKER) 同样脱敏，业务(BUSINESS)/管理正常可见', () => {
    expect(maskQuote(quote(), UserRole.SAMPLE_MAKER).rmb_total).toBeNull();
    expect(maskQuote(quote(), UserRole.BUSINESS).rmb_total).toBe(1000);
    expect(maskQuote(quote(), UserRole.ADMIN).items[0].rmb_price).toBe(8);
  });

  it('UT-MASK-03 分页 {items:[]} 载荷逐条脱敏', () => {
    const page = { items: [quote(), quote()], total: 2 };
    const r = maskQuote(page, UserRole.PATTERNMAKER);
    expect(r.items[0].rmb_total).toBeNull();
    expect(r.items[1].rmb_total).toBeNull();
    expect(r.total).toBe(2);
  });

  it('UT-MASK-04 合同供应商成本对版师/打样脱敏，业务可见', () => {
    const c = () => ({ id: 1, total_amount: 12000, materials: [{ item_name: '面料', unit_price: 8, amount: 12000 }] });
    expect(maskContract(c(), UserRole.PATTERNMAKER).materials[0].unit_price).toBeNull();
    expect(maskContract(c(), UserRole.BUSINESS).materials[0].unit_price).toBe(8);
  });

  it('UT-MASK-05 订单对客单价对版师/打样脱敏', () => {
    const o = () => ({ id: 1, unit_price: 12, total_amount: 12000 });
    expect(maskOrder(o(), UserRole.SAMPLE_MAKER).unit_price).toBeNull();
    expect(maskOrder(o(), UserRole.FINANCE).unit_price).toBe(12);
  });

  it('UT-MASK-06 结算成本/毛利仅财务/管理可见，业务被脱敏', () => {
    const s = () => ({ id: 1, settle_amount: 9000, gross_profit: 2000, net_profit: 1500, cost_per_unit_tax: 5 });
    // 财务/管理：可见
    expect(maskSettlement(s(), UserRole.FINANCE).gross_profit).toBe(2000);
    expect(maskSettlement(s(), UserRole.ADMIN).net_profit).toBe(1500);
    expect(maskSettlement(s(), UserRole.SUPERVISOR).cost_per_unit_tax).toBe(5);
    // 业务/版师：成本毛利脱敏，营收字段保留
    const biz = maskSettlement(s(), UserRole.BUSINESS);
    expect(biz.gross_profit).toBeNull();
    expect(biz.net_profit).toBeNull();
    expect(biz.cost_per_unit_tax).toBeNull();
    expect(biz.settle_amount).toBe(9000);
  });
});
