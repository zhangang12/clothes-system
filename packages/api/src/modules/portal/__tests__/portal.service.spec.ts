import { Test, TestingModule } from '@nestjs/testing';
import { ContractShipmentItem } from '../../contract/contract-shipment-item.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PortalService } from '../portal.service';
import { Contract } from '../../contract/contract.entity';
import { ContractMaterial } from '../../contract/contract-material.entity';
import { ContractShipment } from '../../contract/contract-shipment.entity';
import { ContractPortalLog } from '../../contract/contract-portal-log.entity';
import { OrderMain } from '../../order/order-main.entity';
import { Reconciliation } from '../../reconciliation/reconciliation.entity';
import { ReconciliationShipment } from '../../reconciliation/reconciliation-shipment.entity';
import { PaymentRequest } from '../../payment/payment-request.entity';
import { OrderMaterial } from '../../order/order-material.entity';
import { OrderSizeMatrix } from '../../order/order-size-matrix.entity';
import { Factory } from '../../factory/factory.entity';
import { CompanyProfile } from '../../company/company-profile.entity';
import { NumberingService } from '../../../common/services/numbering.service';
import { ContractPortalStatus, PaymentApprovalStatus } from '@i9/types';

const makeContract = (overrides = {}) => ({
  id: 1,
  contract_no: 'HT-20240101-001',
  type: 'MATERIAL',
  factory_id: 10,
  order_id: 100,
  total_amount: 5000,
  currency: 'CNY',
  deposit_ratio: 30,
  mid_ratio: 40,
  final_ratio: 30,
  account_period_days: 45,
  portal_status: ContractPortalStatus.PUSHED,
  status: 'ACTIVE',
  deleted: 0,
  ...overrides,
});

const makeMaterial = () => ({
  id: 1,
  contract_id: 1,
  sort_order: 0,
  item_name: '面料A',
  spec: '100%棉',
  unit: '米',
  unit_price: 10,
  qty: 500,
  amount: 5000,
});

