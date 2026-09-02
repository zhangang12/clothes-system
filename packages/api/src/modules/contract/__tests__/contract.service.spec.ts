import { Test, TestingModule } from '@nestjs/testing';
import { ChangeLogService } from '../../../common/changelog/change-log.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ContractService } from '../contract.service';
import { Contract, ContractStatus } from '../contract.entity';
import { ContractMaterial } from '../contract-material.entity';
import { ContractShipment } from '../contract-shipment.entity';
import { ContractPortalLog, PortalOperatorType } from '../contract-portal-log.entity';
import { OrderMaterial } from '../../order/order-material.entity';
import { OrderMain } from '../../order/order-main.entity';
import { OrderSizeMatrix } from '../../order/order-size-matrix.entity';
import { Factory } from '../../factory/factory.entity';
import { SupplierAccount } from '../../auth/supplier-account.entity';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
import { SysConfigService } from '../../../common/config/sys-config.service';
import { ContractPortalStatus, ContractType } from '@i9/types';
import { Reconciliation } from '../../reconciliation/reconciliation.entity';
import { ReconciliationShipment } from '../../reconciliation/reconciliation-shipment.entity';
import { Prepayment } from '../../payment/prepayment.entity';

const makeContract = (overrides = {}): any => ({
  id: 1,
  contract_no: 'CT2024010100001',
  type: 'MATERIAL',
  factory_id: 5,
  order_id: 10,
  total_amount: 10000,
  currency: 'CNY',
  portal_status: ContractPortalStatus.DRAFT,
  status: ContractStatus.ACTIVE,
  deleted: 0,
  ...overrides,
});

const mockRepo = {
  create: jest.fn().mockImplementation((v) => v),
  update: jest.fn().mockResolvedValue({ affected: 1 }), // 驳回批次后重算累计已发要用
  save: jest.fn().mockImplementation((v) => Promise.resolve({ ...v, id: v.id ?? 1 })),
  findOne: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  count: jest.fn().mockResolvedValue(0),
};
const mockMaterialRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockResolvedValue([]),
  find: jest.fn().mockResolvedValue([]),
};
const mockLogRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockResolvedValue({}),
  find: jest.fn().mockResolvedValue([]),
};
const mockOrderMaterialRepo = {
  find: jest.fn().mockResolvedValue([]),
};
const mockMatrixRepo = {
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
};
const mockSupplierRepo = {
  findOne: jest.fn().mockResolvedValue({ id: 1, factory_id: 5, status: 1 }),
  find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
  create: jest.fn().mockImplementation((v: any) => v),
  save: jest.fn().mockImplementation((v: any) => Promise.resolve({ ...v, id: 9 })),
};
const mockOrderRepo = {
  findOne: jest.fn().mockResolvedValue({ id: 10, qty_total: 1000, deleted: 0 }),
};
const mockFactoryRepo = {
  findOne: jest.fn().mockResolvedValue({ id: 7, name: '面料厂A', deleted: 0 }),
  find: jest.fn().mockResolvedValue([]), // 关键词搜供应商名时用
};
const mockRedis = { eval: jest.fn().mockResolvedValue(1), incr: jest.fn().mockResolvedValue(1), expire: jest.fn() };
// updateStatus 作废前检查对账/付款关联（L6）：按实体分流 mock
const mockReconRepo = { count: jest.fn().mockResolvedValue(0) };
const mockReconShipQb = {
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getCount: jest.fn().mockResolvedValue(0),
};
const mockReconShipRepo = { createQueryBuilder: jest.fn().mockReturnValue(mockReconShipQb) };
const mockPrepayRepo = { count: jest.fn().mockResolvedValue(0) };
const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb) => cb({
    create: jest.fn().mockImplementation((_, v) => v),
    save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    query: jest.fn().mockResolvedValue([]),
  })),
  getRepository: jest.fn().mockImplementation((entity: any) => {
    if (entity === Reconciliation) return mockReconRepo;
    if (entity === ReconciliationShipment) return mockReconShipRepo;
    if (entity === Prepayment) return mockPrepayRepo;
    if (entity === Factory) return mockFactoryRepo;
    return {};
  }),
};

const mockChangeLogDep = { record: jest.fn().mockResolvedValue(undefined), list: jest.fn().mockResolvedValue([]) };

