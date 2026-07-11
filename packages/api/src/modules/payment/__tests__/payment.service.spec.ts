import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PaymentService } from '../payment.service';
import { Prepayment } from '../prepayment.entity';
import { PaymentRequest } from '../payment-request.entity';
import { PaymentRecord } from '../payment-record.entity';
import { Reconciliation } from '../../reconciliation/reconciliation.entity';
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
const mockReconcileRepo = {
  update: jest.fn().mockResolvedValue({ affected: 1 }),
};
const mockRedis = { eval: jest.fn().mockResolvedValue(1), incr: jest.fn().mockResolvedValue(1) };
const mockManager = {
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockImplementation((_e, v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
};
const mockDataSource = {
  query: jest.fn().mockResolvedValue([]),
  transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
};

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockManager.findOne.mockResolvedValue(null);
    mockManager.find.mockResolvedValue([]);
    mockManager.create.mockImplementation((_e, v) => v);
    mockManager.save.mockImplementation((v) => Promise.resolve(v));
    mockDataSource.transaction.mockImplementation((cb) => cb(mockManager));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Prepayment), useValue: mockPrepayRepo },
        { provide: getRepositoryToken(PaymentRequest), useValue: mockPrRepo },
        { provide: getRepositoryToken(PaymentRecord), useValue: { find: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation((v) => v), save: jest.fn().mockImplementation((v) => Promise.resolve({ ...v, id: 1 })) } },
        { provide: getRepositoryToken(Reconciliation), useValue: mockReconcileRepo },
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
    expect(mockManager.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
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

  // UT-PAY-13: markPaid syncs linked reconciliation to PAID (系统开发手册·状态流转规则)
  it('UT-PAY-13 markPaid advances linked reconciliation to PAID', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.APPROVED, reconcile_id: 77 });
    mockPrRepo.findOne.mockResolvedValue(pr);
    mockPrRepo.save.mockResolvedValue({ ...pr, approval_status: PaymentApprovalStatus.PAID });

    await service.markPaid(1, 'http://example.com/slip.jpg', 99);
    expect(mockReconcileRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 77 }),
      expect.objectContaining({ status: 'PAID' }),
    );
  });

  // UT-PAY-14: markPaid skips reconciliation sync when no reconcile_id (NO_CONTRACT flow)
  it('UT-PAY-14 markPaid does not touch reconciliation when reconcile_id is absent', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.APPROVED, reconcile_id: undefined });
    mockPrRepo.findOne.mockResolvedValue(pr);
    mockPrRepo.save.mockResolvedValue({ ...pr, approval_status: PaymentApprovalStatus.PAID });

    await service.markPaid(1, 'http://example.com/slip.jpg', 99);
    expect(mockReconcileRepo.update).not.toHaveBeenCalled();
  });

  // UT-PAY-12: removePaymentRequest throws if not DRAFT
  it('UT-PAY-12 removePaymentRequest throws BadRequest if status is not DRAFT', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.PENDING });
    mockPrRepo.findOne.mockResolvedValue(pr);
    await expect(service.removePaymentRequest(1)).rejects.toThrow(BadRequestException);
  });

  // UT-PAY-15: findPaymentRequests applies factory + 申请日期 range filter (工厂+日期组合检索)
  it('UT-PAY-15 findPaymentRequests filters by factory_id and created_at range', async () => {
    mockPrRepo.findAndCount.mockResolvedValue([[], 0]);
    await service.findPaymentRequests(7, undefined, 1, 20, '2026-01-01', '2026-01-31');
    const arg = mockPrRepo.findAndCount.mock.calls.at(-1)[0];
    expect(arg.where.factory_id).toBe(7);
    expect(arg.where.created_at).toBeDefined(); // Between(...) FindOperator
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

  // ===== 分批付款（设计稿 06 v1.1）=====
  const makeRecordManager = (pr: any) => ({
    findOne: jest.fn().mockResolvedValue(pr),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((_e: any, v: any) => v),
    save: jest.fn().mockImplementation((_e: any, v: any) => Promise.resolve({ ...v, id: v.id ?? 9 })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    query: jest.fn().mockResolvedValue([]),
  });

  // UT-PAY-REC-01: 部分付款累计已付,余额>0 状态保持 APPROVED
  it('UT-PAY-REC-01 partial payment accumulates paid_total, stays APPROVED', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.APPROVED, actual_pay: 5000, paid_total: 0 });
    const manager = makeRecordManager(pr);
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));
    const res: any = await service.addPaymentRecord(1, { slip_url: '/uploads/slip.jpg', pay_date: '2026-07-09', amount: 2000, pay_method: 'BANK' }, 3);
    expect(res.paid_total).toBe(2000);
    expect(res.balance).toBe(3000);
    expect(res.request.approval_status).toBe(PaymentApprovalStatus.APPROVED); // 未付清
  });

  // UT-PAY-REC-02: 付清(余额=0) → 整单转 PAID + 联动对账单已付款
  it('UT-PAY-REC-02 final payment flips to PAID and marks reconciliation PAID', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.APPROVED, actual_pay: 5000, paid_total: 3000, reconcile_id: 7 });
    const manager = makeRecordManager(pr);
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));
    const res: any = await service.addPaymentRecord(1, { pay_date: '2026-07-09', amount: 2000, slip_url: '/u/slip.png' }, 3);
    expect(res.request.approval_status).toBe(PaymentApprovalStatus.PAID);
    expect(res.balance).toBe(0);
    expect(manager.update).toHaveBeenCalled(); // 对账单 CONFIRMED→PAID
  });

  // UT-PAY-REC-03: 累计超应付被拦截
  it('UT-PAY-REC-03 over-payment across records is rejected', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.APPROVED, actual_pay: 5000, paid_total: 4500 });
    const manager = makeRecordManager(pr);
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));
    await expect(service.addPaymentRecord(1, { slip_url: '/uploads/slip.jpg', pay_date: '2026-07-09', amount: 1000 }, 3))
      .rejects.toThrow(/超过应付总额/);
  });

  // UT-PAY-REC-04: 未审批/已付清不可登记付款
  it('UT-PAY-REC-04 rejects when not APPROVED or already PAID', async () => {
    const manager1 = makeRecordManager(makePR({ approval_status: PaymentApprovalStatus.PENDING }));
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager1));
    await expect(service.addPaymentRecord(1, { slip_url: '/uploads/slip.jpg', pay_date: '2026-07-09', amount: 100 }, 3))
      .rejects.toThrow(/只有已审批/);
    const manager2 = makeRecordManager(makePR({ approval_status: PaymentApprovalStatus.PAID }));
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager2));
    await expect(service.addPaymentRecord(1, { slip_url: '/uploads/slip.jpg', pay_date: '2026-07-09', amount: 100 }, 3))
      .rejects.toThrow(/已付清/);
  });
});
