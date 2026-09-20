import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReconciliationService } from '../reconciliation.service';
import { Reconciliation, ReconciliationStatus } from '../reconciliation.entity';
import { ReconciliationShipment } from '../reconciliation-shipment.entity';
import { ReconciliationLaborItem } from '../reconciliation-labor-item.entity';
import { ReconciliationExpenseItem } from '../reconciliation-expense-item.entity';
import { ContractShipment } from '../../contract/contract-shipment.entity';
import { SampleGarment } from '../../sample/sample-garment.entity';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
import { ReconcileType, ReconcileSubType, SampleStatus, ContractType } from '@i9/types';
import { Contract } from '../../contract/contract.entity';
import { OrderMain } from '../../order/order-main.entity';

const makeSample = (overrides = {}) => ({
  id: 1, sample_no: 'S001', style_no: 'K-100', patternmaker_id: 7, patternmaker_name: '王版师',
  piece_count: 3, labor_unit_price: 50, labor_amount: 150, status: SampleStatus.RECONCILED, deleted: 0,
  ...overrides,
});

// manager whose find() dispatches by entity — for generateLabor
const makeLaborManager = (samples: any[], existedItems: any[] = [], activeRecs: any[] = []) => ({
  create: jest.fn().mockImplementation((_: any, v: any) => v),
  save: jest.fn().mockImplementation((_: any, v: any) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
  findOne: jest.fn(),
  find: jest.fn().mockImplementation((entity: any) => {
    if (entity === SampleGarment) return Promise.resolve(samples);
    if (entity === ReconciliationLaborItem) return Promise.resolve(existedItems);
    if (entity === Reconciliation) return Promise.resolve(activeRecs);
    return Promise.resolve([]);
  }),
});

const makeReconciliation = (overrides = {}) => ({
  id: 1,
  reconcile_no: 'RC2024010100001',
  type: ReconcileType.CONTRACT,
  contract_id: 10,
  factory_id: 5,
  total_amount: 5000,
  status: ReconciliationStatus.DRAFT,
  deleted: 0,
  ...overrides,
});

const makeManager = (findOneResult?: any, batches: any[] = [], counts: { rs?: number; cs?: number } = {}) => ({
  query: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockImplementation((_, v) => v),
  save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
  findOne: jest.fn().mockResolvedValue(findOneResult),
  find: jest.fn().mockImplementation((entity: any) => {
    if (entity === ContractShipment) return Promise.resolve(batches); // 批次校验（H1）
    // ensureBatchesHeld 取明细行：按 counts.rs 生成行桩（存量自愈逐批占用用）
    if (entity === ReconciliationShipment) {
      return Promise.resolve(Array.from({ length: counts.rs ?? 0 }, (_, i) => ({ shipment_id: i + 1 })));
    }
    return Promise.resolve([]); // 同类型校验 manager.find(Contract) 默认空（无冲突）
  }),
  // ensureBatchesHeld：ContractShipment=本单占用批次数(cs)
  count: jest.fn().mockImplementation((entity: any) => {
    if (entity === ContractShipment) return Promise.resolve(counts.cs ?? 0);
    return Promise.resolve(0);
  }),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
});

const mockReconciliationRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
  findOne: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
};
const mockShipmentRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockResolvedValue([]),
  find: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
};
const mockLaborItemRepo = {
  find: jest.fn().mockResolvedValue([]),
};
const mockExpenseItemRepo = {
  find: jest.fn().mockResolvedValue([]),
};
const mockRedis = { eval: jest.fn().mockResolvedValue(1), incr: jest.fn().mockResolvedValue(1) };
const mockContractShipmentCount = jest.fn().mockResolvedValue(0); // assertBatchesStillHeld 占用批次计数
const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb) => cb(makeManager())),
  query: jest.fn().mockResolvedValue([]), // remove() 释放发货批次占用
  getRepository: jest.fn().mockReturnValue({ count: mockContractShipmentCount }),
};

