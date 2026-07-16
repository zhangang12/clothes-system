import { Test, TestingModule } from '@nestjs/testing';
import { ExportInvoiceService } from '../../invoice/export-invoice.service';
import { ChangeLogService } from '../../../common/changelog/change-log.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SettlementService } from '../settlement.service';
import { Settlement } from '../settlement.entity';
import { SettlementCost } from '../settlement-cost.entity';
import { SettlementReceipt } from '../settlement-receipt.entity';
import { OrderMain } from '../../order/order-main.entity';
import { OrderShipment } from '../../order/order-shipment.entity';
import { Contract } from '../../contract/contract.entity';
import { Factory } from '../../factory/factory.entity';
import { Reconciliation } from '../../reconciliation/reconciliation.entity';
import { ReconciliationExpenseItem } from '../../reconciliation/reconciliation-expense-item.entity';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
import { SysConfigService } from '../../../common/config/sys-config.service';
import { SettlementStatus } from '@i9/types';

const mockConfig = { getNumber: jest.fn((_k: string, fb: number) => Promise.resolve(fb)) };
const mockExpenseItemRepo = { find: jest.fn().mockResolvedValue([]) };

const makeSettlement = (overrides = {}): any => ({
  id: 1,
  settlement_no: 'JS-20240101-001',
  order_id: 10,
  status: SettlementStatus.DRAFT,
  shipped_qty: 0,
  exchange_rate: 0,
  receipt_usd: 0,
  invoice_amount_usd: 0,
  goods_amount_tax: 0,
  goods_amount_extax: 0,
  freight_fee: 0,
  express_fee: 0,
  sample_fee: 0,
  other_fee: 0,
  tax_refund: 0,
  refund_status: 'ESTIMATED',
  profit_ready: 1,
  deleted: 0,
  ...overrides,
});

// manager.find/findOne 按实体分流（成本行/收汇行/出货/订单各回各的）
interface ManagerData {
  costs?: any[];
  receipts?: any[];
  shipments?: any[];
  order?: any;
  costRow?: any;
  receiptRow?: any;
}
const makeManager = (findOneResult?: any, data: ManagerData = {}) => ({
  create: jest.fn().mockImplementation((_, v) => v),
  save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
  findOne: jest.fn().mockImplementation((entity: any) => {
    if (entity === OrderMain) return Promise.resolve(data.order ?? null);
    if (entity === SettlementCost) return Promise.resolve(data.costRow ?? null);
    if (entity === SettlementReceipt) return Promise.resolve(data.receiptRow ?? null);
    return Promise.resolve(findOneResult);
  }),
  find: jest.fn().mockImplementation((entity: any) => {
    if (entity === SettlementCost) return Promise.resolve(data.costs ?? []);
    if (entity === SettlementReceipt) return Promise.resolve(data.receipts ?? []);
    if (entity === OrderShipment) return Promise.resolve(data.shipments ?? []);
    return Promise.resolve([]);
  }),
  delete: jest.fn().mockResolvedValue({}),
});

const mockRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve({ ...v, id: v.id ?? 1 })),
  findOne: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
};
const mockCostRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve(Array.isArray(v) ? v : v)),
  find: jest.fn().mockResolvedValue([]),
};
const mockReceiptRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
  find: jest.fn().mockResolvedValue([]),
};
const mockOrderRepo = {
  findOne: jest.fn().mockResolvedValue({ id: 10, style_no: 'V27.230', currency: 'USD', deleted: 0 }),
  find: jest.fn().mockResolvedValue([]),
};
const mockShipmentRepo = {
  find: jest.fn().mockResolvedValue([]),
};
const mockContractRepo = {
  find: jest.fn().mockResolvedValue([]),
};
const mockFactoryRepo = {
  find: jest.fn().mockResolvedValue([]),
};
const mockReconcileRepo = {
  find: jest.fn().mockResolvedValue([]),
};
const mockRedis = { eval: jest.fn().mockResolvedValue(1), incr: jest.fn().mockResolvedValue(1) };
const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb) => cb(makeManager())),
  query: jest.fn().mockResolvedValue([]), // 实发数聚合(reconciliation_shipment)
};

const mockChangeLogDep = { record: jest.fn().mockResolvedValue(undefined), list: jest.fn().mockResolvedValue([]) };
const mockExportInvoiceDep = { allocatedReceiptsForOrder: jest.fn().mockResolvedValue([]) };

