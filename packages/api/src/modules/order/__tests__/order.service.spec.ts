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
import { OrderStatus } from '@i9/types';

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
const mockQuoteRepo = { findOne: jest.fn() };
const mockQuoteItemRepo = { find: jest.fn().mockResolvedValue([]) };
const mockRedis = { eval: jest.fn().mockResolvedValue(1), incr: jest.fn().mockResolvedValue(1), expire: jest.fn() };
const mockDataSource = {
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
});
