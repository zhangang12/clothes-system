import { Test, TestingModule } from '@nestjs/testing';
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
  save: jest.fn().mockImplementation((v) => Promise.resolve({ ...v, id: v.id ?? 1 })),
  findOne: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
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
};
const mockSupplierRepo = {
  findOne: jest.fn().mockResolvedValue({ id: 1, factory_id: 5, status: 1 }),
};
const mockOrderRepo = {
  findOne: jest.fn().mockResolvedValue({ id: 10, qty_total: 1000, deleted: 0 }),
};
const mockFactoryRepo = {
  findOne: jest.fn().mockResolvedValue({ id: 7, name: '面料厂A', deleted: 0 }),
};
const mockRedis = { eval: jest.fn().mockResolvedValue(1), incr: jest.fn().mockResolvedValue(1), expire: jest.fn() };
const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb) => cb({
    create: jest.fn().mockImplementation((_, v) => v),
    save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
    findOne: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  })),
};

describe('ContractService', () => {
  let service: ContractService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOrderMaterialRepo.find.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractService,
        { provide: getRepositoryToken(Contract), useValue: mockRepo },
        { provide: getRepositoryToken(ContractMaterial), useValue: mockMaterialRepo },
        { provide: getRepositoryToken(ContractShipment), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(ContractPortalLog), useValue: mockLogRepo },
        { provide: getRepositoryToken(OrderMaterial), useValue: mockOrderMaterialRepo },
        { provide: getRepositoryToken(OrderMain), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderSizeMatrix), useValue: mockMatrixRepo },
        { provide: getRepositoryToken(Factory), useValue: mockFactoryRepo },
        { provide: getRepositoryToken(SupplierAccount), useValue: mockSupplierRepo },
        { provide: NumberingService, useValue: new NumberingService(mockRedis as any) },
        { provide: SysConfigService, useValue: { getNumber: jest.fn().mockResolvedValue(0) } },
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
    mockFactoryRepo.findOne
      .mockResolvedValueOnce({ id: 7, name: '面料厂A', deleted: 0 })
      .mockResolvedValueOnce({ id: 8, name: '辅料厂B', deleted: 0 });
    const result = await service.generateFromOrder(10, 1);
    expect(result.created).toBe(2); // 面料厂A + 辅料厂B
    expect(result.unmatched).toContain('未指定供应商'); // 空供应商无法匹配工厂
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

  // UT-CON-04b: push throws when factory has no bound portal account (A5 死流程防护)
  it('UT-CON-04b push throws BadRequest when factory has no active portal account', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.DRAFT });
    mockRepo.findOne.mockResolvedValue(contract);
    mockSupplierRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.push(1, 'admin')).rejects.toThrow(BadRequestException);
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
    }));
    await service.create({ type: ContractType.MATERIAL, factory_id: 5, order_id: 10 } as any, 1);
    expect(savedLines).toHaveLength(2);
    expect(savedLines.find((l) => l.size === 'S').qty).toBe(180); // 420×180/420
    expect(savedLines.find((l) => l.size === 'M').qty).toBe(240); // 420×240/420
    expect(savedLines[0].qty_source).toBe('采购量·分码');
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
    }));
    await service.create({ type: ContractType.MATERIAL, factory_id: 5, order_id: 10 } as any, 1);
    expect(savedLines).toHaveLength(2); // 各退回单行
    expect(savedLines[0].color).toBe('藏青');
    expect(savedLines[1].qty).toBe(500);
  });
});
