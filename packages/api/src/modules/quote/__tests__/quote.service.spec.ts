/**
 * 报价机密行级安全回归（BUG排查报告-2026-07-19）
 * H4: 列表查询参数 customer_id 与机密可见集求交集，不可见 → 强制空结果，绝不覆盖 secretCond
 * H6: 写操作统一可见性断言，越权与「不存在」同响应 404（防探测）
 */
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, And } from 'typeorm';
import { QuoteService } from '../quote.service';
import { Quotation } from '../quotation.entity';
import { QuotationItem } from '../quotation-item.entity';
import { QuotationFee } from '../quotation-fee.entity';
import { Customer } from '../../customer/customer.entity';
import { SampleGarment } from '../../sample/sample-garment.entity';
import { SampleMaterial } from '../../sample/sample-material.entity';
import { OrderMain } from '../../order/order-main.entity';
import { CustomerService } from '../../customer/customer.service';
import { ChangeLogService } from '../../../common/changelog/change-log.service';
import { OrderService } from '../../order/order.service';
import { NumberingService } from '../../../common/services/numbering.service';
import { SysConfigService } from '../../../common/config/sys-config.service';
import { toLocalDateStr } from '../../../common/utils/local-date';
import { QuoteStatus } from '@i9/types';

const mockQuoteRepo = {
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
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
// 事务 manager：状态流转/明细读写现在都走它(B065/B084)；find 按实体分发，findOne 是加锁重查
const mockTxManager = {
  update: jest.fn(),
  save: jest.fn((_: any, v: any) => Promise.resolve(v)),
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn((_: any, v: any) => v),
  delete: jest.fn(),
};
const txFind = (map: Map<any, any[]>) => mockTxManager.find.mockImplementation((e: any) => Promise.resolve(map.get(e) ?? []));
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
    mockTxManager.find.mockReset().mockResolvedValue([]);
    mockTxManager.findOne.mockReset();
    mockTxManager.save.mockReset().mockImplementation((_: any, v: any) => Promise.resolve(v));
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
    // revert 现在在事务里锁行重查(B065)：预读 mockQuoteRepo.findOne 只管 404/可见性，状态以加锁读到的 mockTxManager.findOne 为准
    const arm = (quote: any) => { mockQuoteRepo.findOne.mockResolvedValue(quote); mockTxManager.findOne.mockResolvedValue(quote); };

    it('UT-QUO-RV-01: 已报价 → 客户调整，并清审批状态（重新发出须重走阈值审批）', async () => {
      const quote = { id: 11, customer_id: 1, buyer_id: null, status: QuoteStatus.QUOTED, deleted: 0, approval_status: 'APPROVED' };
      arm(quote);
      await service.revert(11, BIZ_USER);
      // 断言实体被就地改写（save mock 无返回值实现）
      expect(quote.status).toBe(QuoteStatus.ADJUSTING);
      expect(quote.approval_status).toBe('NONE');
      expect(mockTxManager.save).toHaveBeenCalledWith(Quotation, quote);
    });

    it('UT-QUO-RV-02: 已成单 + 关联订单全为草稿 → 草稿单随报价一并软删，报价回客户调整', async () => {
      const quote = { id: 12, customer_id: 1, buyer_id: null, status: QuoteStatus.ORDERED, deleted: 0, approval_status: 'NONE' };
      arm(quote);
      txFind(new Map([[OrderMain, [
        { id: 21, order_no: 'O-1', status: 'DRAFT' },
        { id: 22, order_no: 'O-2', status: 'DRAFT' },
      ]]]));
      const r = await service.revert(12, BIZ_USER);
      expect(mockTxManager.update).toHaveBeenCalledTimes(2);
      expect(mockTxManager.update).toHaveBeenCalledWith(expect.anything(), { id: 21 }, { deleted: 1 });
      expect(mockTxManager.update).toHaveBeenCalledWith(expect.anything(), { id: 22 }, { deleted: 1 });
      expect(r.status).toBe(QuoteStatus.ADJUSTING);
    });

    it('UT-QUO-RV-03: 已成单 + 存在非草稿订单 → 报出单号拦截，不动任何数据', async () => {
      const quote = { id: 13, customer_id: 1, buyer_id: null, status: QuoteStatus.ORDERED, deleted: 0 };
      arm(quote);
      txFind(new Map([[OrderMain, [{ id: 23, order_no: 'O-20260723-009', status: 'CONFIRMED' }]]]));
      await expect(service.revert(13, BIZ_USER)).rejects.toThrow('O-20260723-009');
      expect(mockTxManager.update).not.toHaveBeenCalled();
      expect(mockTxManager.save).not.toHaveBeenCalled();
    });

    it('UT-QUO-RV-04: 草稿状态不可撤回（只能已报价/已成单）', async () => {
      arm({ id: 14, customer_id: 1, buyer_id: null, status: QuoteStatus.DRAFT, deleted: 0 });
      await expect(service.revert(14, BIZ_USER)).rejects.toThrow('只有已报价/已成单状态可撤回调整');
    });

    it('B065 revert/adjust 在事务内加 pessimistic_write 锁重查，状态以锁到的行为准', async () => {
      // 预读还是「已报价」，但锁到的行已被另一人改成「客户调整」→ 必须按锁到的判断，拒绝而不是再写一遍
      mockQuoteRepo.findOne.mockResolvedValue({ id: 15, customer_id: 1, buyer_id: null, status: QuoteStatus.QUOTED, deleted: 0 });
      mockTxManager.findOne.mockResolvedValue({ id: 15, customer_id: 1, buyer_id: null, status: QuoteStatus.ADJUSTING, deleted: 0 });
      await expect(service.adjust(15, BIZ_USER)).rejects.toThrow('只有已报价状态可转客户调整');
      expect(mockTxManager.findOne).toHaveBeenCalledWith(Quotation, expect.objectContaining({
        where: { id: 15, deleted: 0 }, lock: { mode: 'pessimistic_write' },
      }));
      expect(mockTxManager.save).not.toHaveBeenCalled();
      expect(mockQuoteRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('转销售合同 toContract 并发守卫（B017/B133）', () => {
    const order = { id: 501, order_no: 'O-20260920-001' };
    const quoted = () => ({ id: 30, customer_id: 1, buyer_id: null, sample_id: 9, status: QuoteStatus.QUOTED, deleted: 0, quote_no: 'Q-1' });

    beforeEach(() => { mockOrderService.create.mockResolvedValue(order); mockOrderService.importFromQuote.mockResolvedValue(undefined); });

    it('B017 正常路径：锁行重查仍是已报价 → 翻已成单、联动样衣、返回订单号', async () => {
      const q = quoted();
      mockQuoteRepo.findOne.mockResolvedValue(q);
      mockTxManager.findOne.mockResolvedValue(q);
      const r: any = await service.toContract(30, 7, BIZ_USER);
      expect(mockTxManager.findOne).toHaveBeenCalledWith(Quotation, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
      expect(mockTxManager.save).toHaveBeenCalledWith(Quotation, expect.objectContaining({ status: QuoteStatus.ORDERED }));
      expect(mockTxManager.update).toHaveBeenCalledWith(SampleGarment, { id: 9, deleted: 0 }, { status: 'ORDERED' });
      expect(r.order_id).toBe(501);
      expect(mockOrderService.remove).not.toHaveBeenCalled();
    });

    it('B017 并发后到者：事务外检查已过、锁到的行已是已成单 → 报错并删掉自己刚建的草稿订单，不再翻状态', async () => {
      mockQuoteRepo.findOne.mockResolvedValue(quoted());
      mockTxManager.findOne.mockResolvedValue({ ...quoted(), status: QuoteStatus.ORDERED }); // 另一请求先提交了
      await expect(service.toContract(30, 7, BIZ_USER)).rejects.toThrow('已被转为销售合同');
      expect(mockTxManager.save).not.toHaveBeenCalled();
      expect(mockOrderService.remove).toHaveBeenCalledWith(501);
    });

    it('B133 补偿删除失败不再被吞：留 error 日志，原错误照抛', async () => {
      mockQuoteRepo.findOne.mockResolvedValue(quoted());
      mockOrderService.importFromQuote.mockRejectedValueOnce(new Error('导入明细失败'));
      mockOrderService.remove.mockRejectedValueOnce(new Error('订单已被锁定'));
      const errSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
      await expect(service.toContract(30, 7, BIZ_USER)).rejects.toThrow('导入明细失败');
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('O-20260920-001'));
      expect(errSpy.mock.calls[0][0]).toContain('订单已被锁定');
    });
  });

  // 中间商可空（2026-08-04 反馈，与客户资料 #05 同源；7-27「中间商全链可空」漏了报价这一环）
  describe('中间商可空：直接客户也能报价', () => {
    it('UT-QUO-MM-01: 只给最终买家、不给中间商 → 落库挂到买家，且不把买家名写进中间商列', async () => {
      mockCustomerService.visibleCustomerIds.mockResolvedValue(null); // 内部调用无 user → 真实现返回 null(不限)
      mockCustomerRepo.findOne.mockResolvedValue({ id: 5, name: '直接客户A', customer_no: 'CN005' });
      const manager: any = {
        create: jest.fn((_: any, v: any) => v),
        save: jest.fn((_: any, v: any) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
        update: jest.fn(),
      };
      mockDataSource.transaction.mockImplementationOnce((cb: any) => cb(manager));
      await service.create({ buyerId: 5, items: [] } as any, 1);
      const saved = manager.save.mock.calls[0][1];
      expect(saved.customer_id).toBe(5);          // NOT NULL 列有值，不会插入失败
      expect(saved.buyer_id).toBe(5);
      expect(saved.middleman_name).toBeUndefined(); // 没有中间商就别显示成有
    });

    it('UT-QUO-MM-02: 中间商与最终买家都不给 → 明确 400，而不是撞 NOT NULL 的 500', async () => {
      await expect(service.create({ items: [] } as any, 1)).rejects.toThrow('中间商与最终买家至少填一个');
    });
  });

  // B062：建/改报价引用的客户必须对当前用户可见；不可见与「不存在」同一响应，否则循环 POST 就能枚举机密客户 id
  describe('B062 建/改报价校验客户可见性（与「不存在」同响应，防枚举）', () => {
    const exists = { id: 99, name: '机密客户', customer_no: 'CN099' };

    it('B062 create：中间商存在但不在可见集 → 与不存在同一句「客户 #99 不存在」', async () => {
      mockCustomerRepo.findOne.mockResolvedValue(exists);
      await expect(service.create({ middlemanId: 99, items: [] } as any, 7, BIZ_USER)).rejects.toThrow('客户 #99 不存在');
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('B062 create：最终买家不可见 → 「最终买家客户 #88 不存在」；不存在的买家也不再静默落悬空 id', async () => {
      mockCustomerRepo.findOne.mockImplementation(({ where }: any) => Promise.resolve(
        where.id === 1 ? { id: 1, name: '中间商', customer_no: 'CN001' } : where.id === 88 ? { id: 88, name: '机密买家' } : null,
      ));
      await expect(service.create({ middlemanId: 1, buyerId: 88, items: [] } as any, 7, BIZ_USER)).rejects.toThrow('最终买家客户 #88 不存在');
      await expect(service.create({ middlemanId: 1, buyerId: 77, items: [] } as any, 7, BIZ_USER)).rejects.toThrow('最终买家客户 #77 不存在');
      mockCustomerRepo.findOne.mockReset();
    });

    it('B062 update：改成不可见的中间商/买家 → 同样按「不存在」拒绝，不写库', async () => {
      const quote = () => ({ id: 40, customer_id: 1, buyer_id: null, status: QuoteStatus.DRAFT, deleted: 0 });
      mockCustomerRepo.findOne.mockResolvedValue(exists);
      mockQuoteRepo.findOne.mockResolvedValue(quote());
      await expect(service.update(40, { middlemanId: 99 } as any, BIZ_USER)).rejects.toThrow('中间商客户 #99 不存在');
      mockQuoteRepo.findOne.mockResolvedValue(quote());
      await expect(service.update(40, { buyerId: 99 } as any, BIZ_USER)).rejects.toThrow('最终买家客户 #99 不存在');
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('B062 可见客户照常放行（回归防误伤）', async () => {
      mockCustomerRepo.findOne.mockResolvedValue({ id: 2, name: '可见客户', customer_no: 'CN002' });
      const quote = { id: 41, customer_id: 1, buyer_id: null, status: QuoteStatus.DRAFT, deleted: 0 };
      mockQuoteRepo.findOne.mockResolvedValue(quote);
      await service.update(41, { middlemanId: 2 } as any, BIZ_USER);
      expect(quote.customer_id).toBe(2);
    });
  });

  // B063：关键词 OR 分支不能顶掉同名的高级筛选
  describe('B063 关键词搜索与同名高级筛选并存', () => {
    it('款号=A + 搜索框 B：款号分支要同时满足两者，其它分支仍 AND 上款号=A', async () => {
      mockCustomerService.visibleCustomerIds.mockResolvedValue(null);
      mockQuoteRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, size: 20, style_no: 'A', keyword: 'B' } as any, { id: 1, role: 'ADMIN' });
      const where: any[] = mockQuoteRepo.findAndCount.mock.calls[0][0].where;
      expect(Array.isArray(where)).toBe(true);
      const styleBranch = where.find((w) => w.style_no?.type === 'and');
      expect(styleBranch.style_no).toEqual(And(Like('%A%'), Like('%B%')));
      for (const w of where.filter((x) => x !== styleBranch)) expect(w.style_no).toEqual(Like('%A%'));
    });
  });

  // B064：只改汇率、不重发明细时，旧明细/费用的美金单价要按新汇率重算，否则 PDF 上明细美金之和 ≠ 美金合计
  describe('B064 只改汇率也重算明细美金单价', () => {
    const arm = (rate: number) => {
      const quote = { id: 50, customer_id: 1, buyer_id: null, status: QuoteStatus.DRAFT, deleted: 0, exchange_rate: rate, profit_rate: 0 };
      mockQuoteRepo.findOne.mockResolvedValue(quote);
      txFind(new Map<any, any[]>([
        [QuotationItem, [{ id: 1, rmb_price: 71, loss_amount: 71, usd_price: 10.9231 }]],
        [QuotationFee, [{ id: 9, rmb_price: 14.2, quote_usage: 1, usd_price: 2.1846 }]],
      ]));
      return quote;
    };

    it('汇率 6.5→7.1 且 items/fees 未传：逐行 update usd_price', async () => {
      arm(6.5);
      await service.update(50, { exchangeRate: 7.1 } as any, BIZ_USER);
      expect(mockTxManager.update).toHaveBeenCalledWith(QuotationItem, 1, { usd_price: 10 });
      expect(mockTxManager.update).toHaveBeenCalledWith(QuotationFee, 9, { usd_price: 2 });
      expect(mockTxManager.delete).not.toHaveBeenCalled(); // 没重发明细就不删表重插
    });

    it('汇率没变（或没传）就不碰明细', async () => {
      arm(7.1);
      await service.update(50, { exchangeRate: 7.1, styleNo: 'X' } as any, BIZ_USER);
      const touched = mockTxManager.update.mock.calls.filter((c) => c[0] === QuotationItem || c[0] === QuotationFee);
      expect(touched).toHaveLength(0);
    });

    it('B084 同类：事务内读明细走 manager，不再从连接池另借连接', async () => {
      arm(6.5);
      await service.update(50, { styleNo: 'Y' } as any, BIZ_USER);
      expect(mockTxManager.find).toHaveBeenCalledWith(QuotationItem, expect.objectContaining({ where: { quote_id: 50 } }));
      expect(mockItemRepo.find).not.toHaveBeenCalled();
      expect(mockFeeRepo.find).not.toHaveBeenCalled();
    });
  });

  // B016：样衣同步报价时同名多行按出现顺序一一配对（与 findOne 的 #144 修法同一范式）
  describe('B016 syncFromSample 同名多行按顺序配对，不再只认最后一条', () => {
    const quote = () => ({ id: 261, sample_id: 109, status: QuoteStatus.DRAFT, exchange_rate: 7, profit_rate: 0, deleted: 0 });
    const oldItems = [
      { id: 1, sort_order: 0, item_name: '葫芦头拉链', rmb_price: 10, loss_rate: 3, unit: '条', remark: '谈好 10' },
      { id: 2, sort_order: 1, item_name: '葫芦头拉链', rmb_price: 20, loss_rate: 5, unit: '条', remark: '谈好 20' },
      { id: 3, sort_order: 2, item_name: '主标', rmb_price: 1, loss_rate: 3, unit: '个', remark: null },
    ];
    const mats = [
      { item_name: '葫芦头拉链', qty: 2, actual_usage: 2.5 }, { item_name: '葫芦头拉链', qty: 1, actual_usage: null },
      { item_name: '葫芦头拉链', qty: 9, actual_usage: null }, { item_name: '主标', qty: 1, actual_usage: null },
    ];
    const savedItems = () => mockTxManager.save.mock.calls.find((c) => c[0] === QuotationItem)![1];

    it('第一行拿第一行的议价、第二行拿第二行的，多出来的同名行按新行处理', async () => {
      mockQuoteRepo.find.mockResolvedValue([quote()]);
      mockSampleMaterialRepo.find.mockResolvedValue(mats);
      txFind(new Map<any, any[]>([[QuotationItem, oldItems], [QuotationFee, []]]));
      expect(await service.syncFromSample(109)).toBe(1);
      expect(savedItems().map((i: any) => [i.item_name, i.quote_usage, i.rmb_price, i.loss_rate, i.remark])).toEqual([
        ['葫芦头拉链', 2.5, 10, 3, '谈好 10'],
        ['葫芦头拉链', 1, 20, 5, '谈好 20'],
        ['葫芦头拉链', 9, undefined, 3, undefined],
        ['主标', 1, 1, 3, null],
      ]);
      // 配对依赖两边都按 sort_order,id 取行
      expect(mockTxManager.find).toHaveBeenCalledWith(QuotationItem, expect.objectContaining({ order: { sort_order: 'ASC', id: 'ASC' } }));
      expect(mockSampleMaterialRepo.find).toHaveBeenCalledWith(expect.objectContaining({ order: { sort_order: 'ASC', id: 'ASC' } }));
    });

    it('B075 传入 manager 时在调用方事务里跑：读写都走该 manager，不另开事务', async () => {
      const mgr: any = {
        find: jest.fn((e: any) => Promise.resolve(e === Quotation ? [quote()] : e === SampleMaterial ? mats : e === QuotationItem ? oldItems : [])),
        save: jest.fn((_: any, v: any) => Promise.resolve(v)), delete: jest.fn(), update: jest.fn(),
      };
      expect(await service.syncFromSample(109, mgr)).toBe(1);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockQuoteRepo.find).not.toHaveBeenCalled();
      expect(mockSampleMaterialRepo.find).not.toHaveBeenCalled();
      expect(mgr.find).toHaveBeenCalledWith(Quotation, expect.objectContaining({ where: { sample_id: 109, deleted: 0 } }));
      expect(mgr.save).toHaveBeenCalledWith(QuotationItem, expect.any(Array));
    });
  });

  describe('B061 / B066 / B067 杂项', () => {
    it('B061 询价日期取本地日历日，不是 UTC 日期', async () => {
      mockCustomerService.visibleCustomerIds.mockResolvedValue(null);
      mockCustomerRepo.findOne.mockResolvedValue({ id: 1, name: '中间商', customer_no: 'CN001' });
      // 北京时间 09-21 01:30 = UTC 09-20 17:30：UTC 日期与本地日期分叉的时段
      jest.useFakeTimers({ now: new Date('2026-09-20T17:30:00Z'), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'] });
      try {
        const expected = toLocalDateStr(new Date());
        await service.create({ middlemanId: 1, items: [] } as any, 1);
        const saved = mockTxManager.save.mock.calls.find((c) => c[0] === Quotation)![1];
        expect(saved.inquiry_date).toBe(expected);
      } finally { jest.useRealTimers(); }
    });

    it('B066 历史导入：汇率为空落默认 1（列 NOT NULL），不是把 NULL 写进去；非法汇率明说原因', async () => {
      mockDataSource.query.mockResolvedValue([{ id: 3, name: '客户甲' }]);
      mockQuoteRepo.save.mockResolvedValue({});
      const r = await service.importBatch([
        { customer_name: '客户甲', exchange_rate: '' },
        { customer_name: '客户甲' },
        { customer_name: '客户甲', exchange_rate: 'abc' },
      ], 1);
      expect(r.ok).toBe(2);
      expect(mockQuoteRepo.save.mock.calls.map((c) => c[0].exchange_rate)).toEqual([1, 1]);
      expect(r.failures[0].reason).toContain('汇率');
      expect(r.failures[0].reason).not.toBe('未知错误');
    });

    it('B067 复制报价带上拉链三件套', async () => {
      mockCustomerService.visibleCustomerIds.mockResolvedValue(null);
      mockQuoteRepo.findOne.mockResolvedValue({ id: 60, customer_id: 1, exchange_rate: 7, profit_rate: 0, status: QuoteStatus.QUOTED, deleted: 0 });
      mockItemRepo.find.mockResolvedValue([{ item_name: '拉链', puller: '金属拉头', zipper_teeth: '配色', code_band: '黑', rmb_price: 1 }]);
      mockFeeRepo.find.mockResolvedValue([]);
      await service.copy(60, 1, true, { id: 1, role: 'ADMIN' });
      const items = mockTxManager.save.mock.calls.find((c) => c[0] === QuotationItem)![1];
      expect(items[0]).toMatchObject({ puller: '金属拉头', zipper_teeth: '配色', code_band: '黑' });
    });
  });

  describe('「已偏离样衣」标记（#144 EVA：从样衣直接生成的报价也报偏离）', () => {
    // 生产实况：样衣 109 里「5号尼龙反装闭口cm葫芦头」有两行（2 条 / 1 条），报价照搬也是两行。
    // 旧实现 name→单条 Map 只留最后一条，第一行 2 被拿去和 1 比，于是数量一致却标偏离。
    const mkQuote = () => ({ id: 261, customer_id: 1, buyer_id: null, sample_id: 109, status: QuoteStatus.DRAFT });
    const findOne = async () => {
      mockQuoteRepo.findOne.mockResolvedValue(mkQuote());
      mockCustomerService.visibleCustomerIds.mockResolvedValue(null);
      return (await service.findOne(261, { id: 1, role: 'ADMIN' })) as any;
    };
    const flags = (r: any) => r.items.map((i: any) => [i.item_name, i.quote_usage, !!i.deviated_from_sample]);

    it('同名多行按顺序配对：数量一一对上就不标偏离', async () => {
      mockItemRepo.find.mockResolvedValue([
        { item_name: '葫芦头拉链', quote_usage: 2 }, { item_name: '葫芦头拉链', quote_usage: 1 }, { item_name: '主标', quote_usage: 1 },
      ]);
      mockSampleMaterialRepo.find.mockResolvedValue([
        { item_name: '葫芦头拉链', qty: 2, actual_usage: null }, { item_name: '葫芦头拉链', qty: 1, actual_usage: null }, { item_name: '主标', qty: 1, actual_usage: null },
      ]);
      expect(flags(await findOne())).toEqual([['葫芦头拉链', 2, false], ['葫芦头拉链', 1, false], ['主标', 1, false]]);
    });

    it('真的对不上才标：第二行改了量就只标第二行', async () => {
      mockItemRepo.find.mockResolvedValue([
        { item_name: '葫芦头拉链', quote_usage: 2 }, { item_name: '葫芦头拉链', quote_usage: 5 },
      ]);
      mockSampleMaterialRepo.find.mockResolvedValue([
        { item_name: '葫芦头拉链', qty: 2, actual_usage: null }, { item_name: '葫芦头拉链', qty: 1, actual_usage: null },
      ]);
      expect(flags(await findOne())).toEqual([['葫芦头拉链', 2, false], ['葫芦头拉链', 5, true]]);
    });

    it('报价里多出来的同名行：样衣侧没有对应行就不猜、不标', async () => {
      mockItemRepo.find.mockResolvedValue([
        { item_name: '葫芦头拉链', quote_usage: 2 }, { item_name: '葫芦头拉链', quote_usage: 1 }, { item_name: '葫芦头拉链', quote_usage: 9 },
      ]);
      mockSampleMaterialRepo.find.mockResolvedValue([
        { item_name: '葫芦头拉链', qty: 2, actual_usage: null }, { item_name: '葫芦头拉链', qty: 1, actual_usage: null },
      ]);
      const r = await findOne();
      expect(flags(r)).toEqual([['葫芦头拉链', 2, false], ['葫芦头拉链', 1, false], ['葫芦头拉链', 9, false]]);
      expect(r.items[2].sample_usage).toBeUndefined(); // 没配到行的，连参考值都不给
    });

    it('样衣实测值优先于预估量，且按样衣的排序取行', async () => {
      mockItemRepo.find.mockResolvedValue([{ item_name: '面料', quote_usage: 1.5 }]);
      mockSampleMaterialRepo.find.mockResolvedValue([{ item_name: '面料', qty: 1.2, actual_usage: 1.5 }]);
      const r = await findOne();
      expect(r.items[0].deviated_from_sample).toBe(false);
      expect(r.items[0].usage_is_estimate).toBe(false);
      expect(mockSampleMaterialRepo.find).toHaveBeenCalledWith(expect.objectContaining({ order: { sort_order: 'ASC', id: 'ASC' } }));
    });
  });
});
