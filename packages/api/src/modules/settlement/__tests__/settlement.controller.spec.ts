import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SettlementController, maskCostPreview } from '../settlement.controller';
import { AddCostDto } from '../dto/add-cost.dto';
import { CreateCostLineDto } from '../dto/create-settlement.dto';
import { UserRole } from '@i9/types';

/**
 * 2026-09-20 审查 B080/B081/B136：
 *  - cost-preview 与 登记回款 / 建单 的响应要过与列表/详情同一份脱敏（业务/船务不见成本与毛利）；
 *  - 成本行税率限 0~100（-100 会除以 0）。
 */
const full = () => ({
  id: 1, settlement_no: 'JS-1', goods_amount_tax: 11300, goods_amount_extax: 10000,
  gross_profit: 4000, net_profit: 3000, settle_amount: 14000, receipt_usd: 2000,
  costs: [{ id: 9, cost_name: '对账 DZ-1', amount: 11300, unit_price: 11.3, supplier_name: '甲厂' }],
});
const req = (role: string) => ({ user: { id: 3, role } });

describe('SettlementController 脱敏', () => {
  const service: any = {
    addReceipt: jest.fn(async () => full()),
    create: jest.fn(async () => full()),
    previewCosts: jest.fn(async () => ({
      style_no: 'V27', currency: 'USD', paid_tax: 11300, unpaid_tax: 500, unpaid_count: 1,
      rows: [{ cost_name: '对账 DZ-1', amount: 11300, unit_price: 11.3, supplier_name: '甲厂', reconcile_no: 'DZ-1', pay_status: 'PAID' }],
    })),
  };
  const ctrl = new SettlementController(service);

  it('B081 业务登记回款：响应里毛利/净利/总货款/成本行金额被抹掉，收汇金额与结算单号照给', async () => {
    const res: any = await ctrl.addReceipt(1, { amount: 100, receipt_date: '2026-09-20' } as any, req(UserRole.BUSINESS));
    expect(res.gross_profit).toBeNull();
    expect(res.net_profit).toBeNull();
    expect(res.goods_amount_tax).toBeNull();
    expect(res.costs[0].amount).toBeNull();
    expect(res.costs[0].unit_price).toBeNull();
    expect(res.receipt_usd).toBe(2000);
    expect(res.settlement_no).toBe('JS-1');
  });

  it('B081 船务登记回款同样脱敏；财务/管理员/主管原样返回', async () => {
    const ship: any = await ctrl.addReceipt(1, {} as any, req(UserRole.SHIPPING));
    expect(ship.gross_profit).toBeNull();
    for (const role of [UserRole.FINANCE, UserRole.ADMIN, UserRole.SUPERVISOR]) {
      const res: any = await ctrl.addReceipt(1, {} as any, req(role));
      expect(res.gross_profit).toBe(4000);
      expect(res.costs[0].amount).toBe(11300);
    }
  });

  it('B081 同类：业务建单的响应也过脱敏（此前是完整实体）', async () => {
    const res: any = await ctrl.create({ order_id: 10 } as any, req(UserRole.BUSINESS));
    expect(res.gross_profit).toBeNull();
    expect(res.id).toBe(1);
    const fin: any = await ctrl.create({ order_id: 10 } as any, req(UserRole.FINANCE));
    expect(fin.gross_profit).toBe(4000);
  });

  it('B080 业务看成本预览：各供应商对账金额/单价与合计抹掉，行名/供应商/单号/付款状态照给', async () => {
    const res: any = await ctrl.costPreview(10, req(UserRole.BUSINESS));
    expect(res.rows[0]).toMatchObject({ cost_name: '对账 DZ-1', supplier_name: '甲厂', reconcile_no: 'DZ-1', pay_status: 'PAID', amount: null, unit_price: null });
    expect(res.paid_tax).toBeNull();
    expect(res.unpaid_tax).toBeNull();
    expect(res.unpaid_count).toBeNull();
    expect(res.style_no).toBe('V27');
  });

  it('B080 财务/管理员/主管看成本预览原样', async () => {
    for (const role of [UserRole.FINANCE, UserRole.ADMIN, UserRole.SUPERVISOR]) {
      const res: any = await ctrl.costPreview(10, req(role));
      expect(res.rows[0].amount).toBe(11300);
      expect(res.paid_tax).toBe(11300);
    }
  });

  it('maskCostPreview 对空/非对象载荷不炸', () => {
    expect(maskCostPreview(null, UserRole.BUSINESS)).toBeNull();
    expect(maskCostPreview({ rows: undefined }, UserRole.BUSINESS)).toEqual({ rows: undefined });
  });
});

describe('B136 成本行税率 0~100', () => {
  const fieldsOf = async (cls: any, body: any) =>
    (await validate(plainToInstance(cls, body) as object)).map((e) => e.property);

  it('AddCostDto：-100 / 101 拒，0 / 13 / 100 通过；缺省不传也通过', async () => {
    expect(await fieldsOf(AddCostDto, { cost_name: '运费', amount: 100, tax_rate: -100 })).toContain('tax_rate');
    expect(await fieldsOf(AddCostDto, { cost_name: '运费', amount: 100, tax_rate: 101 })).toContain('tax_rate');
    for (const ok of [0, 13, 100]) expect(await fieldsOf(AddCostDto, { cost_name: '运费', amount: 100, tax_rate: ok })).toEqual([]);
    expect(await fieldsOf(AddCostDto, { cost_name: '运费', amount: -50 })).toEqual([]); // 负数=退运/索赔冲减行，仍允许
  });

  it('CreateCostLineDto（建单明细行）同样限 0~100', async () => {
    expect(await fieldsOf(CreateCostLineDto, { cost_name: '面料', amount: 100, tax_rate: -100 })).toContain('tax_rate');
    expect(await fieldsOf(CreateCostLineDto, { cost_name: '面料', amount: 100, tax_rate: 9 })).toEqual([]);
  });

  it('AddCostDto cost_name 超过列宽 100 拒（Data too long 500 前置成 400）', async () => {
    expect(await fieldsOf(AddCostDto, { cost_name: 'x'.repeat(101), amount: 1 })).toContain('cost_name');
  });
});
