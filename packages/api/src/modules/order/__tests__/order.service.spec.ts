import { Test, TestingModule } from '@nestjs/testing';
import { SampleMaterial } from '../../sample/sample-material.entity';
import { CustomerService } from '../../customer/customer.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderService } from '../order.service';
import { OrderMain } from '../order-main.entity';
import { OrderSizeMatrix } from '../order-size-matrix.entity';
import { OrderMaterial } from '../order-material.entity';
import { OrderShipment } from '../order-shipment.entity';
import { Quotation } from '../../quote/quotation.entity';
import { QuotationItem } from '../../quote/quotation-item.entity';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
import { SysConfigService } from '../../../common/config/sys-config.service';
import { OrderStatus, QuoteStatus, ApprovalStatus } from '@i9/types';
import { OrderService as OrderServiceStatic } from '../order.service';
import { todayLocal } from '../../../common/utils/local-date';

const makeOrder = (overrides = {}): any => ({
  id: 1,
  order_no: 'SO2024010100001',
  customer_id: 3,
  style_name: 'TestStyle',
  qty_total: 500,
  unit_price: 10,
  total_amount: 5000,
  status: OrderStatus.DRAFT,
  deleted: 0,
  ...overrides,
});

const mockOrderRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve({ ...v, id: v.id ?? 1 })),
  findOne: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  count: jest.fn().mockResolvedValue(0),
};
const mockMatrixRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue(null),
};
const mockMaterialRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockResolvedValue([]),
  find: jest.fn().mockResolvedValue([]),
};
const mockShipmentRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve({ ...v, id: 1 })),
  find: jest.fn().mockResolvedValue([]),
};
const mockQuoteRepo = { findOne: jest.fn(), update: jest.fn() };
const mockQuoteItemRepo = { find: jest.fn().mockResolvedValue([]) };
const mockRedis = { eval: jest.fn().mockResolvedValue(1), incr: jest.fn().mockResolvedValue(1), expire: jest.fn() };
const mockDataSource = {
  query: jest.fn().mockResolvedValue([]),
  transaction: jest.fn().mockImplementation((cb) => cb({
    create: jest.fn().mockImplementation((_, v) => v),
    save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
  })),
};

