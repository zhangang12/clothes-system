import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PaymentService } from '../payment.service';
import { Prepayment } from '../prepayment.entity';
import { PaymentRequest } from '../payment-request.entity';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
import { PaymentApprovalStatus, ReconcileType } from '@i9/types';

const makePR = (overrides = {}) => ({
  id: 1,
  pr_no: 'PR2024010100001',
  type: ReconcileType.CONTRACT,
  factory_id: 5,
  amount: 5000,
  prepay_offset: 0,
  actual_pay: 5000,
  approval_status: PaymentApprovalStatus.DRAFT,
  deleted: 0,
  ...overrides,
});

const makePrepayment = (overrides = {}) => ({
  id: 1,
  factory_id: 5,
  amount: 1000,
  used_amount: 0,
  balance: 1000,
  ...overrides,
});

const mockPrepayRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
  find: jest.fn().mockResolvedValue([]),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
};
const mockPrRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
  findOne: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
};
const mockRedis = { eval: jest.fn().mockResolvedValue(1), incr: jest.fn().mockResolvedValue(1) };
const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb) => cb({
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((_, v) => Promise.resolve(v)),
  })),
};

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDataSource.transaction.mockImplementation((cb) => cb({
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(v)),
    }));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Prepayment), useValue: mockPrepayRepo },
        { provide: getRepositoryToken(PaymentRequest), useValue: mockPrRepo },
        { provide: NumberingService, useValue: new NumberingService(mockRedis as any) },
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  // UT-PAY-01: createPrepayment sets balance=amount and used_amount=0
  it('UT-PAY-01 createPrepayment initializes balance=amount, used_amount=0', async () => {
    const dto = { factory_id: 5, amount: 2000, pay_date: '2024-01-01' };
    await service.createPrepayment(dto as any, 1);
    expect(mockPrepayRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 2000, balance: 2000, used_amount: 0,
    }));
  });

  // UT-PAY-02: getAvailablePrepayBalance sums all positive balances for factory
  it('UT-PAY-02 getAvailablePrepayBalance sums balance across all prepayments', async () => {
    mockPrepayRepo.find.mockResolvedValue([
      makePrepayment({ balance: 500 }),
      makePrepayment({ balance: 300 }),
    ]);
    const balance = await service.getAvailablePrepayBalance(5);
    expect(balance).toBe(800);
  });

  // UT-PAY-03: createPaymentRequest calculates actual_pay = amount - prepay_offset
  it('UT-PAY-03 createPaymentRequest computes actual_pay correctly', async () => {
    const dto = { type: ReconcileType.CONTRACT, factory_id: 5, amount: 3000, prepay_offset: 500 };
    mockPrepayRepo.find.mockResolvedValue([makePrepayment({ balance: 1000 })]);
    await service.createPaymentRequest(dto as any, 1);
    expect(mockPrRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 3000,
      prepay_offset: 500,
      actual_pay: 2500,
    }));
  });

  // UT-PAY-04: createPaymentRequest throws when prepay_offset > balance (overpayment guard)
  it('UT-PAY-04 createPaymentRequest throws BadRequest when prepay_offset exceeds balance', async () => {
    const dto = { type: ReconcileType.CONTRACT, factory_id: 5, amount: 3000, prepay_offset: 2000 };
    mockPrepayRepo.find.mockResolvedValue([makePrepayment({ balance: 500 })]);
    await expect(service.createPaymentRequest(dto as any, 1)).rejects.toThrow(BadRequestException);
  });

  // UT-PAY-05: submitPaymentRequest transitions DRAFT → PENDING
  it('UT-PAY-05 submitPaymentRequest transitions DRAFT→PENDING', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.DRAFT });
    mockPrRepo.findOne.mockResolvedValue(pr);
    mockPrRepo.save.mockResolvedValue({ ...pr, approval_status: PaymentApprovalStatus.PENDING });

    const result = await service.submitPaymentRequest(1, 1);
    expect(result.approval_status).toBe(PaymentApprovalStatus.PENDING);
  });

  // UT-PAY-06: submitPaymentRequest throws if not DRAFT
  it('UT-PAY-06 submitPaymentRequest throws BadRequest if not DRAFT', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.PENDING });
    mockPrRepo.findOne.mockResolvedValue(pr);
    await expect(service.submitPaymentRequest(1, 1)).rejects.toThrow(BadRequestException);
  });

  // UT-PAY-07: approvePaymentRequest transitions PENDING → APPROVED
  it('UT-PAY-07 approvePaymentRequest transitions PENDING→APPROVED', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.PENDING, prepay_offset: 0 });
    const manager = {
      findOne: jest.fn().mockResolvedValue(pr),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(v)),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));

    const result = await service.approvePaymentRequest(1, 1);
    expect(result.approval_status).toBe(PaymentApprovalStatus.APPROVED);
  });

  // UT-PAY-08: approvePaymentRequest deducts prepay_offset from prepayment balance
  it('UT-PAY-08 approvePaymentRequest deducts prepay_offset from prepayment balance', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.PENDING, prepay_offset: 300 });
    const prepay = makePrepayment({ balance: 500, used_amount: 0 });
    const manager = {
      findOne: jest.fn().mockResolvedValue(pr),
      find: jest.fn().mockResolvedValue([prepay]),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(v)),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));

    await service.approvePaymentRequest(1, 1);
    // Should save prepayment with balance = 500-300 = 200
    const prepaymentSaveCalls = manager.save.mock.calls.filter(
      (call: any[]) => call[0] === Prepayment,
    );
    expect(prepaymentSaveCalls[0][1]).toMatchObject({ balance: 200, used_amount: 300 });
  });

  // UT-PAY-09: rejectPaymentRequest transitions PENDING → REJECTED
  it('UT-PAY-09 rejectPaymentRequest transitions PENDING→REJECTED with reason', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.PENDING });
    mockPrRepo.findOne.mockResolvedValue(pr);
    mockPrRepo.save.mockResolvedValue({ ...pr, approval_status: PaymentApprovalStatus.REJECTED });

    const result = await service.rejectPaymentRequest(1, 1, '发票有误');
    expect(result.approval_status).toBe(PaymentApprovalStatus.REJECTED);
  });

  // UT-PAY-10: markPaid transitions APPROVED → PAID
  it('UT-PAY-10 markPaid transitions APPROVED→PAID', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.APPROVED });
    mockPrRepo.findOne.mockResolvedValue(pr);
    mockPrRepo.save.mockResolvedValue({ ...pr, approval_status: PaymentApprovalStatus.PAID });

    const result = await service.markPaid(1, 'http://example.com/slip.jpg', 99);
    expect(result.approval_status).toBe(PaymentApprovalStatus.PAID);
  });

  // UT-PAY-11: markPaid throws if not APPROVED
  it('UT-PAY-11 markPaid throws BadRequest if status is not APPROVED', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.PENDING });
    mockPrRepo.findOne.mockResolvedValue(pr);
    await expect(service.markPaid(1, 'url', 99)).rejects.toThrow(BadRequestException);
  });

  // UT-PAY-12: removePaymentRequest throws if not DRAFT
  it('UT-PAY-12 removePaymentRequest throws BadRequest if status is not DRAFT', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.PENDING });
    mockPrRepo.findOne.mockResolvedValue(pr);
    await expect(service.removePaymentRequest(1)).rejects.toThrow(BadRequestException);
  });

  // UT-OVP-01~04: overpayment guard scenarios
  it('UT-OVP-01 no prepay_offset → no balance check', async () => {
    const dto = { type: ReconcileType.CONTRACT, factory_id: 5, amount: 3000 };
    await service.createPaymentRequest(dto as any, 1);
    expect(mockPrepayRepo.find).not.toHaveBeenCalled();
  });

  it('UT-OVP-02 prepay_offset=0 → no balance check', async () => {
    const dto = { type: ReconcileType.CONTRACT, factory_id: 5, amount: 3000, prepay_offset: 0 };
    await service.createPaymentRequest(dto as any, 1);
    expect(mockPrepayRepo.find).not.toHaveBeenCalled();
  });

  it('UT-OVP-03 prepay_offset equals balance → allowed', async () => {
    const dto = { type: ReconcileType.CONTRACT, factory_id: 5, amount: 3000, prepay_offset: 1000 };
    mockPrepayRepo.find.mockResolvedValue([makePrepayment({ balance: 1000 })]);
    await expect(service.createPaymentRequest(dto as any, 1)).resolves.toBeDefined();
  });

  it('UT-OVP-04 multiple prepayments: sum balances for guard', async () => {
    const dto = { type: ReconcileType.CONTRACT, factory_id: 5, amount: 5000, prepay_offset: 1500 };
    mockPrepayRepo.find.mockResolvedValue([
      makePrepayment({ balance: 800 }),
      makePrepayment({ balance: 700 }),
    ]);
    await expect(service.createPaymentRequest(dto as any, 1)).resolves.toBeDefined();
  });

  // UT-OVP-05: prepay_offset > amount throws immediately
  it('UT-OVP-05 prepay_offset exceeds amount throws BadRequest', async () => {
    const dto = { type: ReconcileType.CONTRACT, factory_id: 5, amount: 1000, prepay_offset: 1500 };
    await expect(service.createPaymentRequest(dto as any, 1)).rejects.toThrow(BadRequestException);
    expect(mockPrepayRepo.find).not.toHaveBeenCalled();
  });
});
