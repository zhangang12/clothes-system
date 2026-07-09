import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReconciliationService } from '../reconciliation.service';
import { Reconciliation, ReconciliationStatus } from '../reconciliation.entity';
import { ReconciliationShipment } from '../reconciliation-shipment.entity';
import { ReconciliationLaborItem } from '../reconciliation-labor-item.entity';
import { ReconciliationExpenseItem } from '../reconciliation-expense-item.entity';
import { SampleGarment } from '../../sample/sample-garment.entity';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
import { ReconcileType, ReconcileSubType, SampleStatus, ContractType } from '@i9/types';

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

const makeManager = (findOneResult?: any) => ({
  create: jest.fn().mockImplementation((_, v) => v),
  save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
  findOne: jest.fn().mockResolvedValue(findOneResult),
  find: jest.fn().mockResolvedValue([]), // 同类型校验 manager.find(Contract) 默认空（无冲突）
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
};
const mockLaborItemRepo = {
  find: jest.fn().mockResolvedValue([]),
};
const mockExpenseItemRepo = {
  find: jest.fn().mockResolvedValue([]),
};
const mockRedis = { eval: jest.fn().mockResolvedValue(1), incr: jest.fn().mockResolvedValue(1) };
const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb) => cb(makeManager())),
  query: jest.fn().mockResolvedValue([]), // remove() 释放发货批次占用
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
    const manager = makeManager();
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
    const manager = makeManager();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    expect(manager.save.mock.calls[0][1]).toMatchObject({ has_invoice: 1, invoice_no: 'INV-001' });
  });

  // UT-REC-03: create calculates tax_amount from tax_rate
  it('UT-REC-03 create calculates tax_amount when tax_rate is provided', async () => {
    const dto = {
      type: ReconcileType.CONTRACT,
      factory_id: 5,
      tax_rate: 13,
      shipments: [{ shipment_id: 1, item_name: '面料A', snapshot_unit_price: 100, qty: 10 }],
    };
    const manager = makeManager();
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
    const manager = makeManager();
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
    mockReconciliationRepo.findOne.mockResolvedValue(rec);
    mockReconciliationRepo.save.mockResolvedValue({ ...rec, status: ReconciliationStatus.PENDING });
    const result = await service.submit(1);
    expect(result.status).toBe(ReconciliationStatus.PENDING);
  });

  // UT-REC-17: reject 整单退回 PENDING→DRAFT 并记录退回批注
  it('UT-REC-17 reject transitions PENDING→DRAFT and records review_remark', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.PENDING });
    mockReconciliationRepo.findOne.mockResolvedValue(rec);
    mockReconciliationRepo.save.mockImplementation((r: any) => Promise.resolve(r));
    const result = await service.reject(1, '金额与合同不符，请核对');
    expect(result.status).toBe(ReconciliationStatus.DRAFT);
    expect(result.review_remark).toBe('金额与合同不符，请核对');
  });

  it('UT-REC-18 reject throws when not PENDING', async () => {
    mockReconciliationRepo.findOne.mockResolvedValue(makeReconciliation({ status: ReconciliationStatus.DRAFT }));
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

  // UT-REC-06: remove logical deletes DRAFT
  it('UT-REC-06 remove logical-deletes DRAFT reconciliation', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.DRAFT });
    mockReconciliationRepo.findOne.mockResolvedValue(rec);
    await service.remove(1);
    expect(mockReconciliationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: 1 }));
  });

  // UT-REC-07: remove throws if not DRAFT
  it('UT-REC-07 remove throws BadRequestException if status is not DRAFT', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.CONFIRMED });
    mockReconciliationRepo.findOne.mockResolvedValue(rec);
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
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
});