describe('ContractService', () => {
  let service: ContractService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOrderMaterialRepo.find.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractService,
        { provide: ChangeLogService, useValue: mockChangeLogDep },
        { provide: getRepositoryToken(Contract), useValue: mockRepo },
        { provide: getRepositoryToken(ContractMaterial), useValue: mockMaterialRepo },
        { provide: getRepositoryToken(ContractShipment), useValue: { find: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } },
        { provide: getRepositoryToken(ContractPortalLog), useValue: mockLogRepo },
        { provide: getRepositoryToken(OrderMaterial), useValue: mockOrderMaterialRepo },
        { provide: getRepositoryToken(OrderMain), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderSizeMatrix), useValue: mockMatrixRepo },
        { provide: getRepositoryToken(Factory), useValue: mockFactoryRepo },
        { provide: getRepositoryToken(SupplierAccount), useValue: mockSupplierRepo },
        { provide: NumberingService, useValue: new NumberingService(mockRedis as any) },
        { provide: SysConfigService, useValue: { getNumber: jest.fn().mockImplementation((_k: string, fb = 0) => Promise.resolve(fb)) } },
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ContractService>(ContractService);
  });

  // UT-CON-01: create calculates total_amount from materials
  it('UT-CON-01 create calculates total_amount from material lines', async () => {
    const dto = {
      type: 'MATERIAL', factory_id: 5, order_id: 10,
      materials: [
        { item_name: '面料A', unit_price: 50, qty: 100 },
        { item_name: '面料B', unit_price: 30, qty: 200 },
      ],
    };
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    // total = 50*100 + 30*200 = 5000 + 6000 = 11000
    expect(manager.save.mock.calls[0][1]).toMatchObject({ total_amount: 11000 });
  });

  // UT-CON-02: create sets portal_status=DRAFT by default
  it('UT-CON-02 create initializes portal_status=DRAFT', async () => {
    const dto = {
      type: 'MATERIAL', factory_id: 5, order_id: 10,
      materials: [{ item_name: '面料A', unit_price: 10, qty: 100 }],
    };
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    expect(manager.save.mock.calls[0][1]).toMatchObject({ portal_status: ContractPortalStatus.DRAFT });
  });

  // UT-CON-12: create auto-derives materials from order_material when none provided (MATERIAL type)
  it('UT-CON-12 create auto-derives materials from order_material when dto.materials is empty (快照联动)', async () => {
    mockOrderMaterialRepo.find.mockResolvedValueOnce([
      { item_name: '面料A', unit: 'M', unit_price: 8, total_purchase: 150, sort_order: 0 },
      { item_name: '面料B', unit: 'M', unit_price: 5, total_purchase: 100, sort_order: 1 },
    ]);
    const dto = { type: ContractType.MATERIAL, factory_id: 5, order_id: 10 };
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    expect(mockOrderMaterialRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { order_id: 10 } }));
    // total = 8*150 + 5*100 = 1200 + 500 = 1700
    expect(manager.save.mock.calls[0][1]).toMatchObject({ total_amount: 1700 });
    const materialSaveCall = manager.save.mock.calls.find((c: any[]) => Array.isArray(c[1]));
    expect(materialSaveCall[1]).toHaveLength(2);
    expect(materialSaveCall[1][0]).toMatchObject({ item_name: '面料A', unit_price: 8, qty: 150 });
  });

  // UT-CON-13: create throws when no materials provided and no order_material to derive from
  it('UT-CON-13 create throws BadRequest when materials empty and order has no order_material records', async () => {
    mockOrderMaterialRepo.find.mockResolvedValueOnce([]);
    const dto = { type: ContractType.MATERIAL, factory_id: 5, order_id: 10 };
    await expect(service.create(dto as any, 1)).rejects.toThrow(BadRequestException);
  });

  // UT-CON-14: PROCESS type auto-derives a single line from order 大货数 (设计稿 合同A4/C3)
  it('UT-CON-14 create auto-derives PROCESS quantity from order qty_total with qty_source=大货数', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ id: 10, qty_total: 1000, deleted: 0 });
    const dto = { type: ContractType.PROCESS, factory_id: 5, order_id: 10 };
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    const materialSaveCall = manager.save.mock.calls.find((c: any[]) => Array.isArray(c[1]));
    expect(materialSaveCall[1][0]).toMatchObject({ qty: 1000, qty_source: '大货数' });
  });

  // UT-CON-15: generateFromOrder 按供应商拆单，每供应商一张合同（设计稿 合同A1）
  it('UT-CON-15 generateFromOrder splits materials by supplier into per-supplier contracts', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ id: 10, currency: 'CNY', deleted: 0 });
    mockOrderMaterialRepo.find.mockResolvedValueOnce([
      { item_name: '面料A', supplier: '面料厂A', unit_price: 8, total_purchase: 100, sort_order: 0 },
      { item_name: '面料B', supplier: '面料厂A', unit_price: 5, total_purchase: 50, sort_order: 1 },
      { item_name: '拉链', supplier: '辅料厂B', unit_price: 2, total_purchase: 200, sort_order: 2 },
      { item_name: '未知料', supplier: '', unit_price: 1, total_purchase: 10, sort_order: 3 },
    ]);
    // L1 后工厂匹配/占位查询走在整体事务的 manager 上；create 内部还会查一次 OrderMain
    const manager = {
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
      // 【按实体分发，别按调用顺序排】原来这里是一串 mockResolvedValueOnce，
      // 事务里**多一次查询就全乱套**（#87 加了「查该款加工合同」后当场挂掉）。
      findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
        if (entity === Factory) {
          const name = opts?.where?.name;
          const hit = [
            { id: 7, name: '面料厂A', deleted: 0 },
            { id: 8, name: '辅料厂B', deleted: 0 },
            { id: 99, name: '待定供应商', deleted: 0 },
          ].find((f) => f.name === name);
          return Promise.resolve(hit ?? null);
        }
        return Promise.resolve(null);   // OrderMain / 加工合同查询等一律查不到
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    };
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));
    const result = await service.generateFromOrder(10, 1);
    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1); // 整批单一事务（L1）
    expect(result.created).toBe(3); // 面料厂A + 辅料厂B + 待定供应商占位(P3#41)
    expect(result.unmatched).toEqual(['未指定供应商']); // 仍回报未匹配清单供改绑
  });

  // UT-CON-03: push transitions DRAFT → PUSHED and logs action
  it('UT-CON-03 push transitions DRAFT→PUSHED and writes PUSH log', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.DRAFT });
    mockRepo.findOne.mockResolvedValue(contract);
    mockRepo.save.mockResolvedValue({ ...contract, portal_status: ContractPortalStatus.PUSHED });
    await service.push(1, 'admin');
    expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ portal_status: ContractPortalStatus.PUSHED }));
    expect(mockLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ action: 'PUSH' }));
  });

  // UT-CON-04: push throws if not DRAFT
  it('UT-CON-04 push throws BadRequest if not DRAFT', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.PUSHED });
    mockRepo.findOne.mockResolvedValue(contract);
    await expect(service.push(1, 'admin')).rejects.toThrow(BadRequestException);
  });

  // UT-CON-04b: 首次推送自动开通门户账号(P3#41/CON B3——原为拦截,现自动建号)
  it('UT-CON-04b push auto-opens portal account when factory has none', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.DRAFT });
    mockRepo.findOne.mockResolvedValue(contract);
    mockRepo.save.mockImplementation((v: any) => Promise.resolve(v));
    mockSupplierRepo.findOne.mockResolvedValue(null); // 无账号 + 用户名查重均为空
    mockFactoryRepo.findOne.mockResolvedValueOnce({ id: 1, factory_no: 'S007', deleted: 0 });
    mockSupplierRepo.create.mockImplementation((v: any) => v);
    mockSupplierRepo.save.mockImplementation((v: any) => Promise.resolve({ ...v, id: 9 }));
    const result: any = await service.push(1, 'admin');
    expect(result.auto_opened_account).toBe('s007');
    expect(mockSupplierRepo.save).toHaveBeenCalledWith(expect.objectContaining({ factory_id: contract.factory_id, status: 1 }));
    mockSupplierRepo.findOne.mockResolvedValue({ id: 1, status: 1 }); // 恢复默认给后续用例
  });

  // UT-CON-04c: recall transitions PUSHED → DRAFT, marks revised, logs RECALL
  it('UT-CON-04c recall transitions PUSHED→DRAFT, sets revised, writes RECALL log', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.PUSHED });
    mockRepo.findOne.mockResolvedValue(contract);
    mockRepo.save.mockResolvedValue({ ...contract, portal_status: ContractPortalStatus.DRAFT, revised: 1 });
    await service.recall(1, 'admin');
    expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ portal_status: ContractPortalStatus.DRAFT, revised: 1 }));
    expect(mockLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ action: 'RECALL' }));
  });

  // UT-CON-04d: recall throws if not PUSHED (已盖章不可撤回)
  it('UT-CON-04d recall throws BadRequest if not PUSHED', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.STAMPED });
    mockRepo.findOne.mockResolvedValue(contract);
    await expect(service.recall(1, 'admin')).rejects.toThrow(BadRequestException);
  });

  // UT-CON-05: stamp creates snapshot_json and transitions PUSHED → STAMPED
  it('UT-CON-05 stamp creates snapshot_json and transitions PUSHED→STAMPED', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.PUSHED });
    mockRepo.findOne.mockResolvedValue(contract);
    mockMaterialRepo.find.mockResolvedValue([
      { item_name: '面料A', spec: '100%棉', unit: 'M', unit_price: 50, qty: 100, amount: 5000 },
    ]);
    await service.stamp(1, 'supplier_account');
    const saved = mockRepo.save.mock.calls[0][0];
    expect(saved.portal_status).toBe(ContractPortalStatus.STAMPED);
    expect(saved.snapshot_json).toBeDefined();
    expect(saved.snapshot_json.materials).toHaveLength(1);
    expect(mockLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ action: 'STAMP', operator_type: PortalOperatorType.SUPPLIER }));
  });

  // UT-CON-06: stamp throws ForbiddenException if not PUSHED
  it('UT-CON-06 stamp throws ForbiddenException if not PUSHED', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.STAMPED });
    mockRepo.findOne.mockResolvedValue(contract);
    await expect(service.stamp(1, 'supplier')).rejects.toThrow(ForbiddenException);
  });

  // UT-CON-07: remove throws if not DRAFT
  it('UT-CON-07 remove throws BadRequest if portal_status is not DRAFT', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.PUSHED });
    mockRepo.findOne.mockResolvedValue(contract);
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
  });

  // UT-CON-08: remove logical-deletes DRAFT contract
  it('UT-CON-08 remove logical-deletes a DRAFT contract', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.DRAFT });
    mockRepo.findOne.mockResolvedValue(contract);
    await service.remove(1);
    expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: 1 }));
  });

  // UT-CON-09: findOne throws NotFoundException for missing record
  it('UT-CON-09 findOne throws NotFoundException for missing record', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });

  // UT-CON-10: getSnapshotUnitPrice returns unit_price from snapshot
  it('UT-CON-10 getSnapshotUnitPrice returns unit_price from snapshot materials', async () => {
    const contract = makeContract({
      snapshot_json: {
        materials: [
          { item_name: '面料A', unit_price: 50 },
          { item_name: '面料B', unit_price: 30 },
        ],
      },
    });
    mockRepo.findOne.mockResolvedValue(contract);
    const price = await service.getSnapshotUnitPrice(1, '面料A');
    expect(price).toBe(50);
  });

  // UT-CON-11: getSnapshotUnitPrice returns null for missing item
  it('UT-CON-11 getSnapshotUnitPrice returns null when item not in snapshot', async () => {
    const contract = makeContract({ snapshot_json: { materials: [{ item_name: '面料A', unit_price: 50 }] } });
    mockRepo.findOne.mockResolvedValue(contract);
    const price = await service.getSnapshotUnitPrice(1, '面料X');
    expect(price).toBeNull();
  });

  // ===== 编辑页 update（设计稿 04 v1.3 + E5 锁定规则）=====

  // UT-CON-16: 草稿全字段可改，明细替换后重算总额
  it('UT-CON-16 update on DRAFT replaces materials and recalculates total_amount', async () => {
    const contract = makeContract({
      portal_status: ContractPortalStatus.DRAFT,
      deposit_ratio: 30, mid_ratio: 40, final_ratio: 30, approval_status: 'NONE',
    });
    mockRepo.findOne.mockResolvedValue(contract);
    const result: any = await service.update(1, {
      sign_place: '南京', guarantor: '担保人丙', style_nos: 'M525,F525',
      materials: [
        { item_name: '5#尼龙开口', color: '黑色', style_no: 'M525', unit: '条', qty: 1520, unit_price: 1 },
        { item_name: '螺纹', size: 'S 码', unit: '米', qty: 180, unit_price: 12 },
      ],
    } as any);
    expect(result.total_amount).toBe(1520 + 2160);
    expect(result.sign_place).toBe('南京');
    expect(result.guarantor).toBe('担保人丙');
    expect(result.style_nos).toBe('M525,F525');
  });

  // UT-CON-17: 推送后仅备注可改，改关键字段被拒（E5 锁定）
  it('UT-CON-17 update after PUSHED rejects non-remark fields (E5 lock)', async () => {
    // 前序用例可能用 mockResolvedValue 固定过 save 返回值，这里恢复透传实现
    mockRepo.save.mockImplementation((v: any) => Promise.resolve({ ...v, id: v.id ?? 1 }));
    mockRepo.findOne.mockResolvedValue(makeContract({ portal_status: ContractPortalStatus.PUSHED }));
    await expect(service.update(1, { factory_id: 9 } as any)).rejects.toThrow(BadRequestException);
    // 仅备注可改
    const result: any = await service.update(1, { remark: '推送后补充备注' } as any);
    expect(result.remark).toBe('推送后补充备注');
  });

  // UT-CON-18: 草稿改明细致金额变化 → 已通过的审批被重置（防审批后改金额绕过）
  it('UT-CON-18 update resets APPROVED approval when total changes', async () => {
    const contract = makeContract({
      portal_status: ContractPortalStatus.DRAFT, total_amount: 10000,
      deposit_ratio: 30, mid_ratio: 40, final_ratio: 30,
      approval_status: 'APPROVED', approved_by: 2, approved_at: new Date(),
    });
    mockRepo.findOne.mockResolvedValue(contract);
    const result: any = await service.update(1, {
      materials: [{ item_name: '面料', unit: '米', qty: 100, unit_price: 999 }],
    } as any);
    expect(result.total_amount).toBe(99900);
    expect(result.approval_status).toBe('NONE');
  });

  // UT-CON-19: 付款比例合并校验（改后 ≠100% 拒绝）
  it('UT-CON-19 update rejects when merged ratios do not sum to 100%', async () => {
    mockRepo.findOne.mockResolvedValue(makeContract({
      portal_status: ContractPortalStatus.DRAFT, deposit_ratio: 30, mid_ratio: 40, final_ratio: 30,
    }));
    await expect(service.update(1, { deposit_ratio: 50 } as any)).rejects.toThrow(BadRequestException);
  });

  // UT-CON-20: create 持久化编辑页扩展字段 + 加工合同价格包含项/税率默认
  it('UT-CON-20 create persists edit-page fields with PROCESS defaults', async () => {
    mockRedis.eval.mockResolvedValue('HT-20260709-001');
    mockOrderRepo.findOne.mockResolvedValue({
      id: 10, qty_total: 1874, style_no: 'MNA263M525', style_name: '三合一外壳',
      delivery_date: '2026-07-30', deleted: 0,
    });
    let savedContract: any = null;
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb({
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => {
        if (!Array.isArray(v) && v.contract_no) savedContract = v;
        return Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 });
      }),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    }));
    await service.create({
      type: ContractType.PROCESS, factory_id: 5, order_id: 10, guarantor: '丙方某',
    } as any, 1);
    expect(savedContract.vat_rate).toBe(13); // 加工默认增值税13%
    expect(savedContract.price_includes).toContain('工缴'); // 默认包含项
    expect(savedContract.style_nos).toBe('MNA263M525'); // 默认=订单款号
    expect(savedContract.guarantor).toBe('丙方某');
    expect(savedContract.delivery_deadline).toBe('2026-07-20'); // 订单交期−10天（A7）
  });

  // ===== 分色/分码出行（设计稿 合同 A4 + 订单尺码矩阵）=====

  // UT-CON-21: 分色材料按矩阵颜色拆行，量=该色件数×耗用×(1+损耗)，整数单位向上取整
  it('UT-CON-21 create expands BY_COLOR material into per-color lines from size matrix', async () => {
    mockRedis.eval.mockResolvedValue('HT-20260709-002');
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, style_no: 'M525', delivery_date: '2026-07-30', deleted: 0 });
    mockOrderMaterialRepo.find.mockResolvedValue([{
      item_name: '5#尼龙拉链', unit: '条', unit_price: 1, net_usage: 2, loss_rate: 5,
      split_mode: 'BY_COLOR', round_up: null, sort_order: 0,
    }]);
    // 新矩阵结构：黑色 100 件(60+40 跨两 PO)、藏青 50 件
    mockMatrixRepo.findOne.mockResolvedValue({ matrix_data: { rows: [
      { style_no: 'M525', color: '黑色', size: 'S', qtys: [60, 40] },
      { style_no: 'M525', color: '藏青', size: 'M', qtys: [50] },
    ] } });
    const savedLines: any[] = [];
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb({
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => {
        if (Array.isArray(v)) savedLines.push(...v);
        return Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 });
      }),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    }));
    await service.create({ type: ContractType.MATERIAL, factory_id: 5, order_id: 10 } as any, 1);
    expect(savedLines).toHaveLength(2); // 黑色 + 藏青 各一行
    const black = savedLines.find((l) => l.color === '黑色');
    const navy = savedLines.find((l) => l.color === '藏青');
    expect(black.qty).toBe(210); // 100×2×1.05=210（条为整数单位）
    expect(navy.qty).toBe(105);  // 50×2×1.05=105
    expect(black.qty_source).toBe('采购量·分色');
    expect(black.style_no).toBe('M525');
  });

  // UT-CON-22: 分码材料无耗用数据时按件数占比分摊最终采购量
  it('UT-CON-22 create splits BY_SIZE material proportionally when net_usage missing', async () => {
    mockRedis.eval.mockResolvedValue('HT-20260709-003');
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, style_no: 'M525', delivery_date: null, deleted: 0 });
    mockOrderMaterialRepo.find.mockResolvedValue([{
      item_name: '1×1螺纹', unit: '米', unit_price: 12, net_usage: null, loss_rate: 0,
      split_mode: 'BY_SIZE', final_purchase: 420, round_up: null, sort_order: 0,
    }]);
    mockMatrixRepo.findOne.mockResolvedValue({ matrix_data: { rows: [
      { style_no: 'M525', color: '黑', size: 'S', qtys: [180] },
      { style_no: 'M525', color: '黑', size: 'M', qtys: [240] },
    ] } });
    const savedLines: any[] = [];
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb({
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => {
        if (Array.isArray(v)) savedLines.push(...v);
        return Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 });
      }),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    }));
    await service.create({ type: ContractType.MATERIAL, factory_id: 5, order_id: 10 } as any, 1);
    expect(savedLines).toHaveLength(2);
    expect(savedLines.find((l) => l.size === 'S').qty).toBe(180); // 420×180/420
    expect(savedLines.find((l) => l.size === 'M').qty).toBe(240); // 420×240/420
    expect(savedLines[0].qty_source).toBe('采购量·分码');
  });

  // UT-CON-24: 分码材料带各码尺寸——size 列写 S(50)，无尺寸码保持纯尺码（用户反馈：拉链按码不同尺寸）
  it('UT-CON-24 BY_SIZE lines carry per-size specs in size column like S(50)', async () => {
    mockRedis.eval.mockResolvedValue('HT-20260709-024');
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, style_no: 'M525', delivery_date: null, deleted: 0 });
    mockOrderMaterialRepo.find.mockResolvedValue([{
      item_name: '5#尼龙拉链', unit: '条', unit_price: 1, net_usage: 1, loss_rate: 3,
      split_mode: 'BY_SIZE', round_up: null, sort_order: 0,
      size_specs: { S: '50', M: '52', XL: '58×0.8' },
    }]);
    mockMatrixRepo.findOne.mockResolvedValue({ matrix_data: { rows: [
      { style_no: 'M525', color: '黑', size: 'S', qtys: [100] },
      { style_no: 'M525', color: '黑', size: 'M', qtys: [100] },
      { style_no: 'M525', color: '黑', size: 'L', qtys: [100] },
      { style_no: 'M525', color: '黑', size: 'XL', qtys: [100] },
    ] } });
    const savedLines: any[] = [];
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb({
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => {
        if (Array.isArray(v)) savedLines.push(...v);
        return Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 });
      }),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    }));
    await service.create({ type: ContractType.MATERIAL, factory_id: 5, order_id: 10 } as any, 1);
    expect(savedLines).toHaveLength(4);
    expect(savedLines.find((l) => l.size === 'S(50)')).toBeTruthy();
    expect(savedLines.find((l) => l.size === 'M(52)')).toBeTruthy();
    expect(savedLines.find((l) => l.size === 'XL(58×0.8)')).toBeTruthy(); // 自由文本原样带
    expect(savedLines.find((l) => l.size === 'L')).toBeTruthy(); // 无尺寸码回退纯尺码
    expect(savedLines.every((l) => l.qty === 103)).toBe(true); // 100×1×1.03=103
  });

  // UT-CON-23: 不拆分材料仍单行；矩阵为空时分色材料退回单行（不炸）
  it('UT-CON-23 NONE split or empty matrix falls back to single line', async () => {
    mockRedis.eval.mockResolvedValue('HT-20260709-004');
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, style_no: 'M525', delivery_date: null, deleted: 0 });
    mockOrderMaterialRepo.find.mockResolvedValue([
      { item_name: '主面料', unit: '米', unit_price: 8, split_mode: 'NONE', final_purchase: 100, sort_order: 0, color: '藏青' },
      { item_name: '胶标', unit: '个', unit_price: 0.3, split_mode: 'BY_COLOR', final_purchase: 500, sort_order: 1 },
    ]);
    mockMatrixRepo.findOne.mockResolvedValue(null); // 无矩阵
    const savedLines: any[] = [];
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb({
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => {
        if (Array.isArray(v)) savedLines.push(...v);
        return Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 });
      }),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    }));
    await service.create({ type: ContractType.MATERIAL, factory_id: 5, order_id: 10 } as any, 1);
    expect(savedLines).toHaveLength(2); // 各退回单行
    expect(savedLines[0].color).toBe('藏青');
    expect(savedLines[1].qty).toBe(500);
  });

  // ── 关联单据（单据间跳转）：详情带出上游单据号 ──

  // UT-CON-24: 详情带出源订单号 + 母合同号（补料合同→母合同）
  it('UT-CON-24 findOne returns order_no and parent_contract_no', async () => {
    mockRepo.findOne
      .mockResolvedValueOnce(makeContract({ order_id: 10, parent_id: 2, type: ContractType.SUPPLEMENT }))
      .mockResolvedValueOnce({ id: 2, contract_no: 'CT2024010100002' }); // 母合同
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, order_no: 'SO2024010100001', deleted: 0 });
    const res: any = await service.findOne(1);
    expect(res.order_no).toBe('SO2024010100001');
    expect(res.parent_contract_no).toBe('CT2024010100002');
  });

  // UT-CON-25: 源订单/母合同已删 → 降级 null，详情不 500
  it('UT-CON-25 findOne degrades order_no/parent_contract_no to null when the docs are gone', async () => {
    mockRepo.findOne
      .mockResolvedValueOnce(makeContract({ order_id: 10, parent_id: 2 }))
      .mockResolvedValueOnce(null); // 母合同已删
    mockOrderRepo.findOne.mockResolvedValue(null); // 源订单已删
    const res: any = await service.findOne(1);
    expect(res.order_no).toBeNull();
    expect(res.parent_contract_no).toBeNull();
  });

  // ===== 2026-07-19 排查回归：M3 / L1 / L6 / L11 =====

  // UT-CON-26: priceHint 空 style_no → 400（M3：空串 LIKE '%%' 会捞出任意合同最近 5 条成本价）
  it('UT-CON-26 priceHint rejects empty style_no (M3)', async () => {
    await expect(service.priceHint('')).rejects.toThrow(BadRequestException);
    await expect(service.priceHint('   ')).rejects.toThrow(BadRequestException);
  });

  // UT-CON-27: generateFromOrder 幂等守卫——订单已生成过合同则拒绝整批重跑（L1）
  it('UT-CON-27 generateFromOrder rejects re-run when order already has contracts (L1 幂等守卫)', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ id: 10, currency: 'CNY', deleted: 0 });
    mockRepo.count.mockResolvedValueOnce(2); // 该订单已有 2 张合同
    await expect(service.generateFromOrder(10, 1)).rejects.toThrow(BadRequestException);
    expect(mockDataSource.transaction).not.toHaveBeenCalled(); // 未进入生成事务
  });

  // UT-CON-28: updateStatus 非法值/跨档跳转 → 400（L6 状态机白名单）
  it('UT-CON-28 updateStatus rejects invalid value and illegal transition (L6)', async () => {
    mockRepo.findOne.mockResolvedValue(makeContract({ status: ContractStatus.ACTIVE }));
    await expect(service.updateStatus(1, 'FOO' as any)).rejects.toThrow(BadRequestException);
    mockRepo.findOne.mockResolvedValue(makeContract({ status: ContractStatus.COMPLETED }));
    await expect(service.updateStatus(1, ContractStatus.CANCELLED)).rejects.toThrow(BadRequestException);
  });

  // UT-CON-29: 已有对账/付款关联的合同禁止直接 CANCELLED（L6）
  it('UT-CON-29 updateStatus blocks CANCELLED when reconciliation links exist (L6)', async () => {
    mockRepo.findOne.mockResolvedValue(makeContract({ status: ContractStatus.ACTIVE }));
    mockReconRepo.count.mockResolvedValueOnce(1); // 已有对账单挂该合同
    await expect(service.updateStatus(1, ContractStatus.CANCELLED)).rejects.toThrow(BadRequestException);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  // UT-CON-30: 无关联时 ACTIVE→CANCELLED 放行；同状态幂等空操作（L6）
  it('UT-CON-30 updateStatus allows ACTIVE→CANCELLED without links; same-status is no-op (L6)', async () => {
    mockRepo.findOne.mockResolvedValue(makeContract({ status: ContractStatus.ACTIVE }));
    await service.updateStatus(1, ContractStatus.CANCELLED);
    expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ContractStatus.CANCELLED }));
    mockRepo.save.mockClear();
    mockRepo.findOne.mockResolvedValue(makeContract({ status: ContractStatus.COMPLETED }));
    const same: any = await service.updateStatus(1, ContractStatus.COMPLETED);
    expect(same.status).toBe(ContractStatus.COMPLETED);
    expect(mockRepo.save).not.toHaveBeenCalled(); // 幂等：不落库
  });

  // UT-CON-31: 补料合同号在事务内按 count+1 生成（L11）
  it('UT-CON-31 create SUPPLEMENT generates 补料 contract_no inside transaction (L11)', async () => {
    const manager = {
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
      findOne: jest.fn().mockResolvedValue({ id: 2, contract_no: 'HT-20260701-001', deleted: 0 }),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行 // 原合同
      count: jest.fn().mockResolvedValue(1), // 已有 1 张补料
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    };
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));
    await service.create({
      type: ContractType.SUPPLEMENT, parent_id: 2, factory_id: 5, order_id: 10,
      materials: [{ item_name: '面料', unit_price: 10, qty: 5 }],
    } as any, 1);
    expect(manager.count).toHaveBeenCalled(); // 序号在事务内取
    expect(manager.save.mock.calls[0][1]).toMatchObject({ contract_no: '补料-HT-20260701-001-02', parent_id: 2 });
  });

  // UT-CON-32: 补料并发撞 contract_no 唯一索引 → 回滚重试成功；持续撞号 → 业务异常不裸 500（L11）
  it('UT-CON-32 create SUPPLEMENT retries duplicate contract_no; persistent conflict → BadRequest (L11)', async () => {
    const dupErr = Object.assign(
      new Error("Duplicate entry '补料-HT-20260701-001-02' for key 'contract.IDX_dup'"),
      { code: 'ER_DUP_ENTRY', errno: 1062 },
    );
    const manager = {
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
      findOne: jest.fn().mockResolvedValue({ id: 2, contract_no: 'HT-20260701-001', deleted: 0 }),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      count: jest.fn().mockResolvedValue(2), // 重试时序号 +1
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    };
    // 第一次撞唯一索引回滚，第二次按最新 count 成功
    mockDataSource.transaction
      .mockImplementationOnce(() => Promise.reject(dupErr))
      .mockImplementationOnce((cb: any) => cb(manager));
    await service.create({
      type: ContractType.SUPPLEMENT, parent_id: 2, factory_id: 5, order_id: 10,
      materials: [{ item_name: '面料', unit_price: 10, qty: 5 }],
    } as any, 1);
    expect(mockDataSource.transaction).toHaveBeenCalledTimes(2);
    expect(manager.save.mock.calls[0][1]).toMatchObject({ contract_no: '补料-HT-20260701-001-03' });
    // 持续撞号（3 次全失败）→ 明确业务异常而非裸 500
    mockDataSource.transaction
      .mockImplementationOnce(() => Promise.reject(dupErr))
      .mockImplementationOnce(() => Promise.reject(dupErr))
      .mockImplementationOnce(() => Promise.reject(dupErr));
    await expect(service.create({
      type: ContractType.SUPPLEMENT, parent_id: 2, factory_id: 5, order_id: 10,
      materials: [{ item_name: '面料', unit_price: 10, qty: 5 }],
    } as any, 1)).rejects.toThrow(BadRequestException);
  });

  // UT-CON-35: 材料合同一律人民币，绝不继承订单的外销币种（2026-08-05 用户口径）
  it('UT-CON-35 generateFromOrder 对 USD 订单仍生成 CNY 材料合同（金额是人民币采购价，不做换算）', async () => {
    mockRedis.eval.mockResolvedValue('HT-20260805-001');
    // 订单是外销 USD——正是踩坑场景：生产现有 3 张 USD 订单，点一下「生成材料合同」即触发
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, style_no: 'M525', currency: 'USD', delivery_date: null, deleted: 0 });
    mockOrderMaterialRepo.find.mockResolvedValue([
      { id: 77, item_name: '主面料', unit: '米', unit_price: 8, split_mode: 'NONE', final_purchase: 100, sort_order: 0 },
    ]);
    mockMatrixRepo.findOne.mockResolvedValue(null);
    const savedContracts: any[] = [];
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb({
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => {
        if (!Array.isArray(v) && v?.contract_no) savedContracts.push(v);
        return Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 });
      }),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    }));
    await service.generateFromOrder(10, 1);
    expect(savedContracts[0].currency).toBe('CNY');   // 不是 'USD'
  });

  // ── 订单↔合同行级关联（用户反馈 2026-08-03：订单里标出哪些材料已生成合同）──

  // UT-CON-33: 从订单生成的合同明细带上 order_material_id；分色展开的多行都指回同一条订单材料
  it('UT-CON-33 lines generated from an order carry order_material_id (split lines share it)', async () => {
    mockRedis.eval.mockResolvedValue('HT-20260803-001');
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, style_no: 'M525', delivery_date: null, deleted: 0 });
    mockOrderMaterialRepo.find.mockResolvedValue([
      { id: 77, item_name: '主面料', unit: '米', unit_price: 8, split_mode: 'BY_COLOR', net_usage: 1, loss_rate: 0, sort_order: 0 },
    ]);
    mockMatrixRepo.findOne.mockResolvedValue({
      matrix_data: { rows: [{ color: '藏青', qtys: [100] }, { color: '米白', qtys: [50] }] },
    });
    const savedLines: any[] = [];
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb({
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => {
        if (Array.isArray(v)) savedLines.push(...v);
        return Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 });
      }),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      query: jest.fn().mockResolvedValue([]),   // #94：事务内会按款号查加工合同
    }));
    await service.create({ type: ContractType.MATERIAL, factory_id: 5, order_id: 10 } as any, 1);
    expect(savedLines).toHaveLength(2);
    expect(savedLines.every((l) => l.order_material_id === 77)).toBe(true);
  });

  // UT-CON-34: 合同明细是「删了重建」，编辑后必须接力 order_material_id，否则订单侧标记被冲掉
  it('UT-CON-34 update carries order_material_id over from the replaced lines', async () => {
    const contract = makeContract({ id: 3, approval_status: 'NONE' });
    mockRepo.findOne.mockResolvedValue(contract);
    const savedLines: any[] = [];
    const manager = {
      find: jest.fn().mockResolvedValue([
        { item_name: '主面料', color: '藏青', size: null, qty: 100, order_material_id: 77 },
      ]),
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => {
        if (Array.isArray(v)) savedLines.push(...v);
        return Promise.resolve(Array.isArray(v) ? v : { ...v, id: 3 });
      }),
      delete: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest.fn().mockResolvedValue([]),
    };
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));
    await service.update(3, {
      materials: [{ item_name: '主面料', color: '藏青', unit_price: 8, qty: 120 }],
    } as any);
    expect(savedLines[0]).toMatchObject({ item_name: '主面料', qty: 120, order_material_id: 77 });
  });

  // ── 列表关键词搜索（2026-08-07 King：「合同号记不住」，要能按供应商/款号找）──────
  describe('findAll 关键词搜索', () => {
    const whereOf = () => (mockRepo.findAndCount.mock.calls.at(-1)![0] as any).where;

    it('不给关键词时是单条件对象，不走 OR 分支（别把原有列表行为改坏）', async () => {
      await service.findAll({} as any);
      const w = whereOf();
      expect(Array.isArray(w)).toBe(false);
      expect(w).toMatchObject({ deleted: 0 });
    });

    it('关键词同时按合同号和款号找（OR 分支）', async () => {
      mockFactoryRepo.find.mockResolvedValueOnce([]);
      await service.findAll({ keyword: 'CHA271' } as any);
      const w = whereOf();
      expect(Array.isArray(w)).toBe(true);
      expect(w).toHaveLength(2);
      expect(w[0].contract_no).toBeDefined();
      expect(w[1].style_nos).toBeDefined();
    });

    it('关键词命中供应商名时并进 factory_id 分支', async () => {
      mockFactoryRepo.find.mockResolvedValueOnce([{ id: 7 }, { id: 9 }]);
      await service.findAll({ keyword: '坤业' } as any);
      const w = whereOf();
      expect(w).toHaveLength(3);
      expect(w[2].factory_id).toBeDefined();
    });

    it('没有工厂命中就不加空的 IN 分支（IN () 会把结果清零）', async () => {
      mockFactoryRepo.find.mockResolvedValueOnce([]);
      await service.findAll({ keyword: 'zzz' } as any);
      expect(whereOf()).toHaveLength(2);
    });

    it('其它筛选条件在每个 OR 分支里都保留（否则按类型筛完再搜就漏筛）', async () => {
      mockFactoryRepo.find.mockResolvedValueOnce([{ id: 7 }]);
      await service.findAll({ keyword: '坤业', type: 'MATERIAL' } as any);
      for (const b of whereOf() as any[]) expect(b).toMatchObject({ deleted: 0, type: 'MATERIAL' });
    });
  });

  // ── BY_BOTH：颜色×尺码同时拆（2026-08-07 King：「材料拆分有的要按颜色按尺码都分」）────
  describe('expandMaterialLines · BY_BOTH', () => {
    const expand = (om: any, rows: any[]) => (service as any).expandMaterialLines(om, rows, 'ST-1', null);
    const MAT = { id: 5, item_name: '主面料', unit: '米', net_usage: 2, loss_rate: 0, unit_price: 10 };
    const ROWS = [
      { color: '黑色', size: 'S', qtys: [10] },
      { color: '黑色', size: 'M', qtys: [20] },
      { color: '白色', size: 'S', qtys: [5] },
    ];

    it('按「颜色+尺码」组合出行，每个组合各一行', () => {
      const out = expand({ ...MAT, split_mode: 'BY_BOTH' }, ROWS);
      expect(out).toHaveLength(3);
      expect(out.map((r: any) => `${r.color}/${r.size}`).sort())
        .toEqual(['白色/S', '黑色/M', '黑色/S']);
    });

    it('每行数量 = 该组合件数 × 单件耗用 ×(1+损耗)', () => {
      const out = expand({ ...MAT, split_mode: 'BY_BOTH' }, ROWS);
      const byKey = Object.fromEntries(out.map((r: any) => [`${r.color}/${r.size}`, r.qty]));
      expect(byKey['黑色/S']).toBe(20);  // 10 × 2
      expect(byKey['黑色/M']).toBe(40);  // 20 × 2
      expect(byKey['白色/S']).toBe(10);  //  5 × 2
    });

    it('同色同码的多行(跨PO)合并计数，不重复出行', () => {
      const out = expand({ ...MAT, split_mode: 'BY_BOTH' }, [
        { color: '黑色', size: 'S', qtys: [10] },
        { color: '黑色', size: 'S', qtys: [7] },
      ]);
      expect(out).toHaveLength(1);
      expect(out[0].qty).toBe(34); // (10+7) × 2
    });

    it('颜色或尺码缺一个的矩阵行直接跳过，不拼出空维度的组合', () => {
      const out = expand({ ...MAT, split_mode: 'BY_BOTH' }, [
        { color: '黑色', size: '', qtys: [10] },
        { color: '', size: 'M', qtys: [10] },
        { color: '蓝色', size: 'L', qtys: [3] },
      ]);
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ color: '蓝色', size: 'L' });
    });

    it('各码尺寸按【纯尺码】取 size_specs，不能拿"黑色 S"去查', () => {
      const out = expand({ ...MAT, split_mode: 'BY_BOTH', size_specs: { S: '50' } }, ROWS);
      const s = out.find((r: any) => r.color === '黑色' && String(r.size).startsWith('S'));
      expect(s.size).toBe('S(50)');
    });

    it('qty_source 标明是分色分码，且不超 varchar(20)', () => {
      const out = expand({ ...MAT, split_mode: 'BY_BOTH' }, ROWS);
      expect(out[0].qty_source).toBe('采购量·分色分码');
      expect(out[0].qty_source.length).toBeLessThanOrEqual(20);
    });

    it('BY_BOTH 这个取值本身不能超 split_mode 的 varchar(10)', () => {
      // 【别改成 BY_COLOR_SIZE】13 个字符会 Data too long，保存订单直接 500
      expect('BY_BOTH'.length).toBeLessThanOrEqual(10);
    });

    it('不动原有 BY_COLOR / BY_SIZE 的行为', () => {
      const byColor = expand({ ...MAT, split_mode: 'BY_COLOR' }, ROWS);
      expect(byColor.map((r: any) => r.color).sort()).toEqual(['白色', '黑色']);
      expect(byColor.every((r: any) => r.size === undefined)).toBe(true);
      expect(byColor[0].qty_source).toBe('采购量·分色');

      const bySize = expand({ ...MAT, split_mode: 'BY_SIZE' }, ROWS);
      expect(bySize.map((r: any) => r.size).sort()).toEqual(['M', 'S']);
      expect(bySize[0].qty_source).toBe('采购量·分码');
    });

    it('矩阵为空时退回整单单行，不因新模式炸掉；qty_source 留「矩阵未分组」痕迹（#120 审计）', () => {
      const out = expand({ ...MAT, split_mode: 'BY_BOTH', final_purchase: 99 }, []);
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ qty: 99, qty_source: '采购量含损耗·矩阵未分组' });
    });
  });

  // ── 合同供应商回填订单（2026-08-10 King：「生成了材料合同，可以在订单中自动带入供应商？」）──
  describe('backfillOrderSupplier', () => {
    const qb = () => {
      const b: any = {};
      b.update = jest.fn().mockReturnValue(b);
      b.set = jest.fn().mockReturnValue(b);
      b.where = jest.fn().mockReturnValue(b);
      b.andWhere = jest.fn().mockReturnValue(b);
      b.execute = jest.fn().mockResolvedValue({ affected: 1 });
      return b;
    };
    const run = async (mats: any[], factoryId: any, factory: any = { id: 7, name: '昆山领威纺织品有限公司' }) => {
      const b = qb();
      const m: any = {
        findOne: jest.fn().mockResolvedValue(factory),
        find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
        createQueryBuilder: jest.fn().mockReturnValue(b),
      };
      await (service as any).backfillOrderSupplier(m, mats, factoryId);
      return { m, b };
    };

    it('把工厂名回填到有溯源的订单材料行', async () => {
      const { b } = await run([{ order_material_id: 11 }, { order_material_id: 12 }], 7);
      expect(b.set).toHaveBeenCalledWith({ supplier: '昆山领威纺织品有限公司' });
      expect(b.where).toHaveBeenCalledWith('id IN (:...ids)', { ids: [11, 12] });
    });

    it('【只填空的】已填供应商的行绝不覆盖——它决定了合同怎么拆单，被悄悄改掉没人知道', async () => {
      const { b } = await run([{ order_material_id: 11 }], 7);
      expect(b.andWhere).toHaveBeenCalledWith('(supplier IS NULL OR supplier = :empty)', { empty: '' });
    });

    it('同一条订单材料被拆成多行时去重，不重复 IN', async () => {
      const { b } = await run([{ order_material_id: 11 }, { order_material_id: 11 }, { order_material_id: 12 }], 7);
      expect(b.where).toHaveBeenCalledWith('id IN (:...ids)', { ids: [11, 12] });
    });

    it('没有溯源(手工填的合同行)就什么都不做', async () => {
      const { m } = await run([{ order_material_id: null }, {}], 7);
      expect(m.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('没有工厂 / 工厂无名字时不写空供应商进去', async () => {
      const a = await run([{ order_material_id: 11 }], null);
      expect(a.m.createQueryBuilder).not.toHaveBeenCalled();
      const c = await run([{ order_material_id: 11 }], 7, { id: 7, name: '   ' });
      expect(c.m.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ── 驳回批次要冲回累计已发（2026-08-10，生产实证 HT-20260810-001 挂着已驳回的 1895）──
  describe('approveShipment 后重算累计已发', () => {
    const setup = (rows: any[]) => {
      const ship = { id: 1, contract_id: 5, qty: 100, approval_status: 'PENDING', reconcile_id: null };
      const shipRepo = {
        findOne: jest.fn().mockResolvedValue(ship),
        save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
        find: jest.fn().mockResolvedValue(rows),
      };
      (service as any).shipmentRepo = shipRepo;
      return { ship, shipRepo };
    };

    it('驳回后累计已发按「未驳回批次」重算——不能再把驳回的算进去', async () => {
      setup([
        { qty: 1895, approval_status: 'REJECTED' },
        { qty: 300, approval_status: 'APPROVED' },
      ]);
      await service.approveShipment(5, 1, 9, false);
      expect(mockRepo.update).toHaveBeenCalledWith({ id: 5 }, { shipped_qty: 300 });
    });

    it('全部批次都被驳回时归零（正是生产上那张合同的情形）', async () => {
      setup([{ qty: 1895, approval_status: 'REJECTED' }]);
      await service.approveShipment(5, 1, 9, false);
      expect(mockRepo.update).toHaveBeenCalledWith({ id: 5 }, { shipped_qty: 0 });
    });

    it('审批通过同样重算，PENDING 的批次照常计入（只有驳回才不算）', async () => {
      setup([
        { qty: 100, approval_status: 'APPROVED' },
        { qty: 50, approval_status: 'PENDING' },
        { qty: 999, approval_status: 'REJECTED' },
      ]);
      await service.approveShipment(5, 1, 9, true);
      expect(mockRepo.update).toHaveBeenCalledWith({ id: 5 }, { shipped_qty: 150 });
    });

    it('重算是幂等的：连续驳回同一批次不会把数越算越歪', async () => {
      setup([{ qty: 200, approval_status: 'APPROVED' }, { qty: 80, approval_status: 'REJECTED' }]);
      await service.approveShipment(5, 1, 9, false);
      await service.approveShipment(5, 1, 9, false);
      const calls = mockRepo.update.mock.calls.filter((c: any[]) => c[1]?.shipped_qty !== undefined);
      expect(calls.at(-1)).toEqual([{ id: 5 }, { shipped_qty: 200 }]);
      expect(calls.at(-2)).toEqual([{ id: 5 }, { shipped_qty: 200 }]);
    });

    it('已被对账单引用的批次不许改审批状态，也就不会动累计已发', async () => {
      const { shipRepo } = setup([]);
      shipRepo.findOne.mockResolvedValue({ id: 1, contract_id: 5, qty: 10, reconcile_id: 7 });
      await expect(service.approveShipment(5, 1, 9, false)).rejects.toThrow(BadRequestException);
    });
  });

  // ——— 无订单材料合同（2026-08-11 King #75：公司挂卡/销样面料本来就没有订单）———
  describe('无订单材料合同', () => {
    const mgr = () => ({
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),   // #89：事务内会查订单材料行
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    });

    it('UT-NOORD-01 材料合同不填订单也能建，order_id 落成 NULL 而不是 undefined', async () => {
      const m = mgr();
      mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(m));
      await service.create({
        type: 'MATERIAL', factory_id: 5,
        materials: [{ item_name: '挂卡面料', unit_price: 20, qty: 10 }],
      } as any, 1);
      const saved = m.save.mock.calls.find((c: any[]) => c[1] && c[1].contract_no)?.[1];
      expect(saved).toBeDefined();
      expect(saved.order_id).toBeNull();
    });

    it('UT-NOORD-02 不填订单时绝不去"从订单带料"——那会把全库订单材料捞回来', async () => {
      const m = mgr();
      mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(m));
      mockOrderMaterialRepo.find.mockClear();
      await service.create({
        type: 'MATERIAL', factory_id: 5,
        materials: [{ item_name: '挂卡面料', unit_price: 20, qty: 10 }],
      } as any, 1);
      expect(mockOrderMaterialRepo.find).not.toHaveBeenCalled();
    });

    it('UT-NOORD-03 明细也没填时照旧拒绝，但话得说人话——不能提"该订单"，本来就没订单', async () => {
      mockOrderMaterialRepo.find.mockClear();
      await expect(service.create({ type: 'MATERIAL', factory_id: 5 } as any, 1))
        .rejects.toThrow(/未关联订单的合同没有可带出的用料/);
      expect(mockOrderMaterialRepo.find).not.toHaveBeenCalled();
    });

    it('UT-NOORD-04 加工合同不填订单直接拒绝（数量取自订单大货数，没订单无从建起）', async () => {
      await expect(service.create({
        type: 'PROCESS', factory_id: 5,
        materials: [{ item_name: '加工费', unit_price: 20, qty: 10 }],
      } as any, 1)).rejects.toThrow(BadRequestException);
    });

    it('UT-NOORD-05 补料合同不填订单同样拒绝', async () => {
      await expect(service.create({
        type: 'SUPPLEMENT', factory_id: 5, parent_id: 1,
        materials: [{ item_name: '补料', unit_price: 20, qty: 10 }],
      } as any, 1)).rejects.toThrow(BadRequestException);
    });
  });


  // ——— #89 手工建的材料合同也要能标绿（2026-08-12 King：「咋还是不行呢」）———
  describe('linkOrderMaterials 按品名认回订单材料行', () => {
    const qb = () => {
      const b: any = {};
      b.update = jest.fn().mockReturnValue(b);
      b.set = jest.fn().mockReturnValue(b);
      b.where = jest.fn().mockReturnValue(b);
      b.execute = jest.fn().mockResolvedValue({ affected: 1 });
      return b;
    };
    const run = async (orderId: any, rows: any[], oms: any[]) => {
      const b = qb();
      const m: any = {
        find: jest.fn().mockResolvedValue(oms),
        save: jest.fn().mockResolvedValue(rows),
        createQueryBuilder: jest.fn().mockReturnValue(b),
      };
      await (service as any).linkOrderMaterials(m, orderId, rows);
      return { m, b, rows };
    };

    it('UT-LINK-01 手工合同按品名对上订单材料行，订单侧就能标绿', async () => {
      const rows = [{ item_name: '面料A', qty: 100 }, { item_name: '里布B', qty: 50 }];
      await run(43, rows, [{ id: 11, item_name: '面料A' }, { id: 12, item_name: '里布B' }]);
      expect(rows[0]).toMatchObject({ order_material_id: 11 });
      expect(rows[1]).toMatchObject({ order_material_id: 12 });
    });

    it('UT-LINK-02 同名多行按顺序一一对上，不会都指到第一行', async () => {
      const rows = [{ item_name: '面料A', qty: 10 }, { item_name: '面料A', qty: 20 }];
      await run(43, rows, [{ id: 11, item_name: '面料A' }, { id: 12, item_name: '面料A' }]);
      expect(rows.map((r: any) => r.order_material_id)).toEqual([11, 12]);
    });

    it('UT-LINK-03 订单上没有的料（临时加料）不猜——标错行比不标更糟', async () => {
      const rows = [{ item_name: '临时加的辅料', qty: 5 }];
      const { m } = await run(43, rows, [{ id: 11, item_name: '面料A' }]);
      expect(rows[0]).not.toHaveProperty('order_material_id');
      expect(m.save).not.toHaveBeenCalled();
    });

    it('UT-LINK-04 已经有溯源的行不动（拆单生成的合同不受影响）', async () => {
      const rows = [{ item_name: '面料A', qty: 10, order_material_id: 99 }];
      const { m } = await run(43, rows, [{ id: 11, item_name: '面料A' }]);
      expect(rows[0].order_material_id).toBe(99);
      expect(m.find).not.toHaveBeenCalled();
    });

    it('UT-LINK-05 没挂订单的合同（#75 材料合同可不关联订单）直接跳过', async () => {
      const { m } = await run(null, [{ item_name: '面料A', qty: 10 }], []);
      expect(m.find).not.toHaveBeenCalled();
    });

    it('UT-LINK-06 顺带回填最终采购量，同一条订单料被拆成多行时按合计', async () => {
      const rows = [{ item_name: '面料A', qty: 30 }, { item_name: '面料A', qty: 20 }];
      const { b } = await run(43, rows, [{ id: 11, item_name: '面料A' }, { id: 11, item_name: '面料A' }]);
      expect(b.set).toHaveBeenCalledWith({ final_purchase: 50 });
    });

    it('UT-LINK-07 只补空的最终采购量，不覆盖人工填过的数', async () => {
      const rows = [{ item_name: '面料A', qty: 30 }];
      const { b } = await run(43, rows, [{ id: 11, item_name: '面料A' }]);
      expect(b.where).toHaveBeenCalledWith(
        expect.stringContaining('final_purchase IS NULL OR final_purchase = 0'), { id: 11 });
    });
  });


  // ——— #87 材料合同的发货地址＝该款加工厂地址（Grace 2026-08-12）———
  describe('resolveShipToAddress 发货地址取该款加工厂', () => {
    // 按款号查是一条 SQL，桩掉 m.query 即可；同时验证传进去的参数对不对
    const mk = (addresses: string[], order?: any) => ({
      query: jest.fn().mockResolvedValue(addresses.map((a) => ({ address: a }))),
      findOne: jest.fn().mockResolvedValue(order ?? null),
    });

    it('UT-ADDR-01 按款号找加工合同的工厂地址（不是按订单——一张加工合同常合并多个款）', async () => {
      const m = mk(['苏州市吴江区盛泽镇南环二路1155号']);
      const addr = await (service as any).resolveShipToAddress(m, 34, 'CHA271M502');
      expect(addr).toBe('苏州市吴江区盛泽镇南环二路1155号');
      const [sql, params] = m.query.mock.calls[0];
      expect(sql).toContain('FIND_IN_SET');
      expect(sql).toContain("c.type = ?");
      expect(params).toContain('CHA271M502');
      expect(sql).not.toContain('order_id');   // 按订单找是上一版的 bug，别退回去
    });

    it('UT-ADDR-02 材料合同有多个款号时逐个匹配', async () => {
      const m = mk(['地址A']);
      await (service as any).resolveShipToAddress(m, 34, 'A001, A002 ,A003');
      const [sql, params] = m.query.mock.calls[0];
      expect((sql.match(/FIND_IN_SET/g) ?? []).length).toBe(3);
      expect(params).toEqual(expect.arrayContaining(['A001', 'A002', 'A003']));
    });

    it('UT-ADDR-03 合同没带款号时退回订单的款号', async () => {
      const m = mk(['地址A'], { id: 34, style_no: 'CHA271M502', deleted: 0 });
      await (service as any).resolveShipToAddress(m, 34, null);
      expect(m.findOne).toHaveBeenCalled();
      expect(m.query.mock.calls[0][1]).toContain('CHA271M502');
    });

    it('UT-ADDR-04 一个款都没有就直接跳过，不去查库', async () => {
      const m = mk(['地址A']);
      await expect((service as any).resolveShipToAddress(m, null, null)).resolves.toBeNull();
      expect(m.query).not.toHaveBeenCalled();
    });

    it('UT-ADDR-05 命中多家不同加工厂时留空——这批料真要分送两家，系统表达不了，不替业务选', async () => {
      const m = mk(['合肥鑫凯的地址', '另一家加工厂的地址']);
      await expect((service as any).resolveShipToAddress(m, 34, 'A001')).resolves.toBeNull();
    });

    it('UT-ADDR-06 同一家工厂被多个款命中时去重，照常填', async () => {
      const m = mk(['同一个地址', '同一个地址']);
      await expect((service as any).resolveShipToAddress(m, 34, 'A001,A002')).resolves.toBe('同一个地址');
    });

    it('UT-ADDR-07 查库出错不能把建合同整个搞挂——发货地址只是锦上添花', async () => {
      const m = { query: jest.fn().mockRejectedValue(new Error('db down')), findOne: jest.fn() };
      await expect((service as any).resolveShipToAddress(m, 34, 'A001')).resolves.toBeNull();
    });
  });

  // ===== #120 防线·后端闸：同名材料多行 + 标了拆分，两扇钱的门都要拦 =====

  it('UT-CON-36 generateFromOrder 拦订单73版型（同名多行各填一色+BY_COLOR）', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ id: 10, currency: 'CNY', deleted: 0 });
    mockRepo.count.mockResolvedValueOnce(0);
    mockOrderMaterialRepo.find.mockResolvedValueOnce([
      { item_name: '金属丝底PU', color: '米白', split_mode: 'BY_COLOR', supplier: 'A厂', sort_order: 0 },
      { item_name: '金属丝底PU', color: '咖色', split_mode: 'BY_COLOR', supplier: 'A厂', sort_order: 1 },
    ]);
    await expect(service.generateFromOrder(10, 1)).rejects.toThrow(/金属丝底PU.*第 1、2 行/);
  });

  it('UT-CON-37 手建材料合同选订单自动带出，同样拦（create 这扇门此前没闸）', async () => {
    mockRedis.eval.mockResolvedValue('HT-20260902-001');
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, style_no: 'M525', delivery_date: null, deleted: 0 });
    mockOrderMaterialRepo.find.mockResolvedValue([
      { item_name: '拉链', color: '黑色', split_mode: 'BY_BOTH', sort_order: 0 },
      { item_name: '拉链', color: '黑色', split_mode: 'BY_BOTH', sort_order: 1 },
    ]);
    // 闸在进事务之前就抛——这里不排队 transaction mock，否则会串染后面的用例
    await expect(service.create({ type: ContractType.MATERIAL, factory_id: 5, order_id: 10 } as any, 1))
      .rejects.toThrow(/拉链.*颜色相同/);
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('UT-CON-38 订单42版型（部位互异+颜色全空）放行且各行独立按矩阵拆色', async () => {
    mockRedis.eval.mockResolvedValue('HT-20260902-002');
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, style_no: 'M525', delivery_date: null, deleted: 0 });
    mockOrderMaterialRepo.find.mockResolvedValue([
      { item_name: '双面呢', part: '前胸后背', color: '', unit: '米', net_usage: 0.5, loss_rate: 0, split_mode: 'BY_COLOR', sort_order: 0 },
      { item_name: '双面呢', part: '大袖', color: '', unit: '米', net_usage: 0.3, loss_rate: 0, split_mode: 'BY_COLOR', sort_order: 1 },
    ]);
    mockMatrixRepo.findOne.mockResolvedValue({ matrix_data: { rows: [
      { color: '黑色', size: 'S', qtys: [100] },
      { color: '藏青', size: 'M', qtys: [100] },
    ] } });
    const savedLines: any[] = [];
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb({
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => {
        if (Array.isArray(v)) savedLines.push(...v);
        return Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 });
      }),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),
      query: jest.fn().mockResolvedValue([]),
    }));
    await service.create({ type: ContractType.MATERIAL, factory_id: 5, order_id: 10 } as any, 1);
    expect(savedLines).toHaveLength(4); // 2 部位 × 2 色
    const chest = savedLines.filter((l) => l.qty === 50);  // 前胸后背 100×0.5
    expect(chest).toHaveLength(2);
  });

  it('UT-CON-39 final_purchase=0 不是有效值：按占比分摊要退到 total_purchase（生产 543/800 行存 0）', async () => {
    mockRedis.eval.mockResolvedValue('HT-20260902-003');
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, style_no: 'M525', delivery_date: null, deleted: 0 });
    mockOrderMaterialRepo.find.mockResolvedValue([{
      item_name: '织带', unit: '米', net_usage: 0, loss_rate: 0,
      final_purchase: 0, total_purchase: 500, split_mode: 'BY_COLOR', sort_order: 0,
    }]);
    mockMatrixRepo.findOne.mockResolvedValue({ matrix_data: { rows: [
      { color: '黑色', size: 'S', qtys: [60] },
      { color: '藏青', size: 'M', qtys: [40] },
    ] } });
    const savedLines: any[] = [];
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb({
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => {
        if (Array.isArray(v)) savedLines.push(...v);
        return Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 });
      }),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),
      query: jest.fn().mockResolvedValue([]),
    }));
    await service.create({ type: ContractType.MATERIAL, factory_id: 5, order_id: 10 } as any, 1);
    expect(savedLines.map((l) => l.qty).sort((a, b) => a - b)).toEqual([200, 300]); // 500 按 40/60 分，不是 0
  });

  it('UT-CON-40 标了拆分却没矩阵：整单兜底行的 qty_source 要留「矩阵未分组」痕迹，且 fp=0 退 total', async () => {
    mockRedis.eval.mockResolvedValue('HT-20260902-004');
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, style_no: 'M525', delivery_date: null, deleted: 0 });
    mockOrderMaterialRepo.find.mockResolvedValue([
      { item_name: '胶标', unit: '个', final_purchase: 0, total_purchase: 500, split_mode: 'BY_COLOR', sort_order: 0 },
      { item_name: '主标', unit: '个', final_purchase: 0, total_purchase: 300, split_mode: 'NONE', sort_order: 1 },
    ]);
    mockMatrixRepo.findOne.mockResolvedValue(null); // 无矩阵
    const savedLines: any[] = [];
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb({
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => {
        if (Array.isArray(v)) savedLines.push(...v);
        return Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 });
      }),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),
      query: jest.fn().mockResolvedValue([]),
    }));
    await service.create({ type: ContractType.MATERIAL, factory_id: 5, order_id: 10 } as any, 1);
    const glue = savedLines.find((l) => l.item_name === '胶标');
    const label = savedLines.find((l) => l.item_name === '主标');
    expect(glue.qty).toBe(500);                                  // 0 击穿修复
    expect(glue.qty_source).toBe('采购量含损耗·矩阵未分组');       // 无声降级要留痕
    expect(label.qty_source).toBe('采购量含损耗');                 // 本来就不拆的不背这个标
  });
  // ===== 按色单行 PER_COLOR（#122）：一行一个颜色，原样成一行，不同供应商分到不同合同 =====
  const PC_MATS = [
    { item_name: '金属丝底PU', color: '米白11-0602', split_mode: 'PER_COLOR', supplier: '面料厂A', unit: '米', unit_price: 10, final_purchase: 0, total_purchase: 3988, sort_order: 0 },
    { item_name: '金属丝底PU', color: '浅棕18-1048', split_mode: 'PER_COLOR', supplier: '辅料厂B', unit: '米', unit_price: 12, final_purchase: 4000, total_purchase: 3988, sort_order: 1 },
  ];

  it('UT-CON-41 手建合同带出：按色单行原样一行，颜色就是行上的矩阵颜色，量取该行采购量（fp=0 退 total）', async () => {
    mockRedis.eval.mockResolvedValue('HT-20260902-005');
    mockOrderRepo.findOne.mockResolvedValue({ id: 10, style_no: 'M525', delivery_date: null, deleted: 0 });
    mockOrderMaterialRepo.find.mockResolvedValue(PC_MATS);
    mockMatrixRepo.findOne.mockResolvedValue({ matrix_data: { rows: [{ color: '米白11-0602', size: 'M', qtys: [2264] }, { color: '浅棕18-1048', size: 'M', qtys: [2264] }] } });
    const savedLines: any[] = [];
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb({
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => {
        if (Array.isArray(v)) savedLines.push(...v);
        return Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 });
      }),
      findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
        if (entity === Factory) {
          const hit = [{ id: 7, name: '面料厂A', deleted: 0 }, { id: 8, name: '辅料厂B', deleted: 0 }].find((f) => f.name === opts?.where?.name);
          return Promise.resolve(hit ?? null);
        }
        return Promise.resolve(null);
      }),
      delete: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),
      query: jest.fn().mockResolvedValue([]),
    }));
    await service.create({ type: ContractType.MATERIAL, factory_id: 5, order_id: 10 } as any, 1);
    expect(savedLines.map((l) => [l.color, l.qty, l.qty_source])).toEqual([
      ['米白11-0602', 3988, '采购量·按色单行'],
      ['浅棕18-1048', 4000, '采购量·按色单行'],
    ]);
  });

  it('UT-CON-42 generateFromOrder：两色两家供应商 → 两张合同，各一行（这就是按色单行的目的）', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ id: 10, currency: 'CNY', deleted: 0 });
    mockRepo.count.mockResolvedValueOnce(0);
    mockOrderMaterialRepo.find.mockResolvedValueOnce(PC_MATS);
    mockMatrixRepo.findOne.mockResolvedValue({ matrix_data: { rows: [] } });
    const savedLines: any[] = [];
    mockDataSource.transaction.mockImplementationOnce((cb: any) => cb({
      create: jest.fn().mockImplementation((_: any, v: any) => v),
      save: jest.fn().mockImplementation((_: any, v: any) => {
        if (Array.isArray(v)) savedLines.push(...v);
        return Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 });
      }),
      findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
        if (entity === Factory) {
          const hit = [{ id: 7, name: '面料厂A', deleted: 0 }, { id: 8, name: '辅料厂B', deleted: 0 }].find((f) => f.name === opts?.where?.name);
          return Promise.resolve(hit ?? null);
        }
        return Promise.resolve(null);
      }),
      delete: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),
      query: jest.fn().mockResolvedValue([]),
    }));
    const result = await service.generateFromOrder(10, 1);
    expect(result.created).toBe(2);
    expect(result.unmatched).toEqual([]);
    expect(savedLines).toHaveLength(2);
    expect(savedLines.find((l) => l.color === '浅棕18-1048')).toMatchObject({ qty: 4000, unit_price: 12 });
  });
});