const makeRepo = () => {
  const repo: any = {
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    // 落库后带上主键（真库行为）：门户「我要对账」要拿新对账单 id 去占用批次
    save: jest.fn().mockImplementation((v: any) => Promise.resolve(Array.isArray(v) || v?.id ? v : { ...v, id: 99 })),
    create: jest.fn().mockImplementation((v: any) => v),
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  repo.createQueryBuilder = jest.fn(() => {
    const qb: any = {
      where: jest.fn(() => qb), andWhere: jest.fn(() => qb), addSelect: jest.fn(() => qb),
      orderBy: jest.fn(() => qb), addOrderBy: jest.fn(() => qb), skip: jest.fn(() => qb), take: jest.fn(() => qb),
      // 复用 findAndCount 的桩数据,保持既有用例断言不变
      getManyAndCount: jest.fn(() => repo.findAndCount()),
    };
    return qb;
  });
  return repo;
};

describe('PortalService', () => {
  let service: PortalService;
  let contractRepo: any;
  let materialRepo: any;
  let logRepo: any;
  let reconcileRepo: any;
  let shipmentRepo: any;
  let shipmentItemRepo: any;
  let orderRepo: any;
  let prRepo: any;
  let mockManager: any;

  beforeEach(async () => {
    contractRepo = makeRepo();
    materialRepo = makeRepo();
    logRepo = makeRepo();
    reconcileRepo = makeRepo();
    shipmentRepo = makeRepo();
    shipmentItemRepo = makeRepo();
    orderRepo = makeRepo();
    prRepo = makeRepo();
    // B012~B015 之后，门户所有写动作都在事务内经 manager 走。这里让 manager 按实体分派回同一批 repo 桩，
    // 既有用例的断言（contractRepo.save / logRepo.create / shipmentRepo.find…）不必改口径
    const byEntity = new Map<any, any>([
      [Contract, contractRepo], [ContractMaterial, materialRepo], [ContractShipment, shipmentRepo],
      [ContractShipmentItem, shipmentItemRepo], [ContractPortalLog, logRepo], [OrderMain, orderRepo],
      [Reconciliation, reconcileRepo], [PaymentRequest, prRepo],
    ]);
    const via = (name: string, fallback: (v?: any) => any) =>
      jest.fn().mockImplementation((entity: any, ...args: any[]) => {
        const repo = byEntity.get(entity);
        return repo ? repo[name](...args) : fallback(args[0]);
      });
    mockManager = {
      create: via('create', (v) => v),
      save: via('save', (v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 99 })),
      findOne: via('findOne', () => Promise.resolve(null)),
      find: via('find', () => Promise.resolve([])),
      delete: via('delete', () => Promise.resolve({ affected: 1 })),
      update: via('update', () => Promise.resolve({ affected: 1 })),
      query: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalService,
        { provide: getRepositoryToken(Contract), useValue: contractRepo },
        { provide: getRepositoryToken(ContractMaterial), useValue: materialRepo },
        { provide: getRepositoryToken(ContractShipment), useValue: shipmentRepo },
        { provide: getRepositoryToken(ContractShipmentItem), useValue: shipmentItemRepo },
        { provide: getRepositoryToken(ContractPortalLog), useValue: logRepo },
        { provide: getRepositoryToken(OrderMain), useValue: orderRepo },
        { provide: getRepositoryToken(OrderMaterial), useValue: makeRepo() },
        { provide: getRepositoryToken(OrderSizeMatrix), useValue: makeRepo() },
        { provide: getRepositoryToken(Reconciliation), useValue: reconcileRepo },
        { provide: getRepositoryToken(ReconciliationShipment), useValue: makeRepo() },
        { provide: getRepositoryToken(PaymentRequest), useValue: prRepo },
        { provide: getRepositoryToken(Factory), useValue: makeRepo() },
        { provide: getRepositoryToken(CompanyProfile), useValue: makeRepo() },
        { provide: NumberingService, useValue: { nextWithSegment: jest.fn().mockResolvedValue('DZ-K-001'), next: jest.fn().mockResolvedValue('PR-20260709-001') } },
        { provide: DataSource, useValue: { transaction: jest.fn().mockImplementation((cb: any) => cb(mockManager)) } },
      ],
    }).compile();

    service = module.get<PortalService>(PortalService);
  });

  // 对账明细行落库参数（manager.save(ReconciliationShipment, lines)）
  const reconcileShipmentSaves = () => {
    const call = mockManager.save.mock.calls.find(
      (c: any[]) => Array.isArray(c[1]) && c[1][0]?.reconcile_id !== undefined && c[1][0]?.item_name !== undefined,
    );
    return call ? call[1] : [];
  };

  // UT-PORTAL-01: getContracts returns paginated list for supplier factory
  it('UT-PORTAL-01 getContracts returns list for supplier factory', async () => {
    const contracts = [makeContract()];
    contractRepo.findAndCount.mockResolvedValue([contracts, 1]);
    const result = await service.getContracts(10, 1, 20);
    expect(result.total).toBe(1);
    expect(result.items).toEqual(contracts);
  });

  // UT-PORTAL-02: getContracts filters by portal_status when provided
  it('UT-PORTAL-02 getContracts filters by portal_status', async () => {
    contractRepo.findAndCount.mockResolvedValue([[], 0]);
    await service.getContracts(10, 1, 20, 'STAMPED');
    // 改为 qb 实现(待我处理优先排序,P2#27):校验状态过滤经 andWhere 注入
    const qb = contractRepo.createQueryBuilder.mock.results[0].value;
    expect(qb.andWhere).toHaveBeenCalledWith('c.portal_status = :ps', { ps: 'STAMPED' });
  });

  // UT-PORTAL-03: getContract returns contract with materials and logs
  it('UT-PORTAL-03 getContract returns contract with materials and logs', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.PUSHED });
    const material = makeMaterial();
    contractRepo.findOne.mockResolvedValue(contract);
    materialRepo.find.mockResolvedValue([material]);
    logRepo.find.mockResolvedValue([]);

    const result = await service.getContract(1, 10);
    expect(result.contract_no).toBe('HT-20240101-001');
    expect(result.materials).toHaveLength(1);
    expect(result.logs).toHaveLength(0);
  });

  // UT-PORTAL-04: getContract throws NotFoundException for wrong factory
  it('UT-PORTAL-04 getContract throws NotFoundException for wrong factory', async () => {
    contractRepo.findOne.mockResolvedValue(null);
    await expect(service.getContract(1, 99)).rejects.toThrow(NotFoundException);
  });

  // UT-PORTAL-05: getContract throws NotFoundException for DRAFT contract
  it('UT-PORTAL-05 getContract hides DRAFT contracts from supplier', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.DRAFT });
    contractRepo.findOne.mockResolvedValue(contract);
    await expect(service.getContract(1, 10)).rejects.toThrow(NotFoundException);
  });

  // UT-PORTAL-06: stamp transitions PUSHED → STAMPED and locks snapshot
  it('UT-PORTAL-06 stamp transitions PUSHED→STAMPED and creates snapshot', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.PUSHED });
    const material = makeMaterial();
    contractRepo.findOne.mockResolvedValue(contract);
    materialRepo.find.mockResolvedValue([material]);
    contractRepo.save.mockResolvedValue({ ...contract, portal_status: ContractPortalStatus.STAMPED });

    const result = await service.stamp(1, 'supplier_A', 10, true);
    expect(result.portal_status).toBe(ContractPortalStatus.STAMPED);
    expect((contract as any).snapshot_json).toMatchObject({
      contract_no: 'HT-20240101-001',
      materials: [expect.objectContaining({ item_name: '面料A' })],
    });
    expect(logRepo.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'STAMP', remark: '已阅读并同意合同条款' }));
  });

  // UT-PORTAL-06b: stamp rejected until 已阅读并同意合同条款 勾选（agreed=false）
  it('UT-PORTAL-06b stamp throws BadRequestException when terms not agreed', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.PUSHED });
    contractRepo.findOne.mockResolvedValue(contract);
    await expect(service.stamp(1, 'supplier_A', 10, false)).rejects.toThrow(BadRequestException);
    expect(contractRepo.save).not.toHaveBeenCalled();
  });

  // UT-PORTAL-07: stamp throws if contract is not PUSHED
  it('UT-PORTAL-07 stamp throws BadRequestException if status is not PUSHED', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.STAMPED });
    contractRepo.findOne.mockResolvedValue(contract);
    await expect(service.stamp(1, 'supplier_A', 10, true)).rejects.toThrow(BadRequestException);
  });

  // UT-PORTAL-08: stamp throws NotFoundException for wrong factory
  it('UT-PORTAL-08 stamp throws NotFoundException for wrong factory_id', async () => {
    contractRepo.findOne.mockResolvedValue(null);
    await expect(service.stamp(1, 'supplier_A', 99, true)).rejects.toThrow(NotFoundException);
  });

  // UT-PORTAL-09: confirmShipping transitions STAMPED → SHIPPING
  it('UT-PORTAL-09 confirmShipping transitions STAMPED→SHIPPING', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.STAMPED });
    contractRepo.findOne.mockResolvedValue(contract);
    contractRepo.save.mockResolvedValue({ ...contract, portal_status: ContractPortalStatus.SHIPPING });

    const result = await service.confirmShipping(1, 'supplier_A', 10, { qty: 100, express_company: '顺丰', express_no: 'SF1' } as any);
    expect(result.portal_status).toBe(ContractPortalStatus.SHIPPING);
    expect(logRepo.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'SHIP' }));
  });

  // UT-PORTAL-10: confirmShipping throws if not STAMPED
  it('UT-PORTAL-10 confirmShipping throws BadRequestException if not STAMPED', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.PUSHED });
    contractRepo.findOne.mockResolvedValue(contract);
    await expect(service.confirmShipping(1, 'supplier_A', 10)).rejects.toThrow(BadRequestException);
  });

  // UT-PORTAL-11: uploadInvoice 校验发票金额=对账金额并把发票落到对账单（设计稿 门户开票 / 06 D2）
  it('UT-PORTAL-11 uploadInvoice validates amount and persists invoice to reconciliation', async () => {
    contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.RECONCILED }));
    reconcileRepo.find.mockResolvedValue([
      { id: 7, reconcile_no: 'DZ-1', total_amount: 5000, status: 'CONFIRMED', invoice_no: null },
    ]);
    await service.uploadInvoice(1, 'supplier_A', 10, { invoice_no: 'INV-001', invoice_amount: 5000 });
    expect(reconcileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ invoice_no: 'INV-001', invoice_amount: 5000, has_invoice: 1 }),
    );
    expect(logRepo.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'INVOICE' }));
  });

  // UT-PORTAL-11b: 发票金额与对账金额不一致 → 拒绝提交,不落库
  it('UT-PORTAL-11b uploadInvoice rejects when invoice amount != reconciliation amount', async () => {
    contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.RECONCILED }));
    reconcileRepo.find.mockResolvedValue([
      { id: 7, reconcile_no: 'DZ-1', total_amount: 5000, status: 'CONFIRMED', invoice_no: null },
    ]);
    await expect(
      service.uploadInvoice(1, 'supplier_A', 10, { invoice_no: 'INV-001', invoice_amount: 4000 }),
    ).rejects.toThrow(BadRequestException);
    expect(reconcileRepo.save).not.toHaveBeenCalled();
  });

  // UT-PORTAL-12: uploadInvoice throws before 对账（开票须对账后）—— SHIPPING 尚不可开票
  it('UT-PORTAL-12 uploadInvoice throws BadRequestException before 对账 (SHIPPING)', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.SHIPPING });
    contractRepo.findOne.mockResolvedValue(contract);
    await expect(service.uploadInvoice(1, 'supplier_A', 10, {})).rejects.toThrow(BadRequestException);
  });

  // ===== 我要对账（设计稿 05 v2.2 §C 第三步）=====
  const makeBatch = (overrides = {}) => ({
    id: 11, contract_id: 1, ship_no: 'FH-K-001', qty: 1520,
    snapshot_unit_price: 1, amount: 1520,
    approval_status: 'APPROVED', reconcile_id: null,
    ...overrides,
  });

  // UT-PORTAL-13: 勾选已审批批次 → 自动算金额、生成 PENDING 对账单、占用批次、写 RECONCILE 日志
  it('UT-PORTAL-13 createReconcile sums approved batches into PENDING reconciliation and occupies them', async () => {
    contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.SHIPPING, created_by: 7 }));
    shipmentRepo.find.mockResolvedValue([
      makeBatch({ id: 11, amount: 1520 }),
      makeBatch({ id: 12, ship_no: 'FH-K-002', qty: 2300, amount: 2300 }),
    ]);
    const rec: any = await service.createReconcile(1, 'supplier_A', 10, { shipment_ids: [11, 12] });
    expect(rec.total_amount).toBe(3820); // 合同单价×已发数量 自动算（设计稿 ¥3,820）
    expect(rec.status).toBe('PENDING'); // 确认对账·推业务审批
    expect(rec.created_by).toBe(7); // 归属合同业务员
    // 批次被占用（manager.save(ContractShipment, batches) 且 reconcile_id 已写入）
    const savedBatches = mockManager.save.mock.calls.find((c: any[]) => Array.isArray(c[1]) && c[1][0]?.ship_no?.startsWith('FH') && c[1][0]?.reconcile_id);
    expect(savedBatches).toBeTruthy();
    expect(logRepo.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'RECONCILE' }));
  });

  // UT-PORTAL-13b: 未审批批次被拒（B2 顺序锁定：对账只可勾已审批批次）
  it('UT-PORTAL-13b createReconcile rejects unapproved batch', async () => {
    contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.SHIPPING }));
    shipmentRepo.find.mockResolvedValue([makeBatch({ approval_status: 'PENDING' })]);
    await expect(service.createReconcile(1, 'supplier_A', 10, { shipment_ids: [11] }))
      .rejects.toThrow(/尚未通过业务审批/);
  });

  // UT-PORTAL-13c: 已被其他对账单占用的批次被拒（防重复对账）
  it('UT-PORTAL-13c createReconcile rejects batch already reconciled', async () => {
    contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.SHIPPING }));
    shipmentRepo.find.mockResolvedValue([makeBatch({ reconcile_id: 5 })]);
    await expect(service.createReconcile(1, 'supplier_A', 10, { shipment_ids: [11] }))
      .rejects.toThrow(/不可重复对账/);
  });

  // UT-PORTAL-13d: 非发货中状态不可对账（顺序锁定）
  it('UT-PORTAL-13d createReconcile rejects when contract not SHIPPING', async () => {
    contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.STAMPED }));
    await expect(service.createReconcile(1, 'supplier_A', 10, { shipment_ids: [11] }))
      .rejects.toThrow(/对账须在发货后/);
  });

  // ===== 撤回发货批次（门户B3 / L33 状态校验）=====

  // UT-PORTAL-14: COMPLETED 合同不可撤回批次（流程死角闸门，状态校验先于批次查询）
  it('UT-PORTAL-14 withdrawShipment rejects when contract COMPLETED', async () => {
    contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.COMPLETED }));
    await expect(service.withdrawShipment(1, 11, 'supplier_A', 10))
      .rejects.toThrow(/不可撤回发货批次/);
    expect(shipmentRepo.findOne).not.toHaveBeenCalled();
  });

  // UT-PORTAL-14b: PUSHED/STAMPED 等发货前状态同样拒绝（与前端按钮口径一致：仅 SHIPPING/RECONCILED 可撤回）
  it('UT-PORTAL-14b withdrawShipment rejects when contract STAMPED', async () => {
    contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.STAMPED }));
    await expect(service.withdrawShipment(1, 11, 'supplier_A', 10))
      .rejects.toThrow(BadRequestException);
    expect(shipmentRepo.findOne).not.toHaveBeenCalled();
  });

  // ── 2026-09-20 审查回归（B012/B013/B014/B015/B058/B059/B060/B061/B134）──
  describe('审查回归', () => {
    const LOCK = { mode: 'pessimistic_write' };
    const ship = { express_company: '顺丰', express_no: 'SF1' };

    it('B058 门户列表的 portal_status 只认可见白名单，草稿合同列不出来', async () => {
      await expect(service.getContracts(10, 1, 20, 'DRAFT')).rejects.toThrow('不支持的合同状态筛选');
      expect(contractRepo.createQueryBuilder).not.toHaveBeenCalled();
      contractRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.getContracts(10, 1, 20, 'STAMPED'); // 白名单内照旧
    });

    it('B012 确认出货在事务内锁合同行，累计已发按未驳回批次重算（不再基于内存旧值加减）', async () => {
      contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.SHIPPING, shipped_qty: 0 }));
      materialRepo.find.mockResolvedValue([makeMaterial()]);
      // 库里已经有两批各 500（并发下第二次请求读到的 contract.shipped_qty 仍是 0）
      shipmentRepo.find.mockResolvedValue([
        { id: 1, qty: 500, approval_status: 'APPROVED' },
        { id: 2, qty: 500, approval_status: 'APPROVED' },
      ]);
      const contract = await service.confirmShipping(1, 'supplier_A', 10, { qty: 500, ...ship } as any);
      expect(contract.shipped_qty).toBe(1000); // 内存加减会得 500
      expect(contractRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: LOCK }));
    });

    it('B012 被驳回的批次不计入累计已发', async () => {
      contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.SHIPPING, shipped_qty: 0 }));
      materialRepo.find.mockResolvedValue([makeMaterial()]);
      shipmentRepo.find.mockResolvedValue([
        { id: 1, qty: 500, approval_status: 'APPROVED' },
        { id: 2, qty: 300, approval_status: 'REJECTED' },
      ]);
      const contract = await service.confirmShipping(1, 'supplier_A', 10, { qty: 500, ...ship } as any);
      expect(contract.shipped_qty).toBe(500);
    });

    it('B061 发货日期取本地日历日，不用 UTC（凌晨建单会写成昨天）', async () => {
      // 在本机时区里挑一个「本地日期 ≠ UTC 日期」的时刻；正好是 UTC 时区时退化为等值断言
      const localStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const base = new Date(2026, 8, 20);
      const candidates = [new Date(2026, 8, 20, 0, 1), new Date(2026, 8, 20, 23, 59), base];
      const at = candidates.find((d) => d.toISOString().slice(0, 10) !== localStr(d)) ?? base;
      jest.useFakeTimers().setSystemTime(at);
      try {
        contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.SHIPPING, shipped_qty: 0 }));
        materialRepo.find.mockResolvedValue([makeMaterial()]);
        shipmentRepo.find.mockResolvedValue([{ id: 1, qty: 100, approval_status: 'APPROVED' }]);
        await service.confirmShipping(1, 'supplier_A', 10, { qty: 100, ...ship } as any);
        const saved = shipmentRepo.create.mock.calls.at(-1)[0];
        expect(saved.ship_date).toBe(localStr(at));
      } finally { jest.useRealTimers(); }
    });

    it('B059 合并发货整组一个事务：第 2 张报错时整组抛出，不留半截合并单', async () => {
      contractRepo.findOne.mockImplementation((opts: any) =>
        Promise.resolve(makeContract({ id: opts.where.id, portal_status: ContractPortalStatus.SHIPPING })));
      materialRepo.find.mockResolvedValue([makeMaterial()]);
      shipmentRepo.find.mockResolvedValue([{ id: 1, qty: 100, approval_status: 'APPROVED' }]);
      await expect(service.mergeShip('supplier_A', 10, {
        ...ship,
        entries: [
          { contract_id: 1, qty: 100 },
          { contract_id: 2, items: [{ material_id: 1, qty: 0 }] }, // 物料行全 0 → 抛「请至少为一行物料填写实发数」
        ],
      } as any)).rejects.toThrow('请至少为一行物料填写实发数');
      const ds: any = (service as any).dataSource;
      expect(ds.transaction).toHaveBeenCalledTimes(1); // 整组一个事务（此前逐合同各自落库）
    });

    it('B060 撤回被驳回的批次不再二次扣减：累计已发按剩余未驳回批次重算', async () => {
      // 业务驳回批次 22 时 recalcShippedQty 已把它扣掉（shipped_qty 停在 500）；供应商再撤回它
      contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.SHIPPING, shipped_qty: 500 }));
      shipmentRepo.findOne.mockResolvedValue({ id: 22, contract_id: 1, ship_no: 'FH-2', qty: 300, approval_status: 'REJECTED', reconcile_id: null });
      shipmentRepo.find.mockResolvedValue([{ id: 11, qty: 500, approval_status: 'APPROVED' }]); // 删掉 22 之后库里剩这一批
      await service.withdrawShipment(1, 22, 'supplier_A', 10);
      expect(contractRepo.save).toHaveBeenCalledWith(expect.objectContaining({ shipped_qty: 500 })); // 内存再减一次会得 200
      expect(contractRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: LOCK }));
    });

    it('B013 我要对账：合同行与批次行都在事务内加悲观写锁后再判占用', async () => {
      contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.SHIPPING, created_by: 7 }));
      shipmentRepo.find.mockResolvedValue([makeBatch({ id: 11, amount: 1520 })]);
      await service.createReconcile(1, 'supplier_A', 10, { shipment_ids: [11] });
      expect(contractRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: LOCK }));
      expect(shipmentRepo.find).toHaveBeenCalledWith(expect.objectContaining({ lock: LOCK }));
    });

    it('B134 对账金额逐批先取整再求和，表头 = 明细合计', async () => {
      contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.SHIPPING, created_by: 7 }));
      shipmentRepo.find.mockResolvedValue([1, 2, 3].map((id) =>
        makeBatch({ id, ship_no: `FH-${id}`, qty: 1, snapshot_unit_price: 1.23456, amount: null })));
      const rec: any = await service.createReconcile(1, 'supplier_A', 10, { shipment_ids: [1, 2, 3] });
      expect(rec.total_amount).toBe(3.7038); // 旧算法先求和后取整 = 3.7037，与明细合计差 0.0001
      const lines = reconcileShipmentSaves();
      expect(lines.map((l: any) => l.amount)).toEqual([1.2346, 1.2346, 1.2346]);
    });

    // uploadInvoice 公共桩：合同已对账 + 一张待开票的已确认对账单
    const invoiceSetup = (recOver: any = {}, prs: any[] = []) => {
      contractRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.RECONCILED }));
      reconcileRepo.find.mockResolvedValue([
        { id: 7, reconcile_no: 'DZ-1', total_amount: 5000, status: 'CONFIRMED', invoice_no: null, factory_id: 10, created_by: 7, ...recOver },
      ]);
      prRepo.find.mockResolvedValue(prs);
    };

    it('B014 开票整段进事务并锁合同/对账单行', async () => {
      invoiceSetup();
      await service.uploadInvoice(1, 'supplier_A', 10, { invoice_no: 'INV-001', invoice_amount: 5000 });
      expect(contractRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: LOCK }));
      expect(reconcileRepo.find).toHaveBeenCalledWith(expect.objectContaining({ lock: LOCK }));
      expect(prRepo.save).toHaveBeenCalledTimes(1); // 无既有申请 → 照常自动生成一张
    });

    it('B015 同一对账单已有在途/已批付款申请 → 不再重复生成（幂等）', async () => {
      invoiceSetup({}, [{ id: 1, amount: 5000, approval_status: PaymentApprovalStatus.PENDING, deleted: 0 }]);
      await service.uploadInvoice(1, 'supplier_A', 10, { invoice_no: 'INV-001', invoice_amount: 5000 });
      expect(prRepo.save).not.toHaveBeenCalled();
    });

    it('B015 先驳回过一张、后又批了一张 → 累计已达对账应付，不再补一张全额 PENDING', async () => {
      invoiceSetup({}, [
        { id: 1, amount: 5000, approval_status: PaymentApprovalStatus.REJECTED, deleted: 0 },
        { id: 2, amount: 5000, approval_status: PaymentApprovalStatus.APPROVED, deleted: 0 },
      ]);
      await service.uploadInvoice(1, 'supplier_A', 10, { invoice_no: 'INV-001', invoice_amount: 5000 });
      expect(prRepo.save).not.toHaveBeenCalled(); // 旧实现：findOne 取到 REJECTED 那条就再建一张 → 累计翻倍
    });

    it('B015 只被驳回过（没有在途/已批）→ 仍可自动生成，金额=对账应付', async () => {
      invoiceSetup({}, [{ id: 1, amount: 5000, approval_status: PaymentApprovalStatus.REJECTED, deleted: 0 }]);
      await service.uploadInvoice(1, 'supplier_A', 10, { invoice_no: 'INV-001', invoice_amount: 5000 });
      expect(prRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        reconcile_id: 7, factory_id: 10, amount: 5000, approval_status: PaymentApprovalStatus.PENDING,
      }));
    });

    it('B015 对账单归属工厂与合同不一致 → 拦下，不往错的工厂自动建申请', async () => {
      invoiceSetup({ factory_id: 99 });
      await expect(service.uploadInvoice(1, 'supplier_A', 10, { invoice_no: 'INV-001', invoice_amount: 5000 }))
        .rejects.toThrow('归属工厂与合同不一致');
      expect(prRepo.save).not.toHaveBeenCalled();
    });
  });
});