describe('ReconciliationService', () => {
  let service: ReconciliationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDataSource.transaction.mockImplementation((cb) => cb(makeManager()));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: getRepositoryToken(Reconciliation), useValue: mockReconciliationRepo },
        { provide: getRepositoryToken(ReconciliationShipment), useValue: mockShipmentRepo },
        { provide: getRepositoryToken(ReconciliationLaborItem), useValue: mockLaborItemRepo },
        { provide: getRepositoryToken(ReconciliationExpenseItem), useValue: mockExpenseItemRepo },
        { provide: NumberingService, useValue: new NumberingService(mockRedis as any) },
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
  });

  // UT-REC-01: create calculates total_amount from shipment lines
  it('UT-REC-01 create calculates total_amount from shipment lines', async () => {
    const dto = {
      type: ReconcileType.CONTRACT,
      factory_id: 5,
      contract_id: 10,
      shipments: [
        { shipment_id: 1, item_name: '面料A', snapshot_unit_price: 10, qty: 200 },
        { shipment_id: 2, item_name: '面料B', snapshot_unit_price: 20, qty: 100 },
      ],
    };
    const manager = makeManager(undefined, [
      { id: 1, contract_id: 10, ship_no: 'FH-1', snapshot_unit_price: 10, reconcile_id: null },
      { id: 2, contract_id: 10, ship_no: 'FH-2', snapshot_unit_price: 20, reconcile_id: null },
    ]);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    // total_amount = 10*200 + 20*100 = 2000 + 2000 = 4000
    expect(manager.save.mock.calls[0][1]).toMatchObject({ total_amount: 4000 });
  });

  // UT-REC-02: create marks has_invoice=1 when invoice_no provided
  it('UT-REC-02 create sets has_invoice=1 when invoice_no is provided', async () => {
    const dto = {
      type: ReconcileType.CONTRACT,
      factory_id: 5,
      contract_id: 10,
      invoice_no: 'INV-001',
      shipments: [{ shipment_id: 1, item_name: '面料A', snapshot_unit_price: 10, qty: 100 }],
    };
    const manager = makeManager(undefined, [
      { id: 1, contract_id: 10, ship_no: 'FH-1', snapshot_unit_price: 10, reconcile_id: null },
    ]);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    expect(manager.save.mock.calls[0][1]).toMatchObject({ has_invoice: 1, invoice_no: 'INV-001' });
  });

  // UT-REC-03: create calculates tax_amount from tax_rate
  it('UT-REC-03 create calculates tax_amount when tax_rate is provided', async () => {
    const dto = {
      type: ReconcileType.CONTRACT,
      factory_id: 5,
      contract_id: 10,
      tax_rate: 13,
      shipments: [{ shipment_id: 1, item_name: '面料A', snapshot_unit_price: 100, qty: 10 }],
    };
    const manager = makeManager(undefined, [
      { id: 1, contract_id: 10, ship_no: 'FH-1', snapshot_unit_price: 100, reconcile_id: null },
    ]);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    // total = 100*10 = 1000, tax = 1000 * 13% = 130
    expect(manager.save.mock.calls[0][1]).toMatchObject({ tax_amount: 130 });
  });

  // UT-REC-14: 一单多合同 — 无单一合同头时按批次款号汇总，且每批次落库来源合同/款号
  it('UT-REC-14 create supports 一单多合同 (per-batch contract linkage + summarized style)', async () => {
    const dto = {
      type: ReconcileType.CONTRACT,
      factory_id: 5,
      shipments: [
        { shipment_id: 1, contract_id: 11, style_no: 'K-100', item_name: '面料A', snapshot_unit_price: 10, qty: 100 },
        { shipment_id: 2, contract_id: 22, style_no: 'K-200', item_name: '面料B', snapshot_unit_price: 20, qty: 50 },
      ],
    };
    const manager = makeManager(undefined, [
      { id: 1, contract_id: 11, ship_no: 'FH-1', snapshot_unit_price: 10, reconcile_id: null },
      { id: 2, contract_id: 22, ship_no: 'FH-2', snapshot_unit_price: 20, reconcile_id: null },
    ]);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    const savedRec = manager.save.mock.calls[0][1];
    expect(savedRec.style_no).toContain('等2款');
    const savedLines = manager.save.mock.calls[1][1];
    expect(savedLines[0]).toMatchObject({ contract_id: 11, style_no: 'K-100' });
    expect(savedLines[1]).toMatchObject({ contract_id: 22, style_no: 'K-200' });
  });

  // UT-REC-15: 一张对账单不允许混含材料+加工两类合同（补充确认v1.0 B3）
  it('UT-REC-15 create rejects mixed 材料+加工 contracts in one reconciliation', async () => {
    const dto = {
      type: ReconcileType.CONTRACT, factory_id: 5,
      shipments: [
        { shipment_id: 1, contract_id: 11, item_name: '面料', snapshot_unit_price: 8, qty: 100 },
        { shipment_id: 2, contract_id: 22, item_name: '加工', snapshot_unit_price: 5, qty: 100 },
      ],
    };
    const manager = {
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([{ id: 11, type: ContractType.MATERIAL }, { id: 22, type: ContractType.PROCESS }]),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.create(dto as any, 1)).rejects.toThrow('同一类型合同');
  });

  // UT-REC-16: 无合同空白对账单——费用明细求和 + 子类型落库（补充确认v1.1）
  it('UT-REC-16 create NO_CONTRACT sums expenses, sets sub_type, saves expense items', async () => {
    const dto = {
      type: ReconcileType.NO_CONTRACT, subType: ReconcileSubType.CASH_NO_INVOICE, factory_id: 5,
      expenses: [
        { expense_name: '快递费', amount: 120 },
        { expense_name: '打样材料', amount: 380, style_no: 'K-100' },
      ],
    };
    const manager = makeManager();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    const savedRec = manager.save.mock.calls[0][1];
    expect(savedRec).toMatchObject({ total_amount: 500, sub_type: ReconcileSubType.CASH_NO_INVOICE });
    // 费用明细两行落库
    const savedItems = manager.save.mock.calls[1][1];
    expect(savedItems).toHaveLength(2);
    expect(savedItems[0]).toMatchObject({ expense_name: '快递费', amount: 120 });
  });

  // UT-REC-04a: submit transitions DRAFT → PENDING (业务员初审)
  it('UT-REC-04a submit transitions DRAFT→PENDING', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.DRAFT });
    const manager = makeManager(rec); // 非批次型（rs/cs 默认 0），ensureBatchesHeld 直接放行
    manager.save.mockResolvedValue({ ...rec, status: ReconciliationStatus.PENDING });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    const result = await service.submit(1);
    expect(result.status).toBe(ReconciliationStatus.PENDING);
  });

  // UT-REC-17: reject 整单退回 PENDING→DRAFT 并记录退回批注 + 释放占用批次(门户B3)
  it('UT-REC-17 reject transitions PENDING→DRAFT and records review_remark', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.PENDING });
    const manager = makeManager(rec);
    (manager as any).update = jest.fn().mockResolvedValue({ affected: 1 });
    manager.save.mockImplementation((_: any, r: any) => Promise.resolve(r));
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    const result = await service.reject(1, '金额与合同不符，请核对');
    expect(result.status).toBe(ReconciliationStatus.DRAFT);
    expect(result.review_remark).toBe('金额与合同不符，请核对');
    expect((manager as any).update).toHaveBeenCalled(); // 释放批次
  });

  it('UT-REC-18 reject throws when not PENDING', async () => {
    const manager = makeManager(makeReconciliation({ status: ReconciliationStatus.DRAFT }));
    (manager as any).update = jest.fn();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.reject(1, 'x')).rejects.toThrow(BadRequestException);
  });

  // UT-REC-04: confirm transitions PENDING → CONFIRMED (主管复核，二级审批)
  it('UT-REC-04 confirm transitions PENDING→CONFIRMED', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.PENDING });
    const manager = makeManager(rec);
    manager.save.mockResolvedValue({ ...rec, status: ReconciliationStatus.CONFIRMED });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));

    const result = await service.confirm(1);
    expect(result.status).toBe(ReconciliationStatus.CONFIRMED);
  });

  // UT-REC-05: confirm throws if not PENDING (DRAFT 未提交不可直接复核)
  it('UT-REC-05 confirm throws BadRequestException if not PENDING', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.DRAFT });
    const manager = makeManager(rec);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.confirm(1)).rejects.toThrow(BadRequestException);
  });

  // UT-REC-06: remove logical deletes DRAFT（B135 后走事务：manager 锁行 → 软删 → 释放批次）
  it('UT-REC-06 remove logical-deletes DRAFT reconciliation', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.DRAFT });
    const manager = makeManager(rec);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.remove(1);
    expect(manager.save).toHaveBeenCalledWith(Reconciliation, expect.objectContaining({ deleted: 1 }));
  });

  // UT-REC-07: remove throws if not DRAFT
  it('UT-REC-07 remove throws BadRequestException if status is not DRAFT', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.CONFIRMED });
    const manager = makeManager(rec);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  // ── 2026-09-20 审查回归（B018/B019/B069/B070/B071/B072/B134/B135）──
  describe('审查回归', () => {
    const line = (over: any = {}) => ({ shipment_id: 1, item_name: '面料A', snapshot_unit_price: 10, qty: 100, ...over });
    const batch = (over: any = {}) => ({ id: 1, contract_id: 10, ship_no: 'FH-1', snapshot_unit_price: 10, reconcile_id: null, ...over });

    it('B018 既勾发货批次又加费用行 → 明确拒绝，不再静默丢货款且占批次', async () => {
      const manager = makeManager(undefined, [batch()]);
      mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
      await expect(service.create({
        type: ReconcileType.CONTRACT, factory_id: 5, contract_id: 10,
        shipments: [line()], expenses: [{ expense_name: '杂费', amount: 1 }],
      } as any, 1)).rejects.toThrow('同一类型明细');
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('B019 建单时发货批次行加悲观写锁再判占用', async () => {
      const manager = makeManager(undefined, [batch()]);
      mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
      await service.create({ type: ReconcileType.CONTRACT, factory_id: 5, contract_id: 10, shipments: [line()] } as any, 1);
      expect(manager.find).toHaveBeenCalledWith(ContractShipment, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    });

    it('B070 批次未锁价、品名不在合同快照材料中 → 拦下（快照有材料行时不再放任单价随便填）', async () => {
      const contract = { id: 10, deleted: 0, snapshot_json: { materials: [{ item_name: '面料A', unit_price: 10 }] } };
      const manager = makeManager(contract, [batch({ snapshot_unit_price: null })]);
      mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
      await expect(service.create({
        type: ReconcileType.CONTRACT, factory_id: 5, contract_id: 10,
        shipments: [line({ item_name: '面料Z', snapshot_unit_price: 99 })],
      } as any, 1)).rejects.toThrow('不在合同快照材料中');
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('B070 快照本身没有材料行（存量无材料合同）无从核对 → 维持放行', async () => {
      const contract = { id: 10, deleted: 0, snapshot_json: { materials: [] } };
      const manager = makeManager(contract, [batch({ snapshot_unit_price: null })]);
      mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
      await service.create({
        type: ReconcileType.CONTRACT, factory_id: 5, contract_id: 10,
        shipments: [line({ item_name: '面料Z', snapshot_unit_price: 99 })],
      } as any, 1);
      expect(manager.save.mock.calls[0][1]).toMatchObject({ total_amount: 9900 });
    });

    // B071：合同没有材料行时，合同量回退到订单大货数，超发闸门不再整条跳过
    const confirmManager = (rec: any, contract: any, order: any) => {
      const manager = makeManager(rec);
      manager.findOne.mockImplementation((entity: any) => {
        if (entity === Reconciliation) return Promise.resolve(rec);
        if (entity === Contract) return Promise.resolve(contract);
        if (entity === OrderMain) return Promise.resolve(order);
        return Promise.resolve(null);
      });
      manager.save.mockImplementation((_: any, r: any) => Promise.resolve(r));
      mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
      return manager;
    };

    it('B071 contract_material 为空但订单有大货数：累计实发超订单量须填超发原因', async () => {
      const rec = makeReconciliation({ status: ReconciliationStatus.PENDING, contract_id: 10 });
      confirmManager(rec, { id: 10, order_id: 100, shipped_qty: 300 }, { id: 100, qty_total: 100 });
      await expect(service.confirm(1)).rejects.toThrow('OVER_SHIP');
    });

    it('B071 填了超发原因即放行并留痕', async () => {
      const rec = makeReconciliation({ status: ReconciliationStatus.PENDING, contract_id: 10 });
      confirmManager(rec, { id: 10, order_id: 100, shipped_qty: 300 }, { id: 100, qty_total: 100 });
      const saved = await service.confirm(1, '客户加单，业务已确认');
      expect(saved.over_reason).toBe('客户加单，业务已确认');
      expect(saved.status).toBe(ReconciliationStatus.CONFIRMED);
    });

    it('B071 订单也没有数量 → 无从判断，维持放行不强求原因', async () => {
      const rec = makeReconciliation({ status: ReconciliationStatus.PENDING, contract_id: 10 });
      confirmManager(rec, { id: 10, order_id: 100, shipped_qty: 300 }, { id: 100, qty_total: 0 });
      const saved = await service.confirm(1);
      expect(saved.status).toBe(ReconciliationStatus.CONFIRMED);
    });

    it('B072 草稿改发票号撞到别单已用的号 → 中文提示报出占用单，不再 500', async () => {
      mockReconciliationRepo.findOne
        .mockResolvedValueOnce({ id: 5, status: 'DRAFT', created_by: 1, total_amount: 1000 })
        .mockResolvedValueOnce({ id: 77, reconcile_no: 'DZ-77' });
      await expect(service.updateDraft(5, { invoice_no: 'FP-9' } as any, { id: 1, role: 'ADMIN' }))
        .rejects.toThrow('已被对账单 DZ-77 使用');
      expect(mockReconciliationRepo.save).not.toHaveBeenCalled();
    });

    it('B072 发票号只是自己这张单在用 → 放行', async () => {
      mockReconciliationRepo.findOne
        .mockResolvedValueOnce({ id: 5, status: 'DRAFT', created_by: 1, total_amount: 1000 })
        .mockResolvedValueOnce({ id: 5, reconcile_no: 'DZ-5' });
      await service.updateDraft(5, { invoice_no: 'FP-9' } as any, { id: 1, role: 'ADMIN' });
      expect(mockReconciliationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ invoice_no: 'FP-9', has_invoice: 1 }));
    });

    it('B072 保存时撞唯一索引（并发同号）→ 翻译成中文提示', async () => {
      mockReconciliationRepo.findOne
        .mockResolvedValueOnce({ id: 5, status: 'DRAFT', created_by: 1, total_amount: 1000 })
        .mockResolvedValueOnce(null);
      mockReconciliationRepo.save.mockRejectedValueOnce(Object.assign(new Error('dup'), {
        code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry 'FP-9' for key 'reconciliation.uk_invoice_no'",
      }));
      await expect(service.updateDraft(5, { invoice_no: 'FP-9' } as any, { id: 1, role: 'ADMIN' }))
        .rejects.toThrow(BadRequestException);
    });

    it('B134 明细行先各自取整再求和：表头总额 = 明细合计（此前总额对未取整的和取整，可差 0.0001）', async () => {
      const manager = makeManager(undefined, [batch({ id: 1, snapshot_unit_price: 1.23456 }), batch({ id: 2, snapshot_unit_price: 1.23456 }), batch({ id: 3, snapshot_unit_price: 1.23456 })]);
      mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
      await service.create({
        type: ReconcileType.CONTRACT, factory_id: 5, contract_id: 10,
        shipments: [1, 2, 3].map((id) => line({ shipment_id: id, snapshot_unit_price: 1.23456, qty: 1 })),
      } as any, 1);
      const header = manager.save.mock.calls[0][1];
      const lines = manager.save.mock.calls[1][1];
      expect(lines.map((l: any) => l.amount)).toEqual([1.2346, 1.2346, 1.2346]);
      expect(header.total_amount).toBe(3.7038); // 旧算法 = +(3.70368).toFixed(4) = 3.7037，与明细合计差 0.0001
    });

    it('B135 删对账单：软删与释放批次在同一事务内（manager.update），不再走事务外裸 SQL', async () => {
      const rec = makeReconciliation({ id: 5, status: ReconciliationStatus.DRAFT });
      const manager = makeManager(rec);
      mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
      await service.remove(5);
      expect(manager.findOne).toHaveBeenCalledWith(Reconciliation, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
      expect(manager.update).toHaveBeenCalledWith(ContractShipment, { reconcile_id: 5 }, { reconcile_id: null });
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('B069 软删时把发票号改写为「原号#del<id>」让出该号；无发票号的不动', async () => {
      const rec = makeReconciliation({ id: 5, status: ReconciliationStatus.DRAFT, invoice_no: 'FP-1' });
      const manager = makeManager(rec);
      mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
      await service.remove(5);
      expect(manager.save).toHaveBeenCalledWith(Reconciliation, expect.objectContaining({ deleted: 1, invoice_no: 'FP-1#del5' }));

      const rec2 = makeReconciliation({ id: 6, status: ReconciliationStatus.DRAFT, invoice_no: null });
      const manager2 = makeManager(rec2);
      mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager2));
      await service.remove(6);
      expect(manager2.save).toHaveBeenCalledWith(Reconciliation, expect.objectContaining({ deleted: 1, invoice_no: null }));
    });

    it('B069 超长发票号改写后仍不超列宽 100', async () => {
      const rec = makeReconciliation({ id: 12345, status: ReconciliationStatus.DRAFT, invoice_no: 'X'.repeat(100) });
      const manager = makeManager(rec);
      mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
      await service.remove(12345);
      const saved = manager.save.mock.calls[0][1];
      expect(saved.invoice_no.length).toBeLessThanOrEqual(100);
      expect(saved.invoice_no.endsWith('#del12345')).toBe(true);
    });
  });

  // UT-REC-08: findOne throws NotFoundException for missing record
  it('UT-REC-08 findOne throws NotFoundException for missing record', async () => {
    mockReconciliationRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });

  // UT-REC-09: generateLabor 合并多款工时→一张 LABOR 对账单，金额求和、受款方=版师
  it('UT-REC-09 generateLabor sums labor_amount and creates one LABOR reconciliation', async () => {
    const samples = [
      makeSample({ id: 1, sample_no: 'S001', style_no: 'K-100', labor_amount: 150 }),
      makeSample({ id: 2, sample_no: 'S002', style_no: 'K-200', labor_amount: 200 }),
    ];
    const manager = makeLaborManager(samples);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.generateLabor({ sampleIds: [1, 2] } as any, 9);
    const savedRec = manager.save.mock.calls[0][1];
    expect(savedRec).toMatchObject({
      type: ReconcileType.LABOR,
      patternmaker_id: 7,
      patternmaker_name: '王版师',
      currency: 'CNY',
      factory_id: null,
      total_amount: 350, // 150 + 200
      status: ReconciliationStatus.DRAFT,
    });
    expect(savedRec.style_no).toContain('等2款');
    // 明细行落库（批次可点跳）
    const savedItems = manager.save.mock.calls[1][1];
    expect(savedItems).toHaveLength(2);
  });

  // UT-REC-10: generateLabor 拒绝未完成工时的样衣（未对账/无工时金额）
  it('UT-REC-10 generateLabor throws when a sample is not RECONCILED / has no labor amount', async () => {
    const samples = [
      makeSample({ id: 1, labor_amount: 150 }),
      makeSample({ id: 2, status: SampleStatus.RETURNED, labor_amount: 0 }),
    ];
    const manager = makeLaborManager(samples);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.generateLabor({ sampleIds: [1, 2] } as any, 9)).rejects.toThrow(BadRequestException);
  });

  // UT-REC-11: generateLabor 要求同一版师（受款方唯一）
  it('UT-REC-11 generateLabor throws when samples belong to different patternmakers', async () => {
    const samples = [
      makeSample({ id: 1, patternmaker_id: 7 }),
      makeSample({ id: 2, patternmaker_id: 8 }),
    ];
    const manager = makeLaborManager(samples);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.generateLabor({ sampleIds: [1, 2] } as any, 9)).rejects.toThrow('同一版师');
  });

  // UT-REC-12: generateLabor 防重复对账（样衣已在未删除的工时对账单中）
  it('UT-REC-12 generateLabor throws when a sample is already in an active labor reconciliation', async () => {
    const samples = [makeSample({ id: 1 })];
    const existed = [{ id: 1, reconcile_id: 99, sample_id: 1 }];
    const activeRecs = [{ id: 99, deleted: 0 }];
    const manager = makeLaborManager(samples, existed, activeRecs);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.generateLabor({ sampleIds: [1] } as any, 9)).rejects.toThrow('重复对账');
  });

  // UT-REC-13: generateLabor 拒绝不存在的样衣（数量对不上）
  it('UT-REC-13 generateLabor throws when some sampleIds do not resolve', async () => {
    const samples = [makeSample({ id: 1 })]; // only 1 of 2 found
    const manager = makeLaborManager(samples);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.generateLabor({ sampleIds: [1, 2] } as any, 9)).rejects.toThrow(BadRequestException);
  });

  // ── 关联单据（单据间跳转）：合同→对账反查 + 详情带出上游单据号/工厂名 ──

  // UT-REC-19: 合同→对账反查（关联单据 chip）
  it('UT-REC-19 findAll filters by contract_id', async () => {
    mockReconciliationRepo.findAndCount.mockResolvedValue([[], 0]);
    await service.findAll({ contract_id: 10 } as any);
    const arg = mockReconciliationRepo.findAndCount.mock.calls.at(-1)[0];
    expect(arg.where).toMatchObject({ contract_id: 10, deleted: 0 });
  });

  // UT-REC-20: 详情带出上游合同号 + 工厂名（此前只有列表补名，详情显示「工厂#12」）
  it('UT-REC-20 findOne returns contract_no and factory_name', async () => {
    mockReconciliationRepo.findOne.mockResolvedValue(makeReconciliation({ contract_id: 10, factory_id: 5 }));
    mockDataSource.query
      .mockResolvedValueOnce([{ contract_no: 'CT2024010100001' }])
      .mockResolvedValueOnce([{ nm: '面料厂A' }]);
    const res: any = await service.findOne(1);
    expect(res.contract_no).toBe('CT2024010100001');
    expect(res.factory_name).toBe('面料厂A');
  });

  // ── H1 回归：内部 create 批次校验 + 占用 ──

  // UT-REC-22: create 占用发货批次（写 contract_shipment.reconcile_id），与门户同一口径
  it('UT-REC-22 create occupies shipment batches (writes reconcile_id)', async () => {
    const dto = {
      type: ReconcileType.CONTRACT, factory_id: 5, contract_id: 10,
      shipments: [{ shipment_id: 1, item_name: '面料A', snapshot_unit_price: 10, qty: 100 }],
    };
    const batch = { id: 1, contract_id: 10, ship_no: 'FH-1', snapshot_unit_price: 10, reconcile_id: null };
    const manager = makeManager(undefined, [batch]);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    // 第三次 save = 占用批次（header → 明细行 → 批次占用）
    const occupied = manager.save.mock.calls[2][1];
    expect(occupied).toHaveLength(1);
    expect(occupied[0]).toMatchObject({ id: 1, reconcile_id: 1 }); // header save mock 归 id:1
  });

  // UT-REC-23: create 拒绝不存在的发货批次
  it('UT-REC-23 create throws when a shipment batch does not exist', async () => {
    const dto = {
      type: ReconcileType.CONTRACT, factory_id: 5, contract_id: 10,
      shipments: [{ shipment_id: 99, item_name: '面料A', snapshot_unit_price: 10, qty: 100 }],
    };
    const manager = makeManager(undefined, []); // 查无批次
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.create(dto as any, 1)).rejects.toThrow('不存在');
  });

  // UT-REC-24: create 拒绝已被其他对账单占用的批次（防同批次重复对账）
  it('UT-REC-24 create throws when a batch is already occupied by another reconciliation', async () => {
    const dto = {
      type: ReconcileType.CONTRACT, factory_id: 5, contract_id: 10,
      shipments: [{ shipment_id: 1, item_name: '面料A', snapshot_unit_price: 10, qty: 100 }],
    };
    const manager = makeManager(undefined, [
      { id: 1, contract_id: 10, ship_no: 'FH-1', snapshot_unit_price: 10, reconcile_id: 88 },
    ]);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.create(dto as any, 1)).rejects.toThrow('重复对账');
  });

  // UT-REC-25: create 拒绝不属于本合同的批次
  it('UT-REC-25 create throws when a batch belongs to another contract', async () => {
    const dto = {
      type: ReconcileType.CONTRACT, factory_id: 5, contract_id: 10,
      shipments: [{ shipment_id: 1, item_name: '面料A', snapshot_unit_price: 10, qty: 100 }],
    };
    const manager = makeManager(undefined, [
      { id: 1, contract_id: 77, ship_no: 'FH-1', snapshot_unit_price: 10, reconcile_id: null },
    ]);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.create(dto as any, 1)).rejects.toThrow('不属于合同');
  });

  // UT-REC-26: create 拒绝与批次锁价/合同快照不一致的单价（防客户端虚报单价）
  it('UT-REC-26 create throws when line price mismatches the snapshot price', async () => {
    const dto = {
      type: ReconcileType.CONTRACT, factory_id: 5, contract_id: 10,
      shipments: [{ shipment_id: 1, item_name: '面料A', snapshot_unit_price: 15, qty: 100 }],
    };
    const manager = makeManager(undefined, [
      { id: 1, contract_id: 10, ship_no: 'FH-1', snapshot_unit_price: 10, reconcile_id: null },
    ]);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.create(dto as any, 1)).rejects.toThrow('快照价');
  });

  // UT-REC-27: 内部创建的批次对账单批次仍被占用 → submit 正常流转（H1 主流程不再断死）
  it('UT-REC-27 submit passes when batches are still held by the reconciliation', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.DRAFT });
    const manager = makeManager(rec, [], { rs: 1, cs: 1 }); // 有明细行 + 批次仍被本单占用
    manager.save.mockResolvedValue({ ...rec, status: ReconciliationStatus.PENDING });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    const result = await service.submit(1);
    expect(result.status).toBe(ReconciliationStatus.PENDING);
  });

  // UT-REC-28: 有明细行、批次已释放且带退回批注（整单退回留痕）→ submit 拦截
  it('UT-REC-28 submit throws when batches were released by a full rejection', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.DRAFT, review_remark: '金额与合同不符，退回' });
    const manager = makeManager(rec, [], { rs: 1, cs: 0 }); // 有明细行 + 批次已释放
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.submit(1)).rejects.toThrow('批次已释放');
  });

  // UT-REC-30: 存量兼容——H1 修复前创建的单（有明细行、从未占用、无退回批注）→ submit 自愈占用后放行
  it('UT-REC-30 submit self-heals legacy bills created without batch occupation', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.DRAFT });
    const manager = makeManager(rec, [], { rs: 1, cs: 0 });
    manager.find.mockImplementation((entity: any) =>
      entity === ReconciliationShipment ? Promise.resolve([{ shipment_id: 1 }]) : Promise.resolve([]));
    manager.save.mockResolvedValue({ ...rec, status: ReconciliationStatus.PENDING });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    const result = await service.submit(1);
    expect(result.status).toBe(ReconciliationStatus.PENDING);
    expect(manager.update).toHaveBeenCalledWith(
      ContractShipment, { id: 1, reconcile_id: null }, { reconcile_id: rec.id },
    );
  });

  // UT-REC-31: 存量自愈遇真占用——批次已被其他未删对账单占用 → 报出占用方拦截（防重复计费）
  it('UT-REC-31 submit throws when a legacy batch is occupied by another active bill', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.DRAFT });
    const manager = makeManager(undefined, [], { rs: 1, cs: 0 });
    manager.find.mockImplementation((entity: any) =>
      entity === ReconciliationShipment ? Promise.resolve([{ shipment_id: 1 }]) : Promise.resolve([]));
    manager.findOne.mockImplementation((entity: any, opts?: any) => {
      if (entity === ContractShipment) return Promise.resolve({ id: 1, reconcile_id: 99, ship_no: 'FH-1' });
      if (entity === Reconciliation) {
        return Promise.resolve(opts?.where?.id === 99 ? { id: 99, reconcile_no: 'RC-99', deleted: 0 } : rec);
      }
      return Promise.resolve(null);
    });
    manager.update.mockResolvedValue({ affected: 0 }); // 条件占用抢不到
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.submit(1)).rejects.toThrow('已被对账单 RC-99 占用');
  });

  // UT-REC-32: 存量自愈清陈旧占用——占用方是已删单 → 清掉后重占，正常流转
  it('UT-REC-32 submit retakes batches whose occupier was soft-deleted', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.DRAFT });
    const manager = makeManager(undefined, [], { rs: 1, cs: 0 });
    manager.find.mockImplementation((entity: any) =>
      entity === ReconciliationShipment ? Promise.resolve([{ shipment_id: 1 }]) : Promise.resolve([]));
    manager.findOne.mockImplementation((entity: any, opts?: any) => {
      if (entity === ContractShipment) return Promise.resolve({ id: 1, reconcile_id: 99, ship_no: 'FH-1' });
      if (entity === Reconciliation) {
        return Promise.resolve(opts?.where?.id === 99 ? { id: 99, reconcile_no: 'RC-99', deleted: 1 } : rec);
      }
      return Promise.resolve(null);
    });
    manager.update
      .mockResolvedValueOnce({ affected: 0 }) // 条件占用未抢到（陈旧占用非 NULL）
      .mockResolvedValue({ affected: 1 });    // 清陈旧后重占
    manager.save.mockResolvedValue({ ...rec, status: ReconciliationStatus.PENDING });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    const result = await service.submit(1);
    expect(result.status).toBe(ReconciliationStatus.PENDING);
    expect(manager.update).toHaveBeenLastCalledWith(ContractShipment, { id: 1 }, { reconcile_id: rec.id });
  });

  // ── L7-② 回归：一单多合同 confirm 按明细批次反查合同标 needs_recalc ──

  // UT-REC-29: confirm 无单一 contract_id 时，按明细批次涉及的所有合同逐张标「待重算」
  it('UT-REC-29 confirm marks needs_recalc for every contract involved (一单多合同)', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.PENDING, contract_id: null });
    const manager = makeManager(rec);
    manager.query
      .mockResolvedValueOnce([{ contract_id: 11 }, { contract_id: '22' }]) // 明细批次反查（bigint 字符串归一）
      .mockResolvedValue([]);
    manager.save.mockResolvedValue({ ...rec, status: ReconciliationStatus.CONFIRMED });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.confirm(1);
    const recalcCalls = manager.query.mock.calls.filter(([sql]: [string]) => sql.includes('UPDATE settlement'));
    expect(recalcCalls).toHaveLength(2);
    expect(recalcCalls[0][1]).toEqual([11]);
    expect(recalcCalls[1][1]).toEqual([22]);
  });

  // ── 改草稿（2026-08-11 ZYT：草稿能不能改/删）────────────────────────
  describe('updateDraft', () => {
    const draft = (over: any = {}) => ({
      id: 5, status: 'DRAFT', created_by: 7, total_amount: 1000,
      invoice_no: null, invoice_amount: null, tax_rate: null, has_invoice: 0, ...over,
    });
    const ADMIN = { id: 1, role: 'ADMIN' };
    const OWNER = { id: 7, role: 'BUSINESS' };

    it('改发票金额时同步重算发票差额，不留旧值', async () => {
      mockReconciliationRepo.findOne.mockResolvedValue(draft());
      await service.updateDraft(5, { invoice_amount: 900 } as any, ADMIN);
      expect(mockReconciliationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ invoice_diff: -100 }));
    });

    it('改税率时同步重算税额', async () => {
      mockReconciliationRepo.findOne.mockResolvedValue(draft());
      await service.updateDraft(5, { tax_rate: 13 } as any, ADMIN);
      expect(mockReconciliationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tax_amount: 130 }));
    });

    it('发票号空串归一为 NULL 并同步 has_invoice（唯一索引允许多张无票并存）', async () => {
      mockReconciliationRepo.findOne.mockResolvedValue(draft({ invoice_no: 'FP-1', has_invoice: 1 }));
      await service.updateDraft(5, { invoice_no: '' } as any, ADMIN);
      expect(mockReconciliationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ invoice_no: null, has_invoice: 0 }));
    });

    it('非草稿一律拒绝——已提交复核的金额是复核依据', async () => {
      for (const st of ['PENDING', 'CONFIRMED', 'PAID']) {
        mockReconciliationRepo.findOne.mockResolvedValue(draft({ status: st }));
        await expect(service.updateDraft(5, { tax_rate: 1 } as any, ADMIN)).rejects.toThrow(BadRequestException);
      }
    });

    it('业务只能改自己建的草稿', async () => {
      mockReconciliationRepo.findOne.mockResolvedValue(draft({ created_by: 999 }));
      await expect(service.updateDraft(5, { tax_rate: 1 } as any, OWNER)).rejects.toThrow(ForbiddenException);
    });
  });


  // ——— #74 扣款明细（2026-08-12 业务拍板：已确认合同要打折/次品退货，合同不动、在对账扣）———
  describe('合同类对账·扣款明细', () => {
    const shipDto = (deductions?: any[]) => ({
      type: ReconcileType.CONTRACT, factory_id: 5, contract_id: 10,
      shipments: [{ shipment_id: 1, item_name: '面料A', snapshot_unit_price: 10, qty: 200 }],
      ...(deductions ? { deductions } : {}),
    });
    const mgr = () => {
      const m = makeManager(undefined, [{ id: 1, contract_id: 10, ship_no: 'FH-1', snapshot_unit_price: 10, reconcile_id: null }]);
      mockDataSource.transaction.mockImplementationOnce((cb) => cb(m));
      return m;
    };

    it('UT-REC-D1 对账金额 = 发货金额 − 扣款', async () => {
      const m = mgr();
      await service.create(shipDto([{ reason: '次品退货 20 件', amount: -500 }]) as any, 1);
      expect(m.save.mock.calls[0][1]).toMatchObject({ total_amount: 1500 }); // 10×200 − 500
    });

    it('UT-REC-D2 多条扣款累加，正负都认（少扣了要补回就填正数）', async () => {
      const m = mgr();
      await service.create(shipDto([
        { reason: '客户打折', amount: -300 },
        { reason: '次品退货', amount: -200 },
        { reason: '上次多扣退回', amount: 50 },
      ]) as any, 1);
      expect(m.save.mock.calls[0][1]).toMatchObject({ total_amount: 1550 }); // 2000 − 300 − 200 + 50
    });

    it('UT-REC-D3 扣款事由与附件都落库（事后要能说清这笔钱扣在哪）', async () => {
      const m = mgr();
      await service.create(shipDto([
        { reason: '次品退货 20 件', amount: -500, style_no: 'ST001', attach_url: '/u/a.jpg,/u/b.jpg' },
      ]) as any, 1);
      const saved = m.save.mock.calls.find((c: any[]) => Array.isArray(c[1]) && c[1][0]?.expense_name);
      expect(saved[1][0]).toMatchObject({
        expense_name: '次品退货 20 件', amount: -500, style_no: 'ST001', attach_url: '/u/a.jpg,/u/b.jpg',
      });
    });

    it('UT-REC-D4 扣款扣光或扣成负数直接拦下——放过去后面付款闸门和结算毛利全跟着错', async () => {
      mgr();
      await expect(service.create(shipDto([{ reason: '填错了', amount: -2000 }]) as any, 1))
        .rejects.toThrow('对账金额不能为零或负数');
      mgr();
      await expect(service.create(shipDto([{ reason: '多填一位', amount: -5000 }]) as any, 1))
        .rejects.toThrow(BadRequestException);
    });

    it('UT-REC-D5 不填扣款时行为一个字不变（老单据不受影响）', async () => {
      const m = mgr();
      await service.create(shipDto() as any, 1);
      expect(m.save.mock.calls[0][1]).toMatchObject({ total_amount: 2000 });
      const expenseSaves = m.save.mock.calls.filter((c: any[]) => Array.isArray(c[1]) && c[1][0]?.expense_name);
      expect(expenseSaves).toHaveLength(0);
    });

    it('UT-REC-D6 税额与发票差额按扣完之后的金额算，不是按发货金额', async () => {
      const m = mgr();
      await service.create({ ...shipDto([{ reason: '打折', amount: -500 }]), tax_rate: 13, invoice_amount: 1500 } as any, 1);
      expect(m.save.mock.calls[0][1]).toMatchObject({
        total_amount: 1500,
        tax_amount: 195,      // 1500 × 13%
        invoice_diff: 0,      // 发票 1500 与扣后金额一致
      });
    });

    it('UT-REC-D7 详情要把扣款明细带出来（此前只在无合同类型下查，合同对账看不见）', async () => {
      mockReconciliationRepo.findOne.mockResolvedValue({
        id: 1, type: ReconcileType.CONTRACT, contract_id: 10, factory_id: 5, total_amount: 1500, deleted: 0,
      });
      mockShipmentRepo.find.mockResolvedValue([]);
      mockExpenseItemRepo.find.mockResolvedValue([{ id: 1, reconcile_id: 1, expense_name: '次品退货', amount: -500 }]);
      const res: any = await service.findOne(1);
      expect(res.expenseItems).toHaveLength(1);
      expect(res.expenseItems[0]).toMatchObject({ expense_name: '次品退货', amount: -500 });
    });
  });
});
