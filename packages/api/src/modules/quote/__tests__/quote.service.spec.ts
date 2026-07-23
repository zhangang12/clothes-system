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
const mockOrderRepo = { find: jest.fn().mockResolvedValue([]) };
const mockTxManager = { update: jest.fn(), save: jest.fn((_: any, v: any) => Promise.resolve(v)) };
const mockDataSource = {
  transaction: jest.fn((cb: any) => cb(mockTxManager)),
  query: jest.fn(),
  getRepository: jest.fn().mockReturnValue(mockOrderRepo),
};

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

  describe('客户变更快照联动刷新（用户反馈：改最终客户列表不更新）', () => {
    it('UT-QUO-UP-01: update 改 buyerId → buyer_name/buyer_no 快照同步刷新', async () => {
      const quote = { id: 8, customer_id: 1, buyer_id: 2, buyer_name: '旧买家', buyer_no: 'OLD', status: QuoteStatus.DRAFT, deleted: 0 };
      mockQuoteRepo.findOne.mockResolvedValue(quote);
      mockCustomerRepo.findOne.mockResolvedValue({ id: 3, name: '新买家', customer_no: 'NEW001' });
      mockTxManager.save.mockImplementation((_: any, v: any) => Promise.resolve(v));
      await service.update(8, { buyerId: 3 } as any, BIZ_USER);
      expect(quote.buyer_id).toBe(3);
      expect(quote.buyer_name).toBe('新买家');
      expect(quote.buyer_no).toBe('NEW001');
    });

    it('UT-QUO-UP-02: update 改 middlemanId → customer_id/middleman_name 同步刷新', async () => {
      const quote = { id: 9, customer_id: 1, middleman_name: '旧中间商', buyer_id: null, status: QuoteStatus.DRAFT, deleted: 0 };
      mockQuoteRepo.findOne.mockResolvedValue(quote);
      mockCustomerRepo.findOne.mockResolvedValue({ id: 2, name: '新中间商' });
      await service.update(9, { middlemanId: 2 } as any, BIZ_USER);
      expect(quote.customer_id).toBe(2);
      expect(quote.middleman_name).toBe('新中间商');
    });

    it('UT-QUO-UP-03: update 清空 buyerId → 快照一并清空', async () => {
      const quote = { id: 10, customer_id: 1, buyer_id: 2, buyer_name: '买家', buyer_no: 'B1', status: QuoteStatus.DRAFT, deleted: 0 };
      mockQuoteRepo.findOne.mockResolvedValue(quote);
      await service.update(10, { buyerId: null } as any, BIZ_USER);
      expect(quote.buyer_id).toBeNull();
      expect(quote.buyer_name).toBeNull();
      expect(quote.buyer_no).toBeNull();
    });
  });

  describe('撤回调整 revert（用户反馈：报价需要撤回调整）', () => {
    it('UT-QUO-RV-01: 已报价 → 客户调整，并清审批状态（重新发出须重走阈值审批）', async () => {
      const quote = { id: 11, customer_id: 1, buyer_id: null, status: QuoteStatus.QUOTED, deleted: 0, approval_status: 'APPROVED' };
      mockQuoteRepo.findOne.mockResolvedValue(quote);
      await service.revert(11, BIZ_USER);
      // 断言实体被就地改写（save mock 无返回值实现）
      expect(quote.status).toBe(QuoteStatus.ADJUSTING);
      expect(quote.approval_status).toBe('NONE');
      expect(mockQuoteRepo.save).toHaveBeenCalledWith(quote);
    });

    it('UT-QUO-RV-02: 已成单 + 关联订单全为草稿 → 草稿单随报价一并软删，报价回客户调整', async () => {
      const quote = { id: 12, customer_id: 1, buyer_id: null, status: QuoteStatus.ORDERED, deleted: 0, approval_status: 'NONE' };
      mockQuoteRepo.findOne.mockResolvedValue(quote);
      mockOrderRepo.find.mockResolvedValue([
        { id: 21, order_no: 'O-1', status: 'DRAFT' },
        { id: 22, order_no: 'O-2', status: 'DRAFT' },
      ]);
      const r = await service.revert(12, BIZ_USER);
      expect(mockTxManager.update).toHaveBeenCalledTimes(2);
      expect(mockTxManager.update).toHaveBeenCalledWith(expect.anything(), { id: 21 }, { deleted: 1 });
      expect(mockTxManager.update).toHaveBeenCalledWith(expect.anything(), { id: 22 }, { deleted: 1 });
      expect(r.status).toBe(QuoteStatus.ADJUSTING);
    });

    it('UT-QUO-RV-03: 已成单 + 存在非草稿订单 → 报出单号拦截，不动任何数据', async () => {
      const quote = { id: 13, customer_id: 1, buyer_id: null, status: QuoteStatus.ORDERED, deleted: 0 };
      mockQuoteRepo.findOne.mockResolvedValue(quote);
      mockOrderRepo.find.mockResolvedValue([{ id: 23, order_no: 'O-20260723-009', status: 'CONFIRMED' }]);
      await expect(service.revert(13, BIZ_USER)).rejects.toThrow('O-20260723-009');
      expect(mockTxManager.update).not.toHaveBeenCalled();
      expect(mockTxManager.save).not.toHaveBeenCalled();
    });

    it('UT-QUO-RV-04: 草稿状态不可撤回（只能已报价/已成单）', async () => {
      mockQuoteRepo.findOne.mockResolvedValue({ id: 14, customer_id: 1, buyer_id: null, status: QuoteStatus.DRAFT, deleted: 0 });
      await expect(service.revert(14, BIZ_USER)).rejects.toThrow('只有已报价/已成单状态可撤回调整');
    });
  });
});
