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
import { NumberingService } from '../../../common/services/numbering.service';
import { ContractPortalStatus } from '@i9/types';

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
    save: jest.fn().mockImplementation((v: any) => Promise.resolve(v)),
    create: jest.fn().mockImplementation((v: any) => v),
    find: jest.fn().mockResolvedValue([]),
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
  let mockManager: any;

  beforeEach(async () => {
    contractRepo = makeRepo();
    materialRepo = makeRepo();
    logRepo = makeRepo();
    reconcileRepo = makeRepo();
    shipmentRepo = makeRepo();
    mockManager = {
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 99 })),
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalService,
        { provide: getRepositoryToken(Contract), useValue: contractRepo },
        { provide: getRepositoryToken(ContractMaterial), useValue: materialRepo },
        { provide: getRepositoryToken(ContractShipment), useValue: shipmentRepo },
        { provide: getRepositoryToken(ContractShipmentItem), useValue: makeRepo() },
        { provide: getRepositoryToken(ContractPortalLog), useValue: logRepo },
        { provide: getRepositoryToken(OrderMain), useValue: makeRepo() },
        { provide: getRepositoryToken(OrderMaterial), useValue: makeRepo() },
        { provide: getRepositoryToken(OrderSizeMatrix), useValue: makeRepo() },
        { provide: getRepositoryToken(Reconciliation), useValue: reconcileRepo },
        { provide: getRepositoryToken(ReconciliationShipment), useValue: makeRepo() },
        { provide: getRepositoryToken(PaymentRequest), useValue: makeRepo() },
        { provide: NumberingService, useValue: { nextWithSegment: jest.fn().mockResolvedValue('DZ-K-001'), next: jest.fn().mockResolvedValue('PR-20260709-001') } },
        { provide: DataSource, useValue: { transaction: jest.fn().mockImplementation((cb: any) => cb(mockManager)) } },
      ],
    }).compile();

    service = module.get<PortalService>(PortalService);
  });

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
});
