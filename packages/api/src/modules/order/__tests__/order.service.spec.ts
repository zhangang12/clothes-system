import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderService } from '../order.service';
import { OrderMain } from '../order-main.entity';
import { OrderSizeMatrix } from '../order-size-matrix.entity';
import { OrderMaterial } from '../order-material.entity';
import { OrderShipment } from '../order-shipment.entity';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
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
const mockRedis = { incr: jest.fn().mockResolvedValue(1), expire: jest.fn() };
const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb) => cb({
    create: jest.fn().mockImplementation((_, v) => v),
    save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
  })),
};

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(OrderMain), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderSizeMatrix), useValue: mockMatrixRepo },
        { provide: getRepositoryToken(OrderMaterial), useValue: mockMaterialRepo },
        { provide: getRepositoryToken(OrderShipment), useValue: mockShipmentRepo },
        { provide: NumberingService, useValue: new NumberingService(mockRedis as any) },
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

  // UT-ORD-03: advanceStatus CONFIRMED → PRODUCING
  it('UT-ORD-03 advanceStatus transitions CONFIRMED→PRODUCING', async () => {
    const order = makeOrder({ status: OrderStatus.CONFIRMED });
    mockOrderRepo.findOne.mockResolvedValue(order);
    mockOrderRepo.save.mockResolvedValue({ ...order, status: OrderStatus.PRODUCING });
    const result = await service.advanceStatus(1);
    expect(result.status).toBe(OrderStatus.PRODUCING);
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

  // UT-ORD-08: loss_rate correctly computes loss_usage (net_usage / (1 - loss_rate/100))
  it('UT-ORD-08 loss_usage = net_usage / (1 - loss_rate/100) during create', async () => {
    const dto = {
      customer_id: 3, style_name: 'Test', qty_total: 100, unit_price: 10,
      materials: [{ item_name: '面料A', unit: 'M', net_usage: 1.5, loss_rate: 10, unit_price: 20 }],
    };
    const capturedMaterial: any = {};
    const manager = {
      create: jest.fn().mockImplementation((_, v) => { if (v.net_usage !== undefined) Object.assign(capturedMaterial, v); return v; }),
      save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
    };
    mockDataSource.transaction.mockImplementationOnce((cb) => cb(manager));
    await service.create(dto as any, 1);
    // loss_usage = 1.5 / (1 - 10/100) = 1.5 / 0.9 = 1.6667
    expect(capturedMaterial.loss_usage).toBeCloseTo(1.6667, 2);
  });
});
