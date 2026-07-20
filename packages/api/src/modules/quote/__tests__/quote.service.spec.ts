/**
 * 报价机密行级安全回归（BUG排查报告-2026-07-19）
 * H4: 列表查询参数 customer_id 与机密可见集求交集，不可见 → 强制空结果，绝不覆盖 secretCond
 * H6: 写操作统一可见性断言，越权与「不存在」同响应 404（防探测）
 */
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { QuoteService } from '../quote.service';
import { Quotation } from '../quotation.entity';
import { QuotationItem } from '../quotation-item.entity';
import { QuotationFee } from '../quotation-fee.entity';
import { Customer } from '../../customer/customer.entity';
import { SampleGarment } from '../../sample/sample-garment.entity';
import { SampleMaterial } from '../../sample/sample-material.entity';
import { CustomerService } from '../../customer/customer.service';
import { ChangeLogService } from '../../../common/changelog/change-log.service';
import { OrderService } from '../../order/order.service';
import { NumberingService } from '../../../common/services/numbering.service';
import { SysConfigService } from '../../../common/config/sys-config.service';
import { QuoteStatus } from '@i9/types';

const mockQuoteRepo = {
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  save: jest.fn(),
  create: jest.fn().mockImplementation((v) => v),
};
const subRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  update: jest.fn(),
  create: jest.fn().mockImplementation((v) => v),
});
const mockItemRepo = subRepo();
const mockFeeRepo = subRepo();
const mockCustomerRepo = subRepo();
const mockSampleRepo = subRepo();
const mockSampleMaterialRepo = subRepo();
const mockCustomerService = { visibleCustomerIds: jest.fn() };
const mockChangeLog = { record: jest.fn().mockResolvedValue(undefined) };
const mockOrderService = {
  listByQuote: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  importFromQuote: jest.fn(),
  remove: jest.fn().mockResolvedValue(undefined),
};
const mockNumbering = { next: jest.fn() };
const mockConfig = { getNumber: jest.fn().mockResolvedValue(0) };
const mockDataSource = { transaction: jest.fn((cb: any) => cb({})), query: jest.fn() };

// 非授权业务员：机密可见集仅客户 1/2/3
const BIZ_USER = { id: 7, role: 'BUSINESS' };

describe('报价机密行级安全 (H4/H6)', () => {
  let service: QuoteService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCustomerService.visibleCustomerIds.mockResolvedValue([1, 2, 3]);
    const module = await Test.createTestingModule({
      providers: [
        QuoteService,
        { provide: getRepositoryToken(Quotation), useValue: mockQuoteRepo },
        { provide: getRepositoryToken(QuotationItem), useValue: mockItemRepo },
        { provide: getRepositoryToken(QuotationFee), useValue: mockFeeRepo },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        { provide: getRepositoryToken(SampleGarment), useValue: mockSampleRepo },
        { provide: getRepositoryToken(SampleMaterial), useValue: mockSampleMaterialRepo },
        { provide: CustomerService, useValue: mockCustomerService },
        { provide: ChangeLogService, useValue: mockChangeLog },
        { provide: OrderService, useValue: mockOrderService },
        { provide: NumberingService, useValue: mockNumbering },
        { provide: SysConfigService, useValue: mockConfig },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();
    service = module.get(QuoteService);
  });

  describe('findAll() H4: customer_id 与机密可见集求交集', () => {
    it('UT-QUO-H4-01: 查询不可见客户 → 强制空结果(In([0]))，不覆盖 secretCond', async () => {
      mockQuoteRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, size: 20, customer_id: 99 } as any, BIZ_USER);
      const where: any = mockQuoteRepo.findAndCount.mock.calls[0][0].where;
      expect(where.customer_id).toEqual(In([0]));
    });

    it('UT-QUO-H4-02: 查询可见客户 → customer_id 原值生效（可见集子集）', async () => {
      mockQuoteRepo.findAndCount.mockResolvedValue([[{ id: 1 }], 1]);
      await service.findAll({ page: 1, size: 20, customer_id: 2 } as any, BIZ_USER);
      const where: any = mockQuoteRepo.findAndCount.mock.calls[0][0].where;
      expect(where.customer_id).toBe(2);
    });

    it('UT-QUO-H4-03: 管理员（可见集=null）不受限 → customer_id 原值生效', async () => {
      mockCustomerService.visibleCustomerIds.mockResolvedValue(null);
      mockQuoteRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, size: 20, customer_id: 99 } as any, { id: 1, role: 'ADMIN' });
      const where: any = mockQuoteRepo.findAndCount.mock.calls[0][0].where;
      expect(where.customer_id).toBe(99);
    });
  });

  describe('写操作 H6: 越权与「不存在」同响应 404', () => {
    it('UT-QUO-H6-01: update 命中不可见客户报价 → NotFoundException（防探测）', async () => {
      mockQuoteRepo.findOne.mockResolvedValue({ id: 5, customer_id: 99, buyer_id: null, status: QuoteStatus.DRAFT });
      await expect(service.update(5, { styleNo: 'X' } as any, BIZ_USER)).rejects.toThrow(NotFoundException);
    });

    it('UT-QUO-H6-02: remove 经 buyer_id 维度命中不可见 → NotFoundException', async () => {
      mockQuoteRepo.findOne.mockResolvedValue({ id: 6, customer_id: 1, buyer_id: 88, status: QuoteStatus.DRAFT });
      await expect(service.remove(6, BIZ_USER)).rejects.toThrow(NotFoundException);
    });

    it('UT-QUO-H6-03: 可见客户报价 → remove 正常放行（回归防误伤）', async () => {
      const quote = { id: 7, customer_id: 2, buyer_id: null, status: QuoteStatus.DRAFT, deleted: 0 };
      mockQuoteRepo.findOne.mockResolvedValue(quote);
      await service.remove(7, BIZ_USER);
      expect(mockQuoteRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: 1 }));
    });
  });
});
