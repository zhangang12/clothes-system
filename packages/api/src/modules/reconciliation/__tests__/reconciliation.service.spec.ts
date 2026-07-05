import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReconciliationService } from '../reconciliation.service';
import { Reconciliation, ReconciliationStatus } from '../reconciliation.entity';
import { ReconciliationShipment } from '../reconciliation-shipment.entity';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
import { ReconcileType } from '@i9/types';

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
const mockRedis = { eval: jest.fn().mockResolvedValue(1), incr: jest.fn().mockResolvedValue(1) };
const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb) => cb(makeManager())),
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

  // UT-REC-04a: submit transitions DRAFT → PENDING (业务员初审)
  it('UT-REC-04a submit transitions DRAFT→PENDING', async () => {
    const rec = makeReconciliation({ status: ReconciliationStatus.DRAFT });
    mockReconciliationRepo.findOne.mockResolvedValue(rec);
    mockReconciliationRepo.save.mockResolvedValue({ ...rec, status: ReconciliationStatus.PENDING });
    const result = await service.submit(1);
    expect(result.status).toBe(ReconciliationStatus.PENDING);
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
});
