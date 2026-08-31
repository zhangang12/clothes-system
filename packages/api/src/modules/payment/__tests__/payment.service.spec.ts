import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DataSource, Between, In } from 'typeorm';
import { PaymentService } from '../payment.service';
import { Prepayment } from '../prepayment.entity';
import { PaymentRequest } from '../payment-request.entity';
import { PaymentRecord } from '../payment-record.entity';
import { Reconciliation, ReconciliationStatus } from '../../reconciliation/reconciliation.entity';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
import { PaymentApprovalStatus, ReconcileType, UserRole } from '@i9/types';

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
  find: jest.fn().mockResolvedValue([]),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
};
const mockRecordRepo = {
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve({ ...v, id: 1 })),
};
const mockReconcileRepo = {
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  find: jest.fn().mockResolvedValue([]),
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
        { provide: getRepositoryToken(PaymentRecord), useValue: mockRecordRepo },
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

  // ── 款号从对账单带出（2026-08-08 King：拉结算单时要能按款号带入所有相关付款）──────
  // 此前 related_style_no 只有手填，合同类付款一律为空，结算那边按款号一条也捞不出来。
  describe('createPaymentRequest 带出款号', () => {
    const confirmedRec = (over: any = {}) => ({
      id: 9, status: 'CONFIRMED', factory_id: 5, total_amount: 10000,
      style_no: 'CHA271M500', contract_id: null, ...over,
    });

    it('从对账单带出 style_no 落到 related_style_no', async () => {
      mockManager.findOne.mockResolvedValue(confirmedRec());
      mockManager.find.mockResolvedValue([]);
      await service.createPaymentRequest(
        { type: ReconcileType.CONTRACT, factory_id: 5, amount: 100, reconcile_id: 9 } as any, 1,
      );
      expect(mockManager.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        related_style_no: 'CHA271M500',
      }));
    });

    it('手填的优先级高于对账单带出（人工指定不该被覆盖）', async () => {
      mockManager.findOne.mockResolvedValue(confirmedRec());
      mockManager.find.mockResolvedValue([]);
      await service.createPaymentRequest(
        { type: ReconcileType.CONTRACT, factory_id: 5, amount: 100, reconcile_id: 9, related_style_no: '手填款号' } as any, 1,
      );
      expect(mockManager.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        related_style_no: '手填款号',
      }));
    });

    it('对账单没有款号时给 null，不写空串', async () => {
      mockManager.findOne.mockResolvedValue(confirmedRec({ style_no: null }));
      mockManager.find.mockResolvedValue([]);
      await service.createPaymentRequest(
        { type: ReconcileType.CONTRACT, factory_id: 5, amount: 100, reconcile_id: 9 } as any, 1,
      );
      expect(mockManager.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        related_style_no: null,
      }));
    });

    it('多款合并的长款号能整段带过来——related_style_no 已加宽到 200，与来源同宽', async () => {
      // reconciliation.style_no 是 varchar(200)（工时对账多款合并会写「款A 等N款」，
      // 合同也可能跨多款）。目标列若仍是 60 会 Data too long；截断则按款号归集直接失配。
      const long = 'CHA271M500,CHA271M503,CHA271M502,CHA271M505,CHA271M507,CHA271M509,CHA271M511';
      expect(long.length).toBeGreaterThan(60);
      mockManager.findOne.mockResolvedValue(confirmedRec({ style_no: long }));
      mockManager.find.mockResolvedValue([]);
      await service.createPaymentRequest(
        { type: ReconcileType.CONTRACT, factory_id: 5, amount: 100, reconcile_id: 9 } as any, 1,
      );
      const arg = mockManager.create.mock.calls.at(-1)![1] as any;
      expect(arg.related_style_no).toBe(long);
      expect(arg.related_style_no.length).toBeLessThanOrEqual(200);
    });

    it('无对账单的付款（预付/无合同）不受影响，仍只认手填', async () => {
      mockPrepayRepo.find.mockResolvedValue([]);
      await service.createPaymentRequest(
        { type: ReconcileType.CONTRACT, factory_id: 5, amount: 100 } as any, 1,
      );
      expect(mockManager.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        related_style_no: null,
      }));
    });
  });

  // ── 改草稿（2026-08-10 King：非合同付款草稿建错了没法调）────────────────
  // 此前付款申请只有 建/提交/审批/付款/删除，**没有编辑端点**；删除又是管理员限定，
  // 业务自己建的草稿等于卡死。这组守住新加的编辑口和它的三道闸门。
  describe('updatePaymentRequest 改草稿', () => {
    const draft = (over: any = {}) => ({
      id: 9, approval_status: 'DRAFT', created_by: 5, factory_id: 3,
      amount: 1000, prepay_offset: 0, description: '旧', ...over,
    });
    const ADMIN = { id: 99, role: 'ADMIN' };
    const OWNER = { id: 5, role: 'BUSINESS' };

    it('草稿可改，actual_pay 跟着重算', async () => {
      mockPrRepo.findOne.mockResolvedValue(draft());
      mockPrepayRepo.find.mockResolvedValue([]);
      await service.updatePaymentRequest(9, { amount: 800, prepay_offset: 0 } as any, ADMIN);
      expect(mockPrRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        amount: 800, actual_pay: 800,
      }));
    });

    it('非草稿一律拒绝——已提交的金额是审批依据，已付款的会让勾稽断掉', async () => {
      for (const st of ['PENDING', 'APPROVED', 'PAID', 'REJECTED']) {
        mockPrRepo.findOne.mockResolvedValue(draft({ approval_status: st }));
        await expect(service.updatePaymentRequest(9, { amount: 1 } as any, ADMIN))
          .rejects.toThrow(BadRequestException);
      }
    });

    it('业务只能改自己建的草稿', async () => {
      mockPrRepo.findOne.mockResolvedValue(draft({ created_by: 777 }));
      await expect(service.updatePaymentRequest(9, { amount: 1 } as any, OWNER))
        .rejects.toThrow(ForbiddenException);
    });

    it('本人改自己的草稿放行', async () => {
      mockPrRepo.findOne.mockResolvedValue(draft({ created_by: 5 }));
      mockPrepayRepo.find.mockResolvedValue([]);
      await expect(service.updatePaymentRequest(9, { amount: 500 } as any, OWNER)).resolves.toBeDefined();
    });

    it('财务/管理员不受创建人限制', async () => {
      mockPrRepo.findOne.mockResolvedValue(draft({ created_by: 777 }));
      mockPrepayRepo.find.mockResolvedValue([]);
      await expect(service.updatePaymentRequest(9, { amount: 500 } as any, ADMIN)).resolves.toBeDefined();
    });

    it('改单同样要过冲抵预付的余额闸门，不能绕过创建时的校验', async () => {
      mockPrRepo.findOne.mockResolvedValue(draft());
      mockPrepayRepo.find.mockResolvedValue([makePrepayment({ balance: 100 })]);
      await expect(service.updatePaymentRequest(9, { prepay_offset: 500 } as any, ADMIN))
        .rejects.toThrow(BadRequestException);
    });

    it('金额必须大于 0', async () => {
      mockPrRepo.findOne.mockResolvedValue(draft());
      mockPrepayRepo.find.mockResolvedValue([]);
      await expect(service.updatePaymentRequest(9, { amount: 0 } as any, ADMIN))
        .rejects.toThrow(BadRequestException);
    });

    it('不存在的申请报 404', async () => {
      mockPrRepo.findOne.mockResolvedValue(null);
      await expect(service.updatePaymentRequest(9, {} as any, ADMIN)).rejects.toThrow(NotFoundException);
    });
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

  // UT-PAY-10: markPaid transitions APPROVED → PAID（L10 后走事务+悲观锁,mock 事务管理器）
  it('UT-PAY-10 markPaid transitions APPROVED→PAID', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.APPROVED });
    const manager = makeRecordManager(pr);
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));

    const result = await service.markPaid(1, 'http://example.com/slip.jpg', 99);
    expect(result.approval_status).toBe(PaymentApprovalStatus.PAID);
  });

  // UT-PAY-11: markPaid throws if not APPROVED
  it('UT-PAY-11 markPaid throws BadRequest if status is not APPROVED', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.PENDING });
    const manager = makeRecordManager(pr);
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));
    await expect(service.markPaid(1, 'url', 99)).rejects.toThrow(BadRequestException);
  });

  // UT-PAY-13: markPaid syncs linked reconciliation to PAID (系统开发手册·状态流转规则)
  it('UT-PAY-13 markPaid advances linked reconciliation to PAID', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.APPROVED, reconcile_id: 77 });
    const manager = makeRecordManager(pr);
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));

    await service.markPaid(1, 'http://example.com/slip.jpg', 99);
    expect(manager.update).toHaveBeenCalledWith(
      Reconciliation,
      expect.objectContaining({ id: 77, status: ReconciliationStatus.CONFIRMED }),
      expect.objectContaining({ status: ReconciliationStatus.PAID }),
    );
  });

  // UT-PAY-14: markPaid skips reconciliation sync when no reconcile_id (NO_CONTRACT flow)
  it('UT-PAY-14 markPaid does not touch reconciliation when reconcile_id is absent', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.APPROVED, reconcile_id: undefined });
    const manager = makeRecordManager(pr);
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));

    await service.markPaid(1, 'http://example.com/slip.jpg', 99);
    expect(manager.update).not.toHaveBeenCalled();
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
    await service.findPaymentRequests({ factory_id: 7, page: 1, size: 20, start_date: '2026-01-01', end_date: '2026-01-31' });
    const arg = mockPrRepo.findAndCount.mock.calls.at(-1)[0];
    expect(arg.where.factory_id).toBe(7);
    expect(arg.where.created_at).toBeDefined(); // Between(...) FindOperator
  });

  // UT-PAY-16: 对账→付款申请反查（关联单据 chip）
  it('UT-PAY-16 findPaymentRequests filters by reconcile_id', async () => {
    mockPrRepo.findAndCount.mockResolvedValue([[], 0]);
    await service.findPaymentRequests({ reconcile_id: 33 });
    const arg = mockPrRepo.findAndCount.mock.calls.at(-1)[0];
    expect(arg.where.reconcile_id).toBe(33);
  });

  // UT-PAY-17: 空串筛选项（前端清空 el-select/日期区间会发 ''）不得被当作过滤条件
  it('UT-PAY-17 findPaymentRequests ignores empty-string filters', async () => {
    mockPrRepo.findAndCount.mockResolvedValue([[], 0]);
    await service.findPaymentRequests({ approval_status: '' as any, due_start: '', paid_end: '' });
    const arg = mockPrRepo.findAndCount.mock.calls.at(-1)[0];
    expect(arg.where.approval_status).toBeUndefined();
    expect(arg.where.due_date).toBeUndefined();
    expect(arg.where.slip_uploaded_at).toBeUndefined();
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

  // ===== H8/M4/L10/L7-① 回归 =====
  const makeRec = (overrides = {}) => ({
    id: 7,
    status: ReconciliationStatus.CONFIRMED,
    type: ReconcileType.CONTRACT,
    factory_id: 5,
    total_amount: 10000,
    contract_id: null,
    deleted: 0,
    ...overrides,
  });

  // UT-H8-01: DRAFT/PENDING 对账单不可建付款申请（须先复核确认）
  it('UT-H8-01 createPaymentRequest rejects DRAFT/PENDING reconciliation', async () => {
    mockManager.findOne.mockResolvedValue(makeRec({ status: ReconciliationStatus.DRAFT }));
    const dto = { type: ReconcileType.CONTRACT, factory_id: 5, amount: 3000, reconcile_id: 7 };
    await expect(service.createPaymentRequest(dto as any, 1)).rejects.toThrow(/未复核确认/);
    mockManager.findOne.mockResolvedValue(makeRec({ status: ReconciliationStatus.PENDING }));
    await expect(service.createPaymentRequest(dto as any, 1)).rejects.toThrow(/未复核确认/);
  });

  // UT-H8-02: CONFIRMED 对账单可正常建付款申请
  it('UT-H8-02 createPaymentRequest allows CONFIRMED reconciliation', async () => {
    mockManager.findOne.mockResolvedValue(makeRec());
    const dto = { type: ReconcileType.CONTRACT, factory_id: 5, amount: 3000, reconcile_id: 7 };
    await expect(service.createPaymentRequest(dto as any, 1)).resolves.toBeDefined();
    expect(mockManager.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      reconcile_id: 7,
      amount: 3000,
    }));
  });

  // UT-M4-01: 申请 factory_id 与对账单归属工厂不一致时拦截
  it('UT-M4-01 createPaymentRequest rejects factory mismatch with reconciliation', async () => {
    mockManager.findOne.mockResolvedValue(makeRec({ factory_id: 8 }));
    const dto = { type: ReconcileType.CONTRACT, factory_id: 5, amount: 3000, reconcile_id: 7 };
    await expect(service.createPaymentRequest(dto as any, 1)).rejects.toThrow(/不一致/);
  });

  // UT-H8-03: 分批付清联动对账单 0 行命中 → 抛错回滚（付款/对账原子一致）
  it('UT-H8-03 addPaymentRecord final payment rolls back when reconciliation sync hits 0 rows', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.APPROVED, actual_pay: 5000, paid_total: 3000, reconcile_id: 7 });
    const manager = makeRecordManager(pr);
    manager.update.mockResolvedValue({ affected: 0 });
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));
    await expect(service.addPaymentRecord(1, { pay_date: '2026-07-09', amount: 2000, slip_url: '/u/slip.png' }, 3))
      .rejects.toThrow(/非已确认状态/);
  });

  // UT-H8-04: markPaid 联动对账单 0 行命中 → 抛错回滚
  it('UT-H8-04 markPaid rolls back when reconciliation sync hits 0 rows', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.APPROVED, reconcile_id: 7 });
    const manager = makeRecordManager(pr);
    manager.update.mockResolvedValue({ affected: 0 });
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));
    await expect(service.markPaid(1, 'http://example.com/slip.jpg', 99)).rejects.toThrow(/非已确认状态/);
  });

  // UT-L10-01: markPaid 在事务内以悲观锁读取申请（与 addPaymentRecord 互斥）
  it('UT-L10-01 markPaid reads request with pessimistic_write lock inside transaction', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.APPROVED });
    const manager = makeRecordManager(pr);
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));
    await service.markPaid(1, 'http://example.com/slip.jpg', 99);
    expect(mockDataSource.transaction).toHaveBeenCalled();
    expect(manager.findOne).toHaveBeenCalledWith(PaymentRequest, expect.objectContaining({
      lock: { mode: 'pessimistic_write' },
    }));
  });

  // UT-L7-01: 无合同费用对账付清后,按款号补标同款式结算单 needs_recalc
  it('UT-L7-01 final payment on NO_CONTRACT reconciliation marks settlement needs_recalc by style_no', async () => {
    const pr = makePR({ approval_status: PaymentApprovalStatus.APPROVED, actual_pay: 5000, paid_total: 3000, reconcile_id: 7 });
    const ncRec = makeRec({ type: ReconcileType.NO_CONTRACT, style_no: 'ST001' });
    const manager = makeRecordManager(pr);
    manager.findOne.mockImplementation((e: any) => Promise.resolve(e === Reconciliation ? ncRec : pr));
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));
    await service.addPaymentRecord(1, { pay_date: '2026-07-09', amount: 2000, slip_url: '/u/slip.png' }, 3);
    const recalcCall = manager.query.mock.calls.find((c: any[]) => String(c[0]).includes('order_main'));
    expect(recalcCall).toBeDefined();
    expect(recalcCall[1]).toEqual(['ST001']);
  });

  // ——— 工厂账单（2026-08-11 qiao：按工厂拉出该公司所有账单）———
  describe('getFactoryStatement', () => {
    /** 账单三类单据默认都空，各用例只塞自己关心的那一类 */
    const armStatement = (opts: { prs?: any[]; prepays?: any[]; recs?: any[]; records?: any[] } = {}) => {
      mockPrRepo.find.mockResolvedValue(opts.prs ?? []);
      mockPrepayRepo.find.mockResolvedValue(opts.prepays ?? []);
      mockReconcileRepo.find.mockResolvedValue(opts.recs ?? []);
      mockRecordRepo.find.mockResolvedValue(opts.records ?? []);
      // 第一条 query 是查工厂，后面的是补单号/合同号
      mockDataSource.query.mockResolvedValue([{ id: 5, name: '苏州某某制衣有限公司', short_name: '苏州某某' }]);
    };

    it('UT-STMT-01 工厂不存在直接 404，不返回一份空账单让人以为这家没有往来', async () => {
      mockDataSource.query.mockResolvedValue([]);
      await expect(service.getFactoryStatement(999)).rejects.toThrow(NotFoundException);
    });

    it('UT-STMT-02 已驳回的申请明细里照列，但一分钱都不进合计', async () => {
      armStatement({ prs: [
        makePR({ id: 1, amount: 1000, actual_pay: 1000, approval_status: PaymentApprovalStatus.APPROVED }),
        makePR({ id: 2, amount: 9999, actual_pay: 9999, approval_status: PaymentApprovalStatus.REJECTED }),
      ] });
      const st: any = await service.getFactoryStatement(5);
      expect(st.requests).toHaveLength(2);            // 明细不能少行，否则跟系统里的条数对不上
      expect(st.summary.rejected_count).toBe(1);
      expect(st.summary.request_amount).toBe(1000);   // 9999 不算
      expect(st.summary.payable_total).toBe(1000);
    });

    it('UT-STMT-03 应付只算已批准/已付款——草稿和待审批还不构成欠款', async () => {
      armStatement({ prs: [
        makePR({ id: 1, amount: 100, actual_pay: 100, approval_status: PaymentApprovalStatus.DRAFT }),
        makePR({ id: 2, amount: 200, actual_pay: 200, approval_status: PaymentApprovalStatus.PENDING }),
        makePR({ id: 3, amount: 300, actual_pay: 300, approval_status: PaymentApprovalStatus.APPROVED }),
        makePR({ id: 4, amount: 400, actual_pay: 400, approval_status: PaymentApprovalStatus.PAID }),
      ] });
      const st: any = await service.getFactoryStatement(5);
      expect(st.summary.request_amount).toBe(1000);   // 申请金额是全部（未驳回）
      expect(st.summary.payable_total).toBe(700);     // 应付只有 300+400
    });

    it('UT-STMT-04 实付记录一次取回并按 pr_id 归位（不是每张申请查一次）', async () => {
      armStatement({
        prs: [makePR({ id: 1, actual_pay: 5000, approval_status: PaymentApprovalStatus.APPROVED }),
              makePR({ id: 2, actual_pay: 3000, approval_status: PaymentApprovalStatus.APPROVED })],
        records: [
          { id: 1, pr_id: 1, amount: 2000, pay_date: '2026-08-01' },
          { id: 2, pr_id: 1, amount: 1000, pay_date: '2026-08-05' },
          { id: 3, pr_id: 2, amount: 500, pay_date: '2026-08-06' },
        ],
      });
      const st: any = await service.getFactoryStatement(5);
      expect(mockRecordRepo.find).toHaveBeenCalledTimes(1);
      expect(mockRecordRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { pr_id: In([1, 2]) } }));
      expect(st.requests[0].records).toHaveLength(2);
      expect(st.requests[0].paid_sum).toBe(3000);
      expect(st.requests[1].paid_sum).toBe(500);
      expect(st.summary.paid_total).toBe(3500);
      expect(st.summary.unpaid_total).toBe(8000 - 3500);
    });

    it('UT-STMT-05 没有一张申请时不查付款记录（别拿空 IN () 去撞 SQL 语法错）', async () => {
      armStatement({ prs: [] });
      await service.getFactoryStatement(5);
      expect(mockRecordRepo.find).not.toHaveBeenCalled();
    });

    it('UT-STMT-06 actual_pay 没落库时回落到 申请金额-冲抵预付，不当成 0', async () => {
      armStatement({ prs: [makePR({ id: 1, amount: 1000, prepay_offset: 300, actual_pay: null, approval_status: PaymentApprovalStatus.APPROVED })] });
      const st: any = await service.getFactoryStatement(5);
      expect(st.summary.payable_total).toBe(700);
    });

    it('UT-STMT-07 区间过滤：datetime 列带时分秒、date 列不带（否则当天的单据整天漏掉）', async () => {
      armStatement();
      await service.getFactoryStatement(5, '2026-08-01', '2026-08-31');
      expect(mockPrRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ created_at: Between('2026-08-01 00:00:00', '2026-08-31 23:59:59') }),
      }));
      expect(mockPrepayRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ pay_date: Between('2026-08-01', '2026-08-31') }),
      }));
    });

    it('UT-STMT-08 不给区间就是「所有账单」——不能悄悄塞个默认区间把老单据滤掉', async () => {
      armStatement();
      await service.getFactoryStatement(5);
      expect(mockPrRepo.find).toHaveBeenCalledWith({ where: { factory_id: 5, deleted: 0 }, order: { id: 'ASC' } });
      expect(mockPrepayRepo.find).toHaveBeenCalledWith({ where: { factory_id: 5 }, order: { id: 'ASC' } });
    });

    it('UT-STMT-09 预付款汇总给出 金额/已用/余额 三个口径', async () => {
      armStatement({ prepays: [
        makePrepayment({ id: 1, amount: 1000, used_amount: 400, balance: 600 }),
        makePrepayment({ id: 2, amount: 500, used_amount: 500, balance: 0 }),
      ] });
      const st: any = await service.getFactoryStatement(5);
      expect(st.summary).toEqual(expect.objectContaining({
        prepay_count: 2, prepay_amount: 1500, prepay_used: 900, prepay_balance: 600,
      }));
    });
  });


  // ——— #92 非合同付款自行登记/上传发票（King 2026-08-12）———
  describe('付款申请上的发票', () => {
    it('UT-PAY-INV-01 建单时带上发票号与附件', async () => {
      mockPrepayRepo.find.mockResolvedValue([]);
      await service.createPaymentRequest({
        type: ReconcileType.NO_CONTRACT, factory_id: 5, amount: 1000,
        invoice_no: 'INV-2026-001', invoice_url: '/u/a.jpg,/u/b.jpg',
      } as any, 1);
      expect(mockManager.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        invoice_no: 'INV-2026-001', invoice_url: '/u/a.jpg,/u/b.jpg',
      }));
    });

    it('UT-PAY-INV-02 不填发票时存 null，不写空串（列表判空才靠得住）', async () => {
      mockPrepayRepo.find.mockResolvedValue([]);
      await service.createPaymentRequest({ type: ReconcileType.NO_CONTRACT, factory_id: 5, amount: 1000 } as any, 1);
      expect(mockManager.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        invoice_no: null, invoice_url: null,
      }));
    });

    it('UT-PAY-INV-03 改草稿能补票，没传的字段保持原值', async () => {
      mockPrRepo.findOne.mockResolvedValue({
        id: 1, approval_status: PaymentApprovalStatus.DRAFT, created_by: 3, factory_id: 5,
        amount: 1000, prepay_offset: 0, invoice_no: null, invoice_url: null, bank_name: '中行',
      });
      mockPrepayRepo.find.mockResolvedValue([]);
      // 断言「存进去的是什么」而不是返回值：save 的 mock 会被同文件其它用例改成固定返回，
      // 拿返回值断言会在全量跑时莫名其妙地挂（实测踩过）
      await service.updatePaymentRequest(1, { invoice_no: 'INV-9' } as any, { id: 3, role: UserRole.FINANCE });
      const saved = mockPrRepo.save.mock.calls.at(-1)![0];
      expect(saved.invoice_no).toBe('INV-9');
      expect(saved.bank_name).toBe('中行');   // 没传的不动
    });

    it('UT-PAY-SUP-01 主管能改别人建的付款草稿——权限视同管理员，别卡在服务层', async () => {
      mockPrRepo.findOne.mockResolvedValue({
        id: 1, approval_status: PaymentApprovalStatus.DRAFT, created_by: 999, factory_id: 5,
        amount: 1000, prepay_offset: 0,
      });
      mockPrepayRepo.find.mockResolvedValue([]);
      // 前端按 hasRole(ADMIN) 把「编辑」显示给主管、控制器也放行，服务层再挡就是"按钮点不动"
      await expect(service.updatePaymentRequest(1, { description: 'x' } as any,
        { id: 3, role: UserRole.SUPERVISOR })).resolves.toBeDefined();
    });

    it('UT-PAY-SUP-02 业务仍然只能改自己建的（这条闸门不能被上一条顺手放开）', async () => {
      mockPrRepo.findOne.mockResolvedValue({
        id: 1, approval_status: PaymentApprovalStatus.DRAFT, created_by: 999, factory_id: 5,
        amount: 1000, prepay_offset: 0,
      });
      await expect(service.updatePaymentRequest(1, { description: 'x' } as any,
        { id: 3, role: UserRole.BUSINESS })).rejects.toThrow(ForbiddenException);
    });

    it('UT-PAY-INV-04 改草稿时没传发票，原来传过的票不能被清掉', async () => {
      mockPrRepo.findOne.mockResolvedValue({
        id: 1, approval_status: PaymentApprovalStatus.DRAFT, created_by: 3, factory_id: 5,
        amount: 1000, prepay_offset: 0, invoice_no: 'INV-旧', invoice_url: '/u/old.jpg',
      });
      mockPrepayRepo.find.mockResolvedValue([]);
      await service.updatePaymentRequest(1, { description: '只改了说明' } as any, { id: 3, role: UserRole.FINANCE });
      const saved = mockPrRepo.save.mock.calls.at(-1)![0];
      expect(saved.invoice_no).toBe('INV-旧');
      expect(saved.invoice_url).toBe('/u/old.jpg');
    });
  });
});

