import { maskQuote, maskOrder, maskContract, maskSettlement, maskFactory } from '../field-mask';
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

  // B030：合同详情的成本价不只在顶层——盖章快照、发货批次、批次物料行里都有
  const stampedContract = () => ({
    id: 1, total_amount: 12000,
    materials: [{ item_name: '面料', unit_price: 8, amount: 12000 }],
    snapshot_json: {
      contract_no: 'HT-1', total_amount: 12000,
      materials: [{ item_name: '面料', unit_price: 8, qty: 1500, amount: 12000 }],
    },
    shipments: [{
      id: 3, qty: 500, snapshot_unit_price: 8, amount: 4000, ship_no: 'FH-1',
      items: [{ item_name: '面料', qty: 500, unit_price: 8, amount: 4000 }],
    }],
  });

  it('B030 版师查已盖章合同：快照 / 发货批次 / 批次物料行里的单价与金额一并抹掉，数量与单号保留', () => {
    const r = maskContract(stampedContract(), UserRole.PATTERNMAKER);
    expect(r.snapshot_json.total_amount).toBeNull();
    expect(r.snapshot_json.materials[0].unit_price).toBeNull();
    expect(r.snapshot_json.materials[0].amount).toBeNull();
    expect(r.snapshot_json.materials[0].qty).toBe(1500);
    expect(r.snapshot_json.contract_no).toBe('HT-1');
    expect(r.shipments[0].amount).toBeNull();
    expect(r.shipments[0].snapshot_unit_price).toBeNull();
    expect(r.shipments[0].qty).toBe(500);
    expect(r.shipments[0].ship_no).toBe('FH-1');
    expect(r.shipments[0].items[0].unit_price).toBeNull();
    expect(r.shipments[0].items[0].amount).toBeNull();
    expect(r.shipments[0].items[0].qty).toBe(500);
  });

  it('B030 业务/财务看已盖章合同不受影响；列表分页里每条的快照同样抹', () => {
    const biz = maskContract(stampedContract(), UserRole.BUSINESS);
    expect(biz.snapshot_json.materials[0].unit_price).toBe(8);
    expect(biz.shipments[0].amount).toBe(4000);
    const page = maskContract({ items: [stampedContract(), stampedContract()], total: 2 }, UserRole.SAMPLE_MAKER);
    expect(page.items[1].snapshot_json.materials[0].unit_price).toBeNull();
    expect(page.items[1].shipments[0].items[0].unit_price).toBeNull();
  });

  it('B030 快照是字符串时先解析再抹；解析不了整体抹掉，不原样放出去', () => {
    const s = { id: 1, snapshot_json: JSON.stringify({ total_amount: 5, materials: [{ unit_price: 3, qty: 1 }] }) };
    const r = maskContract(s, UserRole.PATTERNMAKER);
    expect(r.snapshot_json.materials[0].unit_price).toBeNull();
    expect(r.snapshot_json.materials[0].qty).toBe(1);
    expect(maskContract({ id: 2, snapshot_json: '{broken' }, UserRole.PATTERNMAKER).snapshot_json).toBeNull();
    // 没快照/没批次的草稿合同照常不炸
    expect(maskContract({ id: 3, total_amount: 1, snapshot_json: null }, UserRole.PATTERNMAKER).total_amount).toBeNull();
  });

  it('B030 price-hint 扁平行的 unit_price 对版师也抹', () => {
    const rows = [{ item_name: '面料', unit_price: 8, contract_no: 'HT-1', type: 'MATERIAL' }];
    expect(maskContract(rows, UserRole.PATTERNMAKER)[0].unit_price).toBeNull();
    expect(maskContract(rows, UserRole.PATTERNMAKER)[0].contract_no).toBe('HT-1');
  });

  it('B030 工厂银行账号/税号/开票联系方式对版师/打样脱敏（两套账号都抹），业务与财务照常可见', () => {
    const f = () => ({
      id: 7, name: '面料厂A', contact_name: '张三', contact_phone: '13800000000', address: '苏州',
      bank_name: '工行', bank_account: '6222000000000000', tax_no: '91320000MA1', invoice_phone: '0512', invoice_address: '开票地址',
      bank_name2: '农行', bank_account2: '6228000000000000', tax_no2: 'T2', invoice_phone2: 'P2', invoice_address2: 'A2',
    });
    const r = maskFactory(f(), UserRole.PATTERNMAKER);
    for (const k of ['bank_account', 'bank_account2', 'tax_no', 'tax_no2',
      'invoice_phone', 'invoice_phone2', 'invoice_address', 'invoice_address2']) {
      expect(r[k]).toBeNull();
    }
    // 常规档案资料照常可见（别顺手把页面抹空）
    expect(r.name).toBe('面料厂A');
    expect(r.contact_phone).toBe('13800000000');
    expect(r.address).toBe('苏州');
    expect(r.bank_name).toBe('工行');
    expect(maskFactory(f(), UserRole.SAMPLE_MAKER).bank_account).toBeNull();
    expect(maskFactory(f(), UserRole.BUSINESS).bank_account).toBe('6222000000000000');
    expect(maskFactory(f(), UserRole.FINANCE).tax_no).toBe('91320000MA1');
    expect(maskFactory({ items: [f()], total: 1 }, UserRole.PATTERNMAKER).items[0].tax_no).toBeNull();
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
