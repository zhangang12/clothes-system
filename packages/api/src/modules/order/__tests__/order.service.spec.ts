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
import { OrderStatus, ApprovalStatus } from '@i9/types';

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
});