const mockCustomerServiceDep = { visibleCustomerIds: jest.fn().mockResolvedValue(null) };

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(SampleMaterial), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: CustomerService, useValue: mockCustomerServiceDep },
        { provide: getRepositoryToken(OrderMain), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderSizeMatrix), useValue: mockMatrixRepo },
        { provide: getRepositoryToken(OrderMaterial), useValue: mockMaterialRepo },
        { provide: getRepositoryToken(OrderShipment), useValue: mockShipmentRepo },
        { provide: getRepositoryToken(Quotation), useValue: mockQuoteRepo },
        { provide: getRepositoryToken(QuotationItem), useValue: mockQuoteItemRepo },
        { provide: NumberingService, useValue: new NumberingService(mockRedis as any) },
        { provide: SysConfigService, useValue: { getNumber: jest.fn().mockResolvedValue(0) } },
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  // UT-ORD-01: create calculates total_amount = unit_price * qty_total
  it('UT-ORD-01 create calculates total_amount = unit_price * qty_total', async () => {
    const dto = { customer_id: 3, style_name: 'Test', qty_total: 200, unit_price: 15 };
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    // total = 15 * 200 = 3000
    expect(manager.save.mock.calls[0][1]).toMatchObject({ total_amount: 3000, status: OrderStatus.DRAFT });
  });

  // UT-ORD-02: advanceStatus DRAFT → CONFIRMED
  it('UT-ORD-02 advanceStatus transitions DRAFT→CONFIRMED', async () => {
    const order = makeOrder({ status: OrderStatus.DRAFT });
    mockOrderRepo.findOne.mockResolvedValue(order);
    mockOrderRepo.save.mockResolvedValue({ ...order, status: OrderStatus.CONFIRMED });
    const result = await service.advanceStatus(1);
    expect(result.status).toBe(OrderStatus.CONFIRMED);
  });

  // UT-ORD-03: D1——下单后手动推进被拒(已生成合同/生产中/已完成由下游事件自动回写)
  it('UT-ORD-03 advanceStatus blocks manual advance after 下单 (D1)', async () => {
    const order = makeOrder({ status: OrderStatus.CONFIRMED });
    mockOrderRepo.findOne.mockResolvedValue(order);
    await expect(service.advanceStatus(1)).rejects.toThrow('不可手动推进');
    expect(mockOrderRepo.save).not.toHaveBeenCalled();
  });

  // UT-ORD-04: advanceStatus throws when DONE
  it('UT-ORD-04 advanceStatus throws BadRequest when already DONE', async () => {
    const order = makeOrder({ status: OrderStatus.DONE });
    mockOrderRepo.findOne.mockResolvedValue(order);
    await expect(service.advanceStatus(1)).rejects.toThrow(BadRequestException);
  });

  // UT-ORD-05: addShipment requires PRODUCING or SHIPPED status
  it('UT-ORD-05 addShipment throws BadRequest if status is DRAFT', async () => {
    const order = makeOrder({ status: OrderStatus.DRAFT });
    mockOrderRepo.findOne.mockResolvedValue(order);
    const dto = { shipment_date: '2024-06-01', qty: 100, cartons: 10 };
    await expect(service.addShipment(1, dto as any, 1)).rejects.toThrow(BadRequestException);
  });

  // UT-ORD-06: addShipment succeeds when PRODUCING
  it('UT-ORD-06 addShipment succeeds when order is PRODUCING', async () => {
    const order = makeOrder({ status: OrderStatus.PRODUCING });
    mockOrderRepo.findOne.mockResolvedValue(order);
    const dto = { shipment_date: '2024-06-01', qty: 100, cartons: 10, tracking_no: 'TRACK123' };
    await service.addShipment(1, dto as any, 1);
    expect(mockShipmentRepo.save).toHaveBeenCalledWith(expect.objectContaining({ order_id: 1, qty: 100 }));
  });

  // UT-ORD-07: findOne throws NotFoundException for missing order
  it('UT-ORD-07 findOne throws NotFoundException for missing order', async () => {
    mockOrderRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });

  // UT-ORD-08: 采购量 = 大货总数 × 单件耗用 × (1+损耗%)（订单设计稿公式）
  it('UT-ORD-08 采购量=大货总数×单件耗用×(1+损耗%) during create', async () => {
    const dto = {
      customer_id: 3, style_name: 'Test', qty_total: 100, unit_price: 10,
      materials: [{ item_name: '面料A', unit: 'M', net_usage: 1.5, loss_rate: 10, unit_price: 20 }],
    };
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    const captured = mockMaterialRepo.create.mock.calls[0][0];
    // loss_usage(含损单件) = 1.5 × 1.1 = 1.65；采购量 = 100 × 1.65 = 165
    expect(captured.loss_usage).toBeCloseTo(1.65, 2);
    expect(captured.total_purchase).toBeCloseTo(165, 2);
  });

  // UT-ORD-09: 整数类材料（个/条）采购量向上取整（1454×1.03=1497.62→1498）
  it('UT-ORD-09 整数类材料采购量向上取整', async () => {
    const dto = {
      customer_id: 3, qty_total: 1454, unit_price: 1,
      materials: [{ item_name: 'YKK拉链', unit: '条', net_usage: 1, loss_rate: 3 }],
    };
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    const captured = mockMaterialRepo.create.mock.calls[0][0];
    expect(captured.total_purchase).toBe(1498);
  });

  // ── 关联单据（单据间跳转）：报价→订单反查 + 详情带出上游单据号 ──

  // UT-ORD-10: 报价→订单反查（关联单据 chip）
  it('UT-ORD-10 findAll filters by quote_id', async () => {
    mockOrderRepo.findAndCount.mockResolvedValue([[], 0]);
    await service.findAll({ quote_id: 88 } as any);
    const arg = mockOrderRepo.findAndCount.mock.calls.at(-1)[0];
    expect(arg.where).toMatchObject({ quote_id: 88, deleted: 0 });
  });

  // UT-ORD-11: 详情带出上游报价单号（chip 显示单据号而非裸 ID）
  it('UT-ORD-11 findOne returns quote_no of the source quote', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ quote_id: 55 }));
    mockQuoteRepo.findOne.mockResolvedValue({ id: 55, quote_no: 'QT2024010100001' });
    const res: any = await service.findOne(1);
    expect(res.quote_no).toBe('QT2024010100001');
  });

  // UT-ORD-12: 源报价已删 → quote_no 降级 null，详情不 500
  it('UT-ORD-12 findOne degrades quote_no to null when the source quote is gone', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ quote_id: 55 }));
    mockQuoteRepo.findOne.mockResolvedValue(null);
    const res: any = await service.findOne(1);
    expect(res.quote_no).toBeNull();
  });

  // UT-ORD-13: L5——编辑清空单价(unit_price→null)时 total_amount 同步清空,不保留旧值
  it('UT-ORD-13 update clears total_amount when unit_price is cleared (L5)', async () => {
    const order = makeOrder({ status: OrderStatus.DRAFT, unit_price: 10, qty_total: 500, total_amount: 5000 });
    mockOrderRepo.findOne.mockResolvedValue(order);
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
      delete: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.update(1, { unit_price: null } as any);
    const savedMain = manager.save.mock.calls.find((c) => c[0] === OrderMain)?.[1];
    expect(savedMain.total_amount).toBeNull();
    expect(savedMain.approval_status).toBe(ApprovalStatus.NONE);
  });

  // UT-ORD-14: M9——已完成(终态)订单禁止改矩阵
  it('UT-ORD-14 updateMatrix rejects DONE orders (M9)', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DONE }));
    await expect(service.updateMatrix(1, { rows: [] })).rejects.toThrow(BadRequestException);
    expect(mockMatrixRepo.save).not.toHaveBeenCalled();
  });

  // UT-ORD-15: M9——矩阵变更回填 qty_total/重算 total_amount 与材料,矩阵/主表/材料三线一致
  it('UT-ORD-15 updateMatrix backfills qty_total and recalcs materials (M9)', async () => {
    const order = makeOrder({ status: OrderStatus.CONFIRMED, qty_total: 500, unit_price: 10, total_amount: 5000 });
    mockOrderRepo.findOne.mockResolvedValue(order);
    mockMatrixRepo.findOne.mockResolvedValue({ id: 9, order_id: 1, matrix_data: { pos: [], rows: [{ style_no: 'A', qtys: [500] }] } });
    const material = {
      id: 5, order_id: 1, item_name: '面料A', unit: 'M', net_usage: 1.5, loss_rate: 10,
      loss_usage: 1.65, qty: 500, total_purchase: 825, final_purchase: 825, round_up: null, unit_price: 20, budget: 16500,
    };
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: v.id ?? 1 })),
      find: jest.fn().mockResolvedValue([material]),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.updateMatrix(1, { pos: [], rows: [{ style_no: 'A', qtys: [100, 200] }, { style_no: 'A', qtys: [300] }] });
    // 矩阵总数 600 → 主表回填 + 清审批 + bump 内容时间
    expect(order.qty_total).toBe(600);
    expect(order.total_amount).toBe(6000);
    expect(order.approval_status).toBe(ApprovalStatus.NONE);
    expect(order.content_updated_at).toBeInstanceOf(Date);
    // 材料重算:600×1.5×(1+10%)=990(未微调过的 final_purchase 跟随),budget=990×20
    expect(material.qty).toBe(600);
    expect(material.total_purchase).toBeCloseTo(990, 2);
    expect(material.final_purchase).toBeCloseTo(990, 2);
    expect(material.budget).toBeCloseTo(19800, 2);
  });

  // UT-ORD-16: M9——矩阵内容无变化时不 bump content_updated_at,防合同侧「源订单已变更」误报
  it('UT-ORD-16 updateMatrix does not bump content_updated_at when matrix unchanged (M9)', async () => {
    const md = { pos: [], rows: [{ style_no: 'A', qtys: [500] }] };
    const order = makeOrder({ status: OrderStatus.CONFIRMED, qty_total: 500, unit_price: 10, total_amount: 5000 });
    (order as any).content_updated_at = null;
    mockOrderRepo.findOne.mockResolvedValue(order);
    mockMatrixRepo.findOne.mockResolvedValue({ id: 9, order_id: 1, matrix_data: md });
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
      find: jest.fn().mockResolvedValue([]),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.updateMatrix(1, JSON.parse(JSON.stringify(md)));
    expect(order.content_updated_at).toBeNull();
    expect(manager.save).not.toHaveBeenCalled();
  });

  // UT-ORD-17: 撤回下单——已下单→草稿且清审批（用户反馈：已下单需要能改）
  it('UT-ORD-17 revertToDraft transitions CONFIRMED→DRAFT and clears approval', async () => {
    const order = makeOrder({ status: OrderStatus.CONFIRMED, approval_status: ApprovalStatus.APPROVED, approved_by: 9, approved_at: new Date() });
    mockOrderRepo.findOne.mockResolvedValue(order);
    await service.revertToDraft(1);
    // 断言实体被就地改写（不断言 save 返回值：既有用例的 save mockResolvedValue 会跨用例残留）
    expect(order.status).toBe(OrderStatus.DRAFT);
    expect(order.approval_status).toBe(ApprovalStatus.NONE);
    expect(order.approved_by).toBeNull();
    expect(order.approved_at).toBeNull();
    expect(mockOrderRepo.save).toHaveBeenCalledWith(order);
  });

  // UT-ORD-18: 撤回守卫——草稿/已生成合同均拒绝（后者提示先处理下游合同）
  it('UT-ORD-18 revertToDraft rejects DRAFT and CONTRACTED', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DRAFT }));
    await expect(service.revertToDraft(1)).rejects.toThrow('本就是草稿');
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.CONTRACTED }));
    mockDataSource.query.mockResolvedValueOnce([{ contract_no: 'HT-20260901-001' }]); // 名下还有活合同（B039 后按真实合同判）
    await expect(service.revertToDraft(1)).rejects.toThrow('已生成合同的订单不可撤回');
    expect(mockOrderRepo.save).not.toHaveBeenCalled();
  });

  // UT-ORD-19: 删除引用报价的草稿订单——报价无其它订单引用时解锁（已成单→已报价）
  it('UT-ORD-19 remove unlocks quote when no other orders reference it', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DRAFT, quote_id: 7 }));
    mockOrderRepo.count.mockResolvedValue(0);
    await service.remove(1);
    expect(mockQuoteRepo.update).toHaveBeenCalledWith({ id: 7, status: 'ORDERED' }, { status: 'QUOTED' });
  });

  // UT-ORD-20: 删除草稿订单但报价仍被其它订单引用——报价保持已成单不动
  it('UT-ORD-20 remove keeps quote ORDERED when other orders still reference it', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DRAFT, quote_id: 7 }));
    mockOrderRepo.count.mockResolvedValue(1);
    await service.remove(1);
    expect(mockQuoteRepo.update).not.toHaveBeenCalled();
  });

  // UT-ORD-21: 行级「已生成合同」标记（用户反馈 2026-08-03）——有合同行的材料 contracted=true 并带合同号
  it('UT-ORD-21 findOne flags materials that already have a contract', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder());
    mockMaterialRepo.find.mockResolvedValueOnce([
      { id: 11, item_name: '面料A' }, { id: 12, item_name: '辅料B' },
    ]);
    // 分色展开成多行合同明细 → 同一订单材料出现多次，只应折算成一条合同
    mockDataSource.query.mockResolvedValueOnce([
      { omid: 11, contract_id: 5, contract_no: 'HT-20260803-001' },
    ]);
    const res: any = await service.findOne(1);
    expect(res.materials[0]).toMatchObject({
      id: 11, contracted: true, contracts: [{ id: 5, contract_no: 'HT-20260803-001' }],
    });
    expect(res.materials[1]).toMatchObject({ id: 12, contracted: false, contracts: [] });
  });

  // UT-ORD-22: 编辑订单必须保住材料行 ID——否则合同侧 order_material_id 悬空、「已订」标记全丢
  it('UT-ORD-22 update keeps existing material row ids and only deletes dropped rows', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DRAFT }));
    const manager = {
      find: jest.fn().mockResolvedValue([{ id: 11 }, { id: 12 }]),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(v)),
      findOne: jest.fn().mockResolvedValue(null),
      query: jest.fn().mockResolvedValue([]), // 被删的 12 号行没进过合同（B007）
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.update(1, {
      materials: [{ id: 11, item_name: '面料A' }, { item_name: '新增料C' }],
    } as any);
    const saved = manager.save.mock.calls.find((c) => Array.isArray(c[1]))?.[1];
    expect(saved[0]).toMatchObject({ id: 11, item_name: '面料A' }); // 原地更新，ID 不变
    expect(saved[1].id).toBeUndefined();                            // 新增行不带 ID
    // 12 号行本次没提交 → 只删它，不再整表删
    expect(manager.delete).toHaveBeenCalledWith(OrderMaterial, expect.objectContaining({ order_id: 1 }));
    expect(manager.delete.mock.calls[0][1].id).toBeDefined();
  });

  // UT-ORD-23: 越权守卫——传别的订单的材料行 ID，当新增行处理，不得把那行改绑过来
  it('UT-ORD-23 update treats foreign material ids as new rows', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DRAFT }));
    const manager = {
      find: jest.fn().mockResolvedValue([{ id: 11 }]),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(v)),
      findOne: jest.fn().mockResolvedValue(null),
      query: jest.fn().mockResolvedValue([]),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.update(1, { materials: [{ id: 999, item_name: '别单的料' }] } as any);
    const saved = manager.save.mock.calls.find((c) => Array.isArray(c[1]))?.[1];
    expect(saved[0].id).toBeUndefined();
  });

  // ===== #120 防线·保存闸：同名材料多行 + 标了拆分（buildMaterials 是 create/update/importFromQuote 共同漏斗） =====

  it('UT-ORD-DS-01 create 拦订单73版型：同名多行各填一色 + BY_COLOR', async () => {
    const dto = {
      customer_id: 3, style_name: 'T', qty_total: 800, unit_price: 1,
      materials: [
        { item_name: '金属丝底PU', color: '米白', split_mode: 'BY_COLOR', net_usage: 1 },
        { item_name: '金属丝底PU', color: '咖色', split_mode: 'BY_COLOR', net_usage: 1 },
      ],
    };
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.create(dto as any, 1)).rejects.toThrow(/金属丝底PU.*拆分/);
  });

  it('UT-ORD-DS-02 create 放行订单42版型：部位互异非空 + 颜色全空（按部位分摊净耗）', async () => {
    const dto = {
      customer_id: 3, style_name: 'T', qty_total: 500, unit_price: 1,
      materials: [
        { item_name: '双面呢', part: '前胸后背', color: '', split_mode: 'BY_COLOR', net_usage: 0.5 },
        { item_name: '双面呢', part: '大袖', color: '', split_mode: 'BY_COLOR', net_usage: 0.3 },
        { item_name: '双面呢', part: '前下片', color: '', split_mode: 'BY_COLOR', net_usage: 0.2 },
      ],
    };
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.create(dto as any, 1)).resolves.toBeTruthy();
  });

  it('UT-ORD-DS-03 update 也过同一把闸（同漏斗）', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ id: 9, qty_total: 800, status: OrderStatus.DRAFT, deleted: 0 });
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(v)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.update(9, {
      materials: [
        { item_name: '拉链', color: '黑色', split_mode: 'BY_COLOR', net_usage: 1 },
        { item_name: '拉链', color: '黑色', split_mode: 'BY_COLOR', net_usage: 1 },
      ],
    } as any)).rejects.toThrow(/拉链/);
  });

  // ===== importFromQuote：重导拦截与拆分设置保留（cm#41 悬空事故的根治） =====

  const IMP_ORDER = { id: 32, status: OrderStatus.DRAFT, qty_total: 900, deleted: 0, style_no: 'M1' };
  const IMP_QUOTE = { id: 7, status: QuoteStatus.QUOTED, customer_id: 3, rmb_total: 12 };
  const impManager = () => ({
    create: jest.fn().mockImplementation((_, v) => v),
    save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),   // 重导会读一次矩阵（按色单行算该色件数用）
    delete: jest.fn(),
  });

  it('UT-IMP-01 已生成合同的订单拒绝重导——整表重插会把合同行的溯源打断（生产 cm#41 实发）', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ ...IMP_ORDER });
    mockQuoteRepo.findOne.mockResolvedValueOnce({ ...IMP_QUOTE });
    mockQuoteItemRepo.find.mockResolvedValueOnce([]);
    mockDataSource.query.mockResolvedValueOnce([{ contract_no: 'HT-20260724-001' }]);
    mockDataSource.transaction.mockClear();
    await expect(service.importFromQuote(32, 7)).rejects.toThrow(/HT-20260724-001.*删除相关合同/);
    expect(mockDataSource.transaction).not.toHaveBeenCalled(); // 一行都没动
  });

  it('UT-IMP-02 没有合同时照常重导：先清旧行再插新行', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ ...IMP_ORDER });
    mockQuoteRepo.findOne.mockResolvedValueOnce({ ...IMP_QUOTE });
    mockQuoteItemRepo.find.mockResolvedValueOnce([
      { id: 71, item_name: '主面料', quote_usage: 1.2, loss_rate: 3, rmb_price: 8 },
    ]);
    mockDataSource.query.mockResolvedValueOnce([]); // 无合同
    const m = impManager();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(m));
    await service.importFromQuote(32, 7);
    expect(m.delete).toHaveBeenCalledWith(expect.anything(), { order_id: 32 });
    const saved = m.save.mock.calls.find((c) => Array.isArray(c[1]))![1];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ item_name: '主面料', quote_item_id: 71, split_mode: 'NONE' });
  });

  it('UT-IMP-03 重导保留拆分设置：品名唯一对应的行，split_mode 与 size_specs 原样带过去', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ ...IMP_ORDER });
    mockQuoteRepo.findOne.mockResolvedValueOnce({ ...IMP_QUOTE });
    mockQuoteItemRepo.find.mockResolvedValueOnce([
      { id: 71, item_name: '拉链', quote_usage: 1, loss_rate: 3 },
      { id: 72, item_name: '主面料', quote_usage: 1.2, loss_rate: 3 },
    ]);
    mockDataSource.query.mockResolvedValueOnce([]);
    const m = impManager();
    m.find.mockResolvedValueOnce([
      { item_name: '拉链', split_mode: 'BY_SIZE', size_specs: { S: '50', M: '55' } },
      { item_name: '主面料', split_mode: 'NONE', size_specs: null },
    ]);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(m));
    await service.importFromQuote(32, 7);
    const saved = m.save.mock.calls.find((c) => Array.isArray(c[1]))![1];
    const zip = saved.find((r: any) => r.item_name === '拉链');
    const fab = saved.find((r: any) => r.item_name === '主面料');
    expect(zip).toMatchObject({ split_mode: 'BY_SIZE', size_specs: { S: '50', M: '55' } });
    expect(fab.split_mode).toBe('NONE'); // 本来没拆的不凭空带
  });

  it('UT-IMP-04 品名对不唯一就不猜：报价里两行同名时不携带旧拆分设置', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ ...IMP_ORDER });
    mockQuoteRepo.findOne.mockResolvedValueOnce({ ...IMP_QUOTE });
    mockQuoteItemRepo.find.mockResolvedValueOnce([
      { id: 71, item_name: '拉链', part: '门襟', quote_usage: 1, loss_rate: 3 },
      { id: 72, item_name: '拉链', part: '口袋', quote_usage: 0.5, loss_rate: 3 },
    ]);
    mockDataSource.query.mockResolvedValueOnce([]);
    const m = impManager();
    m.find.mockResolvedValueOnce([{ item_name: '拉链', split_mode: 'BY_COLOR', size_specs: null }]);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(m));
    await service.importFromQuote(32, 7);
    const saved = m.save.mock.calls.find((c) => Array.isArray(c[1]))![1];
    expect(saved.every((r: any) => r.split_mode === 'NONE')).toBe(true);
  });
  // ===== 按色单行 PER_COLOR（#122 daisy：同一种料不同颜色不同供应商/单价）=====
  // 矩阵按订单 73：米白 2264 件、浅棕 2264 件
  const MX = { pos: [{ po_no: 'P1' }], rows: [
    { color: '米白11-0602', size: 'PP', qtys: [336] }, { color: '米白11-0602', size: 'P', qtys: [526] },
    { color: '米白11-0602', size: 'M', qtys: [740] }, { color: '米白11-0602', size: 'G', qtys: [662] },
    { color: '浅棕18-1048', size: 'PP', qtys: [455] }, { color: '浅棕18-1048', size: 'P', qtys: [552] },
    { color: '浅棕18-1048', size: 'M', qtys: [718] }, { color: '浅棕18-1048', size: 'G', qtys: [539] },
  ] };
  const PC_ROWS = [
    { item_name: '金属丝底PU', color: '米白11-0602', split_mode: 'PER_COLOR', unit: '米', net_usage: 1.71, loss_rate: 3, round_up: 1, supplier: 'A厂', unit_price: 10 },
    { item_name: '金属丝底PU', color: '浅棕18-1048', split_mode: 'PER_COLOR', unit: '米', net_usage: 1.71, loss_rate: 3, round_up: 1, supplier: 'B厂', unit_price: 12 },
  ];
  const savedMaterials = (m: any) => m.save.mock.calls.find((c: any[]) => Array.isArray(c[1]))![1];

  it('UT-PC-ORD-01 create：按色单行的算量基数是该色件数（2264），不是大货总数（4528）', async () => {
    const m = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(m));
    await service.create({ customer_id: 3, style_name: 'T', qty_total: 4528, unit_price: 1, matrix_data: MX, materials: PC_ROWS } as any, 1);
    const rows = savedMaterials(m);
    expect(rows.map((r: any) => [r.color, r.qty, r.total_purchase, r.final_purchase, r.supplier])).toEqual([
      ['米白11-0602', 2264, 3988, 3988, 'A厂'],   // ceil(2264×1.71×1.03)=3988，与订单 73 合同上的数一致
      ['浅棕18-1048', 2264, 3988, 3988, 'B厂'],
    ]);
  });

  it('UT-PC-ORD-02 create：按色单行选了矩阵里没有的颜色 → 拒绝（否则件数 0、采购量 0 还不报错）', async () => {
    mockDataSource.transaction.mockImplementationOnce((cb) => cb({
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
    }));
    await expect(service.create({ customer_id: 3, style_name: 'T', qty_total: 4528, unit_price: 1, matrix_data: MX,
      materials: [{ ...PC_ROWS[0], color: '咖色' }] } as any, 1)).rejects.toThrow(/咖色/);
  });

  it('UT-PC-ORD-03 update 没带矩阵时用库里的矩阵算该色件数', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ id: 9, qty_total: 4528, status: OrderStatus.DRAFT, deleted: 0 });
    const m = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(v)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation((entity) => Promise.resolve(entity === OrderSizeMatrix ? { order_id: 9, matrix_data: MX } : null)),
      delete: jest.fn(),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(m));
    await service.update(9, { materials: [PC_ROWS[1]] } as any);
    expect(savedMaterials(m)[0]).toMatchObject({ color: '浅棕18-1048', qty: 2264, total_purchase: 3988 });
  });

  it('UT-PC-ORD-04 updateMatrix：颜色之间挪数、总数不变，按色单行的行也要重算（原来只看总数变没变）', async () => {
    const order = makeOrder({ status: OrderStatus.CONFIRMED, qty_total: 4528, unit_price: 10, total_amount: 45280 });
    mockOrderRepo.findOne.mockResolvedValue(order);
    mockMatrixRepo.findOne.mockResolvedValue({ id: 9, order_id: 1, matrix_data: MX });
    const perColor = { id: 5, order_id: 1, item_name: '金属丝底PU', color: '米白11-0602', split_mode: 'PER_COLOR', unit: '米',
      net_usage: 1, loss_rate: 0, round_up: 0, qty: 2264, total_purchase: 2264, final_purchase: 2264, unit_price: 10, budget: 22640 };
    const whole = { id: 6, order_id: 1, item_name: '主标', color: '', split_mode: 'NONE', unit: '个',
      net_usage: 1, loss_rate: 0, round_up: 1, qty: 4528, total_purchase: 4528, final_purchase: 4528, unit_price: 1, budget: 4528 };
    const manager = {
      create: jest.fn().mockImplementation((_, v) => v),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: v.id ?? 1 })),
      find: jest.fn().mockResolvedValue([perColor, whole]),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    // 米白挪成 3000、浅棕 1528，总数仍 4528
    await service.updateMatrix(1, { pos: [{ po_no: 'P1' }], rows: [
      { color: '米白11-0602', size: 'M', qtys: [3000] }, { color: '浅棕18-1048', size: 'M', qtys: [1528] },
    ] });
    expect(order.qty_total).toBe(4528);
    expect(perColor).toMatchObject({ qty: 3000, total_purchase: 3000, final_purchase: 3000, budget: 30000 });
    expect(whole).toMatchObject({ qty: 4528, total_purchase: 4528 });   // 不拆的行重算结果不变
  });

  // ===== 2026-09-20 全系统审查 · 订单模块缺陷回归（B0xx/B1xx 为清单编号） =====

  const txManager = (over: Record<string, any> = {}) => ({
    create: jest.fn().mockImplementation((_: any, v: any) => v),
    save: jest.fn().mockImplementation((_: any, v: any) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: v.id ?? 1 })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({}),
    query: jest.fn().mockResolvedValue([]),
    ...over,
  });

  it('B007 编辑订单删掉已进合同的材料行 → 拒绝并点名合同号，一行都不删', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DRAFT }));
    const manager = txManager({
      find: jest.fn().mockResolvedValue([{ id: 11, item_name: '面料A' }, { id: 12, item_name: '金属丝底PU' }]),
      query: jest.fn().mockResolvedValue([{ omid: 12, contract_no: 'HT-20260910-003' }]),
    });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.update(1, { materials: [{ id: 11, item_name: '面料A' }] } as any))
      .rejects.toThrow(/金属丝底PU.*HT-20260910-003/);
    // 查的就是被删的那一行，且事务内用 manager（不用 this.xxxRepo）
    expect(manager.query.mock.calls[0][1]).toEqual([[12]]);
    expect(manager.delete).not.toHaveBeenCalled();
    expect(manager.save.mock.calls.some((c) => Array.isArray(c[1]))).toBe(false);
  });

  it('B007 没删任何行时不查合同（只回传全部旧行 + 新增行）', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DRAFT }));
    const manager = txManager({ find: jest.fn().mockResolvedValue([{ id: 11, item_name: '面料A' }]) });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.update(1, { materials: [{ id: 11, item_name: '面料A' }, { item_name: '新料' }] } as any);
    expect(manager.query).not.toHaveBeenCalled();
    expect(manager.delete).toHaveBeenCalled();
  });

  it('B050 整数单位：300×0.07 / 100×0.2×1.05 的浮点噪声不能让 ceil 多买 1 个', () => {
    expect(OrderServiceStatic.calcPurchase(300, 0.07, 0, '个').total).toBe(21);
    expect(OrderServiceStatic.calcPurchase(100, 0.2, 5, '个').total).toBe(21);
    expect(OrderServiceStatic.calcPurchase(100, 0.2, 5, undefined, true).total).toBe(21);
    // 真有小数照样向上取整、非整数单位仍保留 4 位
    expect(OrderServiceStatic.calcPurchase(1454, 1, 3, '条').total).toBe(1498);
    expect(OrderServiceStatic.calcPurchase(300, 0.07, 0, '米').total).toBe(21);
    expect(OrderServiceStatic.calcPurchase(7, 0.3333, 0, '米').total).toBe(2.3331);
  });

  it('B052 编辑改买家 → 同步刷新 buyer_name 快照；清空买家 → 快照一起清', async () => {
    const order = makeOrder({ status: OrderStatus.DRAFT, buyer_id: 5, buyer_name: 'A公司' });
    mockOrderRepo.findOne.mockResolvedValue(order);
    mockDataSource.query.mockResolvedValueOnce([{ name: 'B公司' }]);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(txManager()));
    await service.update(1, { buyer_id: 8 } as any);
    expect(mockDataSource.query.mock.calls.at(-1)[1]).toEqual([8]);
    expect(order).toMatchObject({ buyer_id: 8, buyer_name: 'B公司' });

    mockDataSource.transaction.mockImplementationOnce((cb) => cb(txManager()));
    await service.update(1, { buyer_id: null } as any);
    expect(order.buyer_id).toBeNull();
    expect(order.buyer_name).toBeNull();
  });

  it('B052 买家 ID 不存在 → 400，不落库', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DRAFT }));
    mockDataSource.query.mockResolvedValueOnce([]);
    mockDataSource.transaction.mockClear();
    await expect(service.update(1, { buyer_id: 404 } as any)).rejects.toThrow(/最终买家客户 #404 不存在/);
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('B053 从报价导入带入单价后重算 total_amount（否则直接「下单」拿陈旧金额绕过阈值审批）', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ ...IMP_ORDER, qty_total: 1000, unit_price: null, total_amount: null });
    mockQuoteRepo.findOne.mockResolvedValueOnce({ ...IMP_QUOTE, rmb_total: 500 });
    mockQuoteItemRepo.find.mockResolvedValueOnce([]);
    mockDataSource.query.mockResolvedValueOnce([]);
    const m = impManager();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(m));
    await service.importFromQuote(32, 7);
    const savedMain = m.save.mock.calls.find((c) => c[0] === OrderMain)![1];
    expect(savedMain).toMatchObject({ unit_price: 500, total_amount: 500000 });
  });

  it('B054 报价明细损耗 0%、单价 0 元原样导入，不被当成「没填」', async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({ ...IMP_ORDER, qty_total: 100 });
    mockQuoteRepo.findOne.mockResolvedValueOnce({ ...IMP_QUOTE });
    mockQuoteItemRepo.find.mockResolvedValueOnce([
      { id: 71, item_name: '客供辅料', quote_usage: '2.0000', loss_rate: '0.00', rmb_price: '0.0000' }, // mysql decimal 回来是字符串
      { id: 72, item_name: '主面料', quote_usage: 1.2, loss_rate: null, rmb_price: null },              // 真没填才回退默认
    ]);
    mockDataSource.query.mockResolvedValueOnce([]);
    const m = impManager();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(m));
    await service.importFromQuote(32, 7);
    const saved = m.save.mock.calls.find((c) => Array.isArray(c[1]))![1];
    expect(saved[0]).toMatchObject({ item_name: '客供辅料', loss_rate: 0, unit_price: 0, total_purchase: 200 });
    expect(saved[1]).toMatchObject({ item_name: '主面料', loss_rate: 3 });
    expect(saved[1].unit_price).toBeUndefined();
  });

  it('B055 改矩阵把颜色改名后，按色单行对不上 → 拒绝，不把该行算成 0 也不落矩阵', async () => {
    const order = makeOrder({ status: OrderStatus.CONFIRMED, qty_total: 4528, unit_price: 10 });
    mockOrderRepo.findOne.mockResolvedValue(order);
    mockMatrixRepo.findOne.mockResolvedValue({ id: 9, order_id: 1, matrix_data: MX });
    const perColor = { id: 5, order_id: 1, item_name: '金属丝底PU', color: '米白11-0602', split_mode: 'PER_COLOR', unit: '米',
      net_usage: 1, loss_rate: 0, round_up: 0, qty: 2264, total_purchase: 2264, final_purchase: 2264, unit_price: 10, budget: 22640 };
    const manager = txManager({ find: jest.fn().mockResolvedValue([perColor]) });
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await expect(service.updateMatrix(1, { pos: [{ po_no: 'P1' }], rows: [
      { color: '米白色11-0602', size: 'M', qtys: [3000] }, { color: '浅棕18-1048', size: 'M', qtys: [1528] },
    ] })).rejects.toThrow(/金属丝底PU.*米白11-0602.*不在数量搭配矩阵里/);
    expect(perColor.total_purchase).toBe(2264); // 没被改成 0
    expect(manager.save.mock.calls.some((c) => c[0] === OrderSizeMatrix || c[0] === OrderMaterial)).toBe(false);
  });

  it('B056 草稿订单名下还有未删除合同 → 不能删', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DRAFT, quote_id: 7 }));
    mockDataSource.query.mockResolvedValueOnce([{ contract_no: 'HT-20260905-001' }, { contract_no: 'HT-20260905-002' }]);
    await expect(service.remove(1)).rejects.toThrow(/HT-20260905-001、HT-20260905-002.*先删除相关合同/);
    expect(mockOrderRepo.save).not.toHaveBeenCalled();
    expect(mockQuoteRepo.update).not.toHaveBeenCalled();
  });

  it('B128 编辑 / 改矩阵 / 导入报价 清审批状态时一并清 approved_by / approved_at', async () => {
    const stamp = { approval_status: ApprovalStatus.APPROVED, approved_by: 9, approved_at: new Date('2026-09-01') };
    // update
    const o1 = makeOrder({ status: OrderStatus.DRAFT, ...stamp });
    mockOrderRepo.findOne.mockResolvedValue(o1);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(txManager()));
    await service.update(1, { unit_price: 99 } as any);
    expect(o1).toMatchObject({ approval_status: ApprovalStatus.NONE, approved_by: null, approved_at: null });
    // updateMatrix（数量变了）
    const o2 = makeOrder({ status: OrderStatus.CONFIRMED, qty_total: 500, ...stamp });
    mockOrderRepo.findOne.mockResolvedValue(o2);
    mockMatrixRepo.findOne.mockResolvedValue(null);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(txManager()));
    await service.updateMatrix(1, { pos: [], rows: [{ style_no: 'A', qtys: [600] }] });
    expect(o2).toMatchObject({ approval_status: ApprovalStatus.NONE, approved_by: null, approved_at: null });
    // importFromQuote
    const o3 = { ...IMP_ORDER, ...stamp };
    mockOrderRepo.findOne.mockResolvedValueOnce(o3);
    mockQuoteRepo.findOne.mockResolvedValueOnce({ ...IMP_QUOTE });
    mockQuoteItemRepo.find.mockResolvedValueOnce([]);
    mockDataSource.query.mockResolvedValueOnce([]);
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(impManager()));
    await service.importFromQuote(32, 7);
    expect(o3).toMatchObject({ approval_status: ApprovalStatus.NONE, approved_by: null, approved_at: null });
  });

  it('B129 复制订单：制单日期是今天、外部单号不带；报价 id 保留（1:N 关系，未拍板不动）', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({
      quote_id: 7, make_date: '2026-01-05', external_no: 'OLD-SYS-001', customer_po: 'PO1', status: OrderStatus.DONE,
    }));
    const manager = txManager();
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.copy(1, 2);
    const created = manager.create.mock.calls.find((c) => c[0] === OrderMain)![1];
    expect(created.make_date).toBe(todayLocal());
    expect(created.external_no).toBeNull();
    expect(created).toMatchObject({ quote_id: 7, customer_po: 'PO1', status: OrderStatus.DRAFT, created_by: 2 });
  });

  it('B130 撤回下单把报价从「已成单」放回「已报价」；还有别的非草稿订单挂着时不动', async () => {
    const order = makeOrder({ status: OrderStatus.CONFIRMED, quote_id: 7 });
    mockOrderRepo.findOne.mockResolvedValue(order);
    mockOrderRepo.count.mockResolvedValueOnce(0);
    await service.revertToDraft(1);
    expect(order.status).toBe(OrderStatus.DRAFT);
    const where = mockOrderRepo.count.mock.calls.at(-1)[0].where;
    expect(where).toMatchObject({ quote_id: 7, deleted: 0 });
    expect(where.id).toBeDefined();      // 排除自己
    expect(where.status).toBeDefined();  // 只算非草稿
    expect(mockQuoteRepo.update).toHaveBeenCalledWith({ id: 7, status: QuoteStatus.ORDERED }, { status: QuoteStatus.QUOTED });

    mockQuoteRepo.update.mockClear();
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.CONFIRMED, quote_id: 7 }));
    mockOrderRepo.count.mockResolvedValueOnce(1);
    await service.revertToDraft(1);
    expect(mockQuoteRepo.update).not.toHaveBeenCalled();
  });

  it('B132 改矩阵时 final_purchase=0 视为未微调，跟随系统量重算（与合同侧拆行同口径）', async () => {
    const order = makeOrder({ status: OrderStatus.CONFIRMED, qty_total: 500, unit_price: 10 });
    mockOrderRepo.findOne.mockResolvedValue(order);
    mockMatrixRepo.findOne.mockResolvedValue(null);
    const zero = { id: 5, order_id: 1, item_name: '面料A', unit: 'M', net_usage: 1.5, loss_rate: 10,
      loss_usage: 1.65, qty: 500, total_purchase: 825, final_purchase: 0, round_up: null, unit_price: 20, budget: 0 };
    const manual = { id: 6, order_id: 1, item_name: '辅料B', unit: 'M', net_usage: 1, loss_rate: 0,
      loss_usage: 1, qty: 500, total_purchase: 500, final_purchase: 480, round_up: null, unit_price: 2, budget: 960 };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(txManager({ find: jest.fn().mockResolvedValue([zero, manual]) })));
    await service.updateMatrix(1, { pos: [], rows: [{ style_no: 'A', qtys: [600] }] });
    expect(zero.final_purchase).toBeCloseTo(990, 2);   // 0 → 跟随 600×1.5×1.1
    expect(zero.budget).toBeCloseTo(19800, 2);
    expect(manual.final_purchase).toBe(480);           // 真人工微调过的仍保留
  });

  // ── 次项（别组主项在本文件的同类位置） ──

  it('B039(次项) 状态卡在「已生成合同」但名下合同已全删 → 允许撤回为草稿', async () => {
    const order = makeOrder({ status: OrderStatus.CONTRACTED });
    mockOrderRepo.findOne.mockResolvedValue(order);
    mockDataSource.query.mockResolvedValueOnce([]); // 无活合同
    await service.revertToDraft(1);
    expect(order.status).toBe(OrderStatus.DRAFT);
    expect(mockOrderRepo.save).toHaveBeenCalledWith(order);
    // 生产中 / 已完成仍不可撤回
    mockOrderRepo.save.mockClear();
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PRODUCING }));
    await expect(service.revertToDraft(1)).rejects.toThrow('不可撤回');
    expect(mockOrderRepo.save).not.toHaveBeenCalled();
  });

  it('B061(次项) 制单日期取本地日历日，不是 UTC 日期（凌晨建单「单号是今天、日期是昨天」）', async () => {
    // 本地 00:30 —— 在 +08:00 的进程里 UTC 还是前一天
    jest.useFakeTimers({ now: new Date(2026, 8, 20, 0, 30, 0), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask'] });
    try {
      const manager = txManager();
      mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
      await service.create({ customer_id: 3, qty_total: 10 } as any, 1);
      expect(manager.save.mock.calls[0][1].make_date).toBe('2026-09-20');
    } finally {
      jest.useRealTimers();
    }
  });

  it('B122(次项) 详情回查源报价带 deleted:0，已删报价不再被带出', async () => {
    mockOrderRepo.findOne.mockResolvedValue(makeOrder({ quote_id: 55 }));
    mockQuoteRepo.findOne.mockResolvedValue(null);
    await service.findOne(1);
    expect(mockQuoteRepo.findOne).toHaveBeenCalledWith({ where: { id: 55, deleted: 0 } });
  });
});