describe('SettlementService', () => {
  let service: SettlementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDataSource.transaction.mockImplementation((cb) => cb(makeManager()));
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, style_no: 'V27.230', currency: 'USD', deleted: 0 });
    mockOrderRepo.find.mockResolvedValue([]);
    mockShipmentRepo.find.mockResolvedValue([]);
    mockContractRepo.find.mockResolvedValue([]);
    mockReconcileRepo.find.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementService,
        { provide: ChangeLogService, useValue: mockChangeLogDep },
        { provide: ExportInvoiceService, useValue: mockExportInvoiceDep },
        { provide: getRepositoryToken(Settlement), useValue: mockRepo },
        { provide: getRepositoryToken(SettlementCost), useValue: mockCostRepo },
        { provide: getRepositoryToken(SettlementReceipt), useValue: mockReceiptRepo },
        { provide: getRepositoryToken(OrderMain), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderShipment), useValue: mockShipmentRepo },
        { provide: getRepositoryToken(Contract), useValue: mockContractRepo },
        { provide: getRepositoryToken(Factory), useValue: mockFactoryRepo },
        { provide: getRepositoryToken(Reconciliation), useValue: mockReconcileRepo },
        { provide: getRepositoryToken(ReconciliationExpenseItem), useValue: mockExpenseItemRepo },
        { provide: SysConfigService, useValue: mockConfig },
        { provide: NumberingService, useValue: new NumberingService(mockRedis as any) },
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<SettlementService>(SettlementService);
  });

  // UT-SLT-01: full 毛利对比链 —— 结算金额=收汇×汇率, 毛利=结算金额−不含税货款, 财务费7%, 净利=毛利−期间费用−财务费, 保本汇率
  it('UT-SLT-01 computes settle_amount/gross_profit/finance_fee(7%)/net_profit/break-even rates', async () => {
    mockShipmentRepo.find.mockResolvedValueOnce([{ qty: 300 }, { qty: 200 }]); // 出货件数 500
    const dto = {
      order_id: 10,
      goods_amount_tax: 11300, // 不含税=10000
      receipt_usd: 2000,
      exchange_rate: 7, // 结算金额=14000
      invoice_amount_usd: 2500, // 美金单价=5
      freight_fee: 100,
      express_fee: 50,
      sample_fee: 30,
      other_fee: 20, // 期间费用合计=200
      tax_refund: 300,
    };
    const manager = makeManager();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    expect(manager.save.mock.calls[0][1]).toMatchObject({
      style_no: 'V27.230',
      shipped_qty: 500,
      goods_amount_tax: 11300,
      goods_amount_extax: 10000, // 11300/1.13
      cost_per_unit_tax: 22.6, // 11300/500
      cost_per_unit_extax: 20, // 10000/500
      usd_unit_price: 5, // 2500/500
      settle_amount: 14000, // 2000×7
      gross_profit: 4000, // 14000−10000
      finance_fee: 980, // 14000×0.07
      net_profit_ex_refund: 2820, // 4000−200−980
      net_profit: 3120, // 2820+300
      breakeven_rate_tax: 4.52, // 22.6/5
      breakeven_rate_extax: 4, // 20/5
      profit_ready: 1,
    });
  });

  // UT-SLT-02: 无收汇/汇率 → 必填闸门(结算稿C/E)：不出误导性负毛利，profit_ready=0
  it('UT-SLT-02 with no receipt/rate → profit gate closes (no misleading negatives)', async () => {
    const dto = { order_id: 10, goods_amount_tax: 1130 };
    const manager = makeManager();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    expect(manager.save.mock.calls[0][1]).toMatchObject({
      goods_amount_extax: 1000,
      settle_amount: 0,
      gross_profit: 0, // 闸门关闭：不写 −1000 误导值
      finance_fee: 0,
      net_profit_ex_refund: 0,
      profit_ready: 0,
    });
  });

  // UT-SLT-11: create throws NotFoundException when order does not exist
  it('UT-SLT-11 create throws NotFoundException for missing order', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.create({ order_id: 999 } as any, 1)).rejects.toThrow(NotFoundException);
  });

  // UT-SLT-12: 成本明细无票计税 —— 有票不含税=含税÷1.13, 无票按含税全额进不含税
  it('UT-SLT-12 cost lines: invoiced ÷1.13, non-invoiced full into ex-tax; currency & qty from order/shipments', async () => {
    mockShipmentRepo.find.mockResolvedValueOnce([{ qty: 300 }, { qty: 200 }]); // 500
    const dto = {
      order_id: 10,
      receipt_usd: 1000,
      exchange_rate: 7,
      costs: [
        { cost_name: '面料', amount: 1130, has_invoice: 1 }, // 不含税 1000
        { cost_name: '现金采购', amount: 500, has_invoice: 0 }, // 无票 → 全额 500
      ],
    };
    const manager = makeManager();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    expect(manager.save.mock.calls[0][1]).toMatchObject({
      currency: 'USD',
      shipped_qty: 500,
      goods_amount_tax: 1630, // 1130+500
      goods_amount_extax: 1500, // 1000 + 500(无票)
      cost_per_unit_extax: 3, // 1500/500
      gross_profit: 5500, // 7000 − 1500
    });
  });

  // UT-SLT-13: 出口退税进含退税净利、不进不含退税净利；均建立在正确基数(毛利−期间费用−财务费)之上
  it('UT-SLT-13 tax_refund into net_profit(含退税) only; base excludes finance fee bug', async () => {
    const dto = { order_id: 10, goods_amount_tax: 11300, receipt_usd: 2000, exchange_rate: 7, tax_refund: 800 };
    const manager = makeManager();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    expect(manager.save.mock.calls[0][1]).toMatchObject({
      finance_fee: 980, // 14000×0.07
      net_profit_ex_refund: 3020, // (14000−10000) − 0 − 980
      net_profit: 3820, // 3020 + 800
    });
  });

  // UT-SLT-14: 无手工成本时自动从对账付款聚合总货款——仅已付款(PAID)计入(结算Q8)
  it('UT-SLT-14 auto-aggregates goods_amount_tax from PAID reconciliations (style fallback)', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ id: 10, style_no: 'V27.230', currency: 'CNY', deleted: 0 });
    mockReconcileRepo.find.mockResolvedValueOnce([
      { reconcile_no: 'DZ-1', total_amount: 11300, status: 'PAID', has_invoice: 1 },
      { reconcile_no: 'DZ-2', total_amount: 2260, status: 'PAID', has_invoice: 1 },
    ]); // 含税合计13560
    const dto = { order_id: 10, receipt_usd: 1000, exchange_rate: 7 };
    const manager = makeManager();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    expect(manager.save.mock.calls[0][1]).toMatchObject({
      goods_amount_tax: 13560,
      goods_amount_extax: 12000, // 13560/1.13
      unpaid_goods_tax: 0,
      unpaid_count: 0,
    });
  });

  // UT-SLT-15: 已确认未付不计入总货款，单独落 unpaid_goods_tax/unpaid_count 灰显（结算Q8）
  it('UT-SLT-15 CONFIRMED-unpaid excluded from goods, tracked as unpaid greyout', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ id: 10, style_no: 'V27.230', currency: 'CNY', deleted: 0 });
    mockReconcileRepo.find.mockResolvedValueOnce([
      { reconcile_no: 'DZ-1', total_amount: 11300, status: 'PAID', has_invoice: 1 },
      { reconcile_no: 'DZ-2', total_amount: 2260, status: 'CONFIRMED', has_invoice: 1 }, // 未付
    ]);
    const dto = { order_id: 10, receipt_usd: 1000, exchange_rate: 7 };
    const manager = makeManager();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    expect(manager.save.mock.calls[0][1]).toMatchObject({
      goods_amount_tax: 11300, // 仅 PAID
      goods_amount_extax: 10000,
      unpaid_goods_tax: 2260,
      unpaid_count: 1,
    });
    // 快照行两条均落库：未付行 included=0
    const costSave = manager.save.mock.calls.find((c: any[]) => c[0] === SettlementCost);
    expect(costSave[1]).toHaveLength(2);
    expect(costSave[1].find((r: any) => r.reconcile_no === 'DZ-2')).toMatchObject({ included: 0, pay_status: 'CONFIRMED', source: 'AUTO' });
  });

  // UT-SLT-16: 成本按【订单】聚合——有合同挂接时按 contract_id 圈对账，杜绝同款多订单重复背（结算Q1）
  it('UT-SLT-16 aggregates by order contracts (not style) when contracts exist', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ id: 10, style_no: 'V27.230', currency: 'CNY', deleted: 0 });
    mockContractRepo.find.mockResolvedValueOnce([{ id: 77 }, { id: 78 }]);
    mockReconcileRepo.find.mockResolvedValueOnce([
      { reconcile_no: 'DZ-9', total_amount: 5650, status: 'PAID', has_invoice: 1 },
    ]);
    const manager = makeManager();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create({ order_id: 10, receipt_usd: 100, exchange_rate: 7 } as any, 1);
    const where = mockReconcileRepo.find.mock.calls[0][0].where;
    expect(where.contract_id).toBeDefined(); // 圈定本订单合同
    expect(where.style_no).toBeUndefined();
    expect(manager.save.mock.calls[0][1]).toMatchObject({ goods_amount_tax: 5650, goods_amount_extax: 5000 });
  });

  // UT-SLT-03: confirm transitions DRAFT → CONFIRMED
  it('UT-SLT-03 confirm transitions DRAFT→CONFIRMED', async () => {
    const s = makeSettlement({ status: SettlementStatus.DRAFT, profit_ready: 1 });
    const manager = makeManager(s);
    manager.save.mockResolvedValue({ ...s, status: SettlementStatus.CONFIRMED });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    const result = await service.confirm(1);
    expect(result.status).toBe(SettlementStatus.CONFIRMED);
  });

  // UT-SLT-04: confirm throws if already CONFIRMED
  it('UT-SLT-04 confirm throws BadRequest if already CONFIRMED', async () => {
    const s = makeSettlement({ status: SettlementStatus.CONFIRMED });
    const manager = makeManager(s);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.confirm(1)).rejects.toThrow(BadRequestException);
  });

  // UT-SLT-20: 必填闸门——收汇/汇率不齐(profit_ready=0)不可确认
  it('UT-SLT-20 confirm blocked while profit gate closed (missing receipt/rate)', async () => {
    const s = makeSettlement({ status: SettlementStatus.DRAFT, profit_ready: 0 });
    const manager = makeManager(s);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.confirm(1)).rejects.toThrow(BadRequestException);
  });

  // UT-SLT-05: addCost throws if not DRAFT
  it('UT-SLT-05 addCost throws BadRequest if not DRAFT', async () => {
    const s = makeSettlement({ status: SettlementStatus.CONFIRMED });
    const manager = makeManager(s);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.addCost(1, { cost_name: '运费', amount: 100 })).rejects.toThrow(BadRequestException);
  });

  // UT-SLT-06: addCost recompute —— 用结算单已存的收汇/汇率重算总货款与派生量
  it('UT-SLT-06 addCost recomputes goods total & derived from stored receipt/rate', async () => {
    const s = makeSettlement({ receipt_usd: 1000, exchange_rate: 1, shipped_qty: 0 });
    const manager = makeManager(s, { costs: [{ amount: 1130, has_invoice: 1 }], receipts: [] });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.addCost(1, { cost_name: '面料', amount: 1130, has_invoice: 1 });
    const saveCall = manager.save.mock.calls.find((c: any[]) => c[0] === Settlement);
    expect(saveCall[1]).toMatchObject({
      goods_amount_tax: 1130,
      goods_amount_extax: 1000,
      settle_amount: 1000, // 1000×1
      gross_profit: 0, // 1000−1000
      finance_fee: 70, // 1000×0.07
      net_profit_ex_refund: -70, // 0−0−70
    });
  });

  // UT-SLT-07: remove throws if not DRAFT
  it('UT-SLT-07 remove throws BadRequest if not DRAFT', async () => {
    const s = makeSettlement({ status: SettlementStatus.CONFIRMED });
    mockRepo.findOne.mockResolvedValue(s);
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
  });

  // UT-SLT-08: remove logical-deletes DRAFT settlement
  it('UT-SLT-08 remove logical-deletes a DRAFT settlement', async () => {
    const s = makeSettlement({ status: SettlementStatus.DRAFT });
    mockRepo.findOne.mockResolvedValue(s);
    await service.remove(1);
    expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: 1 }));
  });

  // UT-SLT-09: findOne throws NotFoundException for missing record
  it('UT-SLT-09 findOne throws NotFoundException for missing record', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });

  // UT-SLT-10: addReceipt stores 逐笔收汇 and累计驱动结算金额重算
  it('UT-SLT-10 addReceipt stores receipt and accumulates receipt_usd', async () => {
    const s = makeSettlement({ status: SettlementStatus.DRAFT, exchange_rate: 7 });
    const manager = makeManager(s, { receipts: [{ amount: 5000 }], costs: [] });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    const dto = { amount: 5000, receipt_date: '2024-03-01', remark: '首期回款' };
    await service.addReceipt(1, dto as any);
    const receiptSave = manager.save.mock.calls.find((c: any[]) => c[0] === SettlementReceipt);
    expect(receiptSave[1]).toMatchObject({ settlement_id: 1, amount: 5000 });
    const settleSave = manager.save.mock.calls.find((c: any[]) => c[0] === Settlement);
    expect(settleSave[1]).toMatchObject({ receipt_usd: 5000, settle_amount: 35000 }); // 5000×7
  });

  // UT-SLT-17: 逐笔收汇×各自汇率(结算Q2/Q13)——结算金额=Σ(金额×汇率)，头上汇率=加权平均
  it('UT-SLT-17 per-receipt rates: settle=Σ(amount×rate), header rate=weighted average', async () => {
    const s = makeSettlement({ status: SettlementStatus.DRAFT, exchange_rate: null });
    const manager = makeManager(s, {
      receipts: [
        { amount: 1000, exchange_rate: 7 },
        { amount: 500, exchange_rate: 7.2 },
      ],
      costs: [],
    });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.addReceipt(1, { amount: 500, receipt_date: '2024-03-02', exchange_rate: 7.2 } as any);
    const settleSave = manager.save.mock.calls.find((c: any[]) => c[0] === Settlement);
    expect(settleSave[1]).toMatchObject({
      receipt_usd: 1500,
      settle_amount: 10600, // 1000×7 + 500×7.2
      exchange_rate: 7.0667, // 10600/1500 加权平均
      profit_ready: 1,
    });
  });

  // UT-SLT-18: 编辑通道(结算稿B/D断链修复)——草稿可回头补汇率/发票金额并联动重算
  it('UT-SLT-18 update backfills rate/invoice on DRAFT and recomputes', async () => {
    const s = makeSettlement({ status: SettlementStatus.DRAFT, receipt_usd: 2000, goods_amount_tax: 11300, goods_amount_extax: 10000 });
    const manager = makeManager(s, { receipts: [], costs: [] });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.update(1, { exchange_rate: 7, invoice_amount_usd: 2500 } as any);
    const settleSave = manager.save.mock.calls.find((c: any[]) => c[0] === Settlement);
    expect(settleSave[1]).toMatchObject({
      exchange_rate: 7,
      invoice_amount_usd: 2500,
      settle_amount: 14000,
      gross_profit: 4000, // 14000−10000
      profit_ready: 1,
    });
  });

  // UT-SLT-19: 已有逐笔收汇时收汇总额只能由记录累计，禁止手工覆盖
  it('UT-SLT-19 update rejects manual receipt_usd when receipts exist', async () => {
    const s = makeSettlement({ status: SettlementStatus.DRAFT });
    const manager = makeManager(s, { receipts: [{ amount: 100 }] });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.update(1, { receipt_usd: 999 } as any)).rejects.toThrow(BadRequestException);
  });

  // UT-SLT-21: 刷新付款汇总——重取出货件数 + AUTO 快照行整组重建（结算稿D）
  it('UT-SLT-21 refreshCost resyncs shipped_qty and rebuilds AUTO snapshot rows', async () => {
    const s = makeSettlement({ status: SettlementStatus.DRAFT, order_id: 10, receipt_usd: 1000, exchange_rate: 7 });
    const order = { id: 10, style_no: 'V27.230', deleted: 0 };
    mockReconcileRepo.find.mockResolvedValueOnce([
      { reconcile_no: 'DZ-3', total_amount: 1130, status: 'PAID', has_invoice: 1 },
    ]);
    const manager = makeManager(s, { order, shipments: [{ qty: 60 }, { qty: 40 }], costs: [], receipts: [] });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.refreshCost(1);
    expect(manager.delete).toHaveBeenCalledWith(SettlementCost, { settlement_id: 1, source: 'AUTO' });
    const settleSave = manager.save.mock.calls.find((c: any[]) => c[0] === Settlement);
    expect(settleSave[1]).toMatchObject({
      shipped_qty: 100,
      goods_amount_tax: 1130,
      goods_amount_extax: 1000,
    });
  });

  // ── 关联单据（单据间跳转）：详情带出上游单据号 ──

  // UT-SLT-22: 详情带出源订单号（chip 显示单据号而非裸 ID）
  it('UT-SLT-22 findOne returns order_no of the source order', async () => {
    mockRepo.findOne.mockResolvedValue(makeSettlement({ order_id: 10 }));
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, order_no: 'SO2024010100001', deleted: 0 });
    const res: any = await service.findOne(1);
    expect(res.order_no).toBe('SO2024010100001');
  });

  // UT-SLT-23: 源订单已删 → order_no 降级 null，详情不 500
  it('UT-SLT-23 findOne degrades order_no to null when the source order is gone', async () => {
    mockRepo.findOne.mockResolvedValue(makeSettlement({ order_id: 10 }));
    mockOrderRepo.findOne.mockResolvedValue(null);
    const res: any = await service.findOne(1);
    expect(res.order_no).toBeNull();
  });
});