// ── #119 qiao：「用款申请看不到是哪个业务申请的」──
// created_by 一直在存，只是列表接口从没把人名带出来
describe('付款申请列表补出申请人（#119）', () => {
  let svc: PaymentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDataSource.transaction.mockImplementation((cb: any) => cb(mockManager));
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Prepayment), useValue: mockPrepayRepo },
        { provide: getRepositoryToken(PaymentRequest), useValue: mockPrRepo },
        { provide: getRepositoryToken(PaymentRecord), useValue: mockRecordRepo },
        { provide: getRepositoryToken(Reconciliation), useValue: mockReconcileRepo },
        { provide: NumberingService, useValue: new NumberingService(mockRedis as any) },
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();
    svc = m.get(PaymentService);
  });

  it('UT-PR-NAME-1: 优先用真名，没真名退回账号名', async () => {
    mockPrRepo.findAndCount.mockResolvedValue([[{ id: 1, created_by: 9 }, { id: 2, created_by: 10 }], 2]);
    mockDataSource.query.mockImplementation(async (sql: string) =>
      (sql.includes('sys_user') ? [{ id: 9, nm: '姚霜梅' }, { id: 10, nm: 'business_user' }] : []));
    const r: any = await svc.findPaymentRequests({} as any);
    expect(r.items.map((x: any) => x.created_by_name)).toEqual(['姚霜梅', 'business_user']);
  });

  it('UT-PR-NAME-2: 一次批量查，不按行逐条查账号（列表最多 100 行）', async () => {
    mockPrRepo.findAndCount.mockResolvedValue([
      [{ id: 1, created_by: 9 }, { id: 2, created_by: 9 }, { id: 3, created_by: 10 }], 3]);
    mockDataSource.query.mockImplementation(async (sql: string) =>
      (sql.includes('sys_user') ? [{ id: 9, nm: 'A' }, { id: 10, nm: 'B' }] : []));
    await svc.findPaymentRequests({} as any);
    const userQueries = mockDataSource.query.mock.calls.filter((c: any[]) => String(c[0]).includes('sys_user'));
    expect(userQueries).toHaveLength(1);
    expect(userQueries[0][1][0]).toEqual([9, 10]);   // 去重后只查两个 id
  });

  it('UT-PR-NAME-3: 账号被删/查不到时给 null，不伪造成「未知用户」', async () => {
    mockPrRepo.findAndCount.mockResolvedValue([[{ id: 1, created_by: 999 }], 1]);
    mockDataSource.query.mockResolvedValue([]);
    const r: any = await svc.findPaymentRequests({} as any);
    expect(r.items[0].created_by_name).toBeNull();
  });

  it('UT-PR-NAME-4: 没有 created_by 的历史行不炸、给 null', async () => {
    mockPrRepo.findAndCount.mockResolvedValue([[{ id: 1, created_by: null }], 1]);
    mockDataSource.query.mockResolvedValue([]);
    const r: any = await svc.findPaymentRequests({} as any);
    expect(r.items[0].created_by_name).toBeNull();
  });
});
