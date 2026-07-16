import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExportInvoiceService } from '../export-invoice.service';
import { ExportInvoice } from '../export-invoice.entity';
import { ExportInvoiceItem } from '../export-invoice-item.entity';
import { InvoiceReceipt } from '../invoice-receipt.entity';

const mockRepo = {
  findOne: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
};
const mockItemRepo = {
  find: jest.fn().mockResolvedValue([]),
};
const mockReceiptRepo = {
  find: jest.fn().mockResolvedValue([]),
};
const mockDataSource = {
  query: jest.fn().mockResolvedValue([]),
  transaction: jest.fn().mockImplementation((cb) => cb({
    create: jest.fn().mockImplementation((_, v) => v),
    save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
  })),
};

describe('ExportInvoiceService', () => {
  let service: ExportInvoiceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.findAndCount.mockResolvedValue([[], 0]);
    mockItemRepo.find.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportInvoiceService,
        { provide: getRepositoryToken(ExportInvoice), useValue: mockRepo },
        { provide: getRepositoryToken(ExportInvoiceItem), useValue: mockItemRepo },
        { provide: getRepositoryToken(InvoiceReceipt), useValue: mockReceiptRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ExportInvoiceService>(ExportInvoiceService);
  });

  // ── 关联单据（单据间跳转）：订单→出口发票反查 ──
  // order_id 挂在款项行(一票多款)上，故按行命中的发票 id 过滤主表

  // UT-INV-01: 订单→出口发票反查（关联单据 chip）
  it('UT-INV-01 findAll filters by order_id via invoice line items', async () => {
    mockItemRepo.find.mockResolvedValueOnce([{ invoice_id: 3 }, { invoice_id: 7 }, { invoice_id: 3 }]);
    await service.findAll(1, 20, undefined, 10);
    expect(mockItemRepo.find.mock.calls[0][0]).toMatchObject({ where: { order_id: 10 } });
    const arg = mockRepo.findAndCount.mock.calls.at(-1)[0];
    expect((arg.where.id as any).value).toEqual([3, 7]); // In([...]) 去重
  });

  // UT-INV-02: 该订单没有任何发票 → 直接空页，不落 In([]) 全表扫
  it('UT-INV-02 findAll returns an empty page when the order has no invoice', async () => {
    mockItemRepo.find.mockResolvedValueOnce([]);
    const res = await service.findAll(1, 20, undefined, 999);
    expect(res).toMatchObject({ items: [], total: 0 });
    expect(mockRepo.findAndCount).not.toHaveBeenCalled();
  });

  // UT-INV-03: 不传 order_id → 不加发票 id 过滤（保持既有列表行为）
  it('UT-INV-03 findAll applies no id filter when order_id is absent', async () => {
    await service.findAll(1, 20);
    const arg = mockRepo.findAndCount.mock.calls.at(-1)[0];
    expect(arg.where.id).toBeUndefined();
    expect(mockItemRepo.find).not.toHaveBeenCalled();
  });
});
