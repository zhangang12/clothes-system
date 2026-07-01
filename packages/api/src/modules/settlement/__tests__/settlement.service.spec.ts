import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SettlementService } from '../settlement.service';
import { Settlement } from '../settlement.entity';
import { SettlementCost } from '../settlement-cost.entity';
import { SettlementReceipt } from '../settlement-receipt.entity';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
import { SettlementStatus } from '@i9/types';

const makeSettlement = (overrides = {}): any => ({
  id: 1,
  settlement_no: 'SL2024010100001',
  order_id: 10,
  status: SettlementStatus.DRAFT,
  revenue: 10000,
  total_cost: 6000,
  net_profit: 4000,
  net_profit_ex_refund: 4000,
  deleted: 0,
  ...overrides,
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
const mockRedis = { incr: jest.fn().mockResolvedValue(1), expire: jest.fn() };
const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb) => cb({
    create: jest.fn().mockImplementation((_, v) => v),
    save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
  })),
};

describe('SettlementService', () => {
  let service: SettlementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementService,
        { provide: getRepositoryToken(Settlement), useValue: mockRepo },
        { provide: getRepositoryToken(SettlementCost), useValue: mockCostRepo },
        { provide: getRepositoryToken(SettlementReceipt), useValue: mockReceiptRepo },
        { provide: NumberingService, useValue: new NumberingService(mockRedis as any) },
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<SettlementService>(SettlementService);
  });

  // UT-SLT-01: create computes net_profit = revenue - total_cost
  it('UT-SLT-01 create computes net_profit = revenue - total_cost', async () => {
    const dto = {
      order_id: 10,
      revenue: 10000,
      costs: [
        { cost_name: '面料费', amount: 4000 },
        { cost_name: '加工费', amount: 2000 },
      ],
    };
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    // First save call is the settlement, net_profit should be 10000-6000=4000
    expect(manager.save.mock.calls[0][1]).toMatchObject({
      revenue: 10000, total_cost: 6000, net_profit: 4000,
    });
  });

  // UT-SLT-02: create with no costs → total_cost=0, net_profit=revenue
  it('UT-SLT-02 create with no costs sets total_cost=0 and net_profit=revenue', async () => {
    const dto = { order_id: 10, revenue: 5000 };
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    expect(manager.save.mock.calls[0][1]).toMatchObject({ total_cost: 0, net_profit: 5000 });
  });

  // UT-SLT-03: confirm transitions DRAFT → CONFIRMED
  it('UT-SLT-03 confirm transitions DRAFT→CONFIRMED', async () => {
    const s = makeSettlement({ status: SettlementStatus.DRAFT });
    mockRepo.findOne.mockResolvedValue(s);
    mockRepo.save.mockResolvedValue({ ...s, status: SettlementStatus.CONFIRMED });
    const result = await service.confirm(1);
    expect(result.status).toBe(SettlementStatus.CONFIRMED);
  });

  // UT-SLT-04: confirm throws if already CONFIRMED
  it('UT-SLT-04 confirm throws BadRequest if already CONFIRMED', async () => {
    const s = makeSettlement({ status: SettlementStatus.CONFIRMED });
    mockRepo.findOne.mockResolvedValue(s);
    await expect(service.confirm(1)).rejects.toThrow(BadRequestException);
  });

  // UT-SLT-05: addCost throws if not DRAFT
  it('UT-SLT-05 addCost throws BadRequest if not DRAFT', async () => {
    const s = makeSettlement({ status: SettlementStatus.CONFIRMED });
    mockRepo.findOne.mockResolvedValue(s);
    await expect(service.addCost(1, { cost_name: '运费', amount: 100 })).rejects.toThrow(BadRequestException);
  });

  // UT-SLT-06: addCost recalculates net_profit
  it('UT-SLT-06 addCost recalculates net_profit after adding cost', async () => {
    const s = makeSettlement({ revenue: 10000, total_cost: 6000, net_profit: 4000 });
    mockRepo.findOne
      .mockResolvedValueOnce(s)   // guard check
      .mockResolvedValueOnce(s);  // recalculate
    mockCostRepo.find.mockResolvedValue([
      { amount: 4000 }, { amount: 2000 }, { amount: 500 }, // new cost added = 6500
    ]);
    await service.addCost(1, { cost_name: '运费', amount: 500 });
    // After recalc: total_cost=6500, net_profit=3500
    expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      total_cost: 6500, net_profit: 3500,
    }));
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

  // UT-SLT-10: addReceipt stores receipt for valid settlement
  it('UT-SLT-10 addReceipt stores receipt linked to settlement', async () => {
    const s = makeSettlement({ status: SettlementStatus.DRAFT });
    mockRepo.findOne.mockResolvedValue(s);
    const dto = { amount: 5000, receipt_date: '2024-03-01', remark: '首期回款' };
    await service.addReceipt(1, dto as any);
    expect(mockReceiptRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      settlement_id: 1, amount: 5000,
    }));
  });
});
