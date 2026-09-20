// DTO 装饰器靠 reflect-metadata，单测配置没全局引入，这里显式补一句
import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateExportInvoiceDto } from '../dto/create-export-invoice.dto';
import { AddReceiptDto } from '../dto/add-receipt.dto';
import { ExportInvoiceService } from '../export-invoice.service';
import { ExportInvoice } from '../export-invoice.entity';
import { ExportInvoiceItem } from '../export-invoice-item.entity';
import { InvoiceReceipt } from '../invoice-receipt.entity';

const mockRepo = {
  findOne: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
  count: jest.fn().mockResolvedValue(0),
};
const mockItemRepo = {
  find: jest.fn().mockResolvedValue([]),
};
const mockReceiptRepo = {
  find: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
};
// 事务 manager：按实体分派，收汇/发票的读写都走它（B048/B049 之后）
let mockManager: any;
const makeManager = () => ({
  create: jest.fn().mockImplementation((_, v) => v),
  save: jest.fn().mockImplementation((_, v) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: 1 })),
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn().mockResolvedValue([]),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  query: jest.fn().mockResolvedValue([]),
});
const mockDataSource = {
  query: jest.fn().mockResolvedValue([]),
  transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
};

// 与 main.ts 全局 ValidationPipe 同一口径
const check = (cls: any, body: any) =>
  validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true });
const props = (errs: any[]) => errs.map((e) => e.property);

describe('ExportInvoiceService', () => {
  let service: ExportInvoiceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.findAndCount.mockResolvedValue([[], 0]);
    mockRepo.find.mockResolvedValue([]);
    mockRepo.save.mockImplementation((v: any) => Promise.resolve(v));
    mockRepo.count.mockResolvedValue(0);
    mockItemRepo.find.mockResolvedValue([]);
    mockReceiptRepo.find.mockResolvedValue([]);
    mockReceiptRepo.count.mockResolvedValue(0);
    mockManager = makeManager();
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

  // ── 2026-09-20 审查回归（B047/B048/B049/B127/B006/B069/B125/B136）──
  describe('审查回归', () => {
    const okInvoice = {
      invoice_no: 'INV-001', invoice_date: '2026-09-20', currency: 'USD', customer_name: 'ACME', remark: '',
      items: [{ order_id: 10, style_no: 'K-100', amount: 1000 }],
    };

    it('B047 登记出口发票的 DTO 真校验：漏填发票号 / 超 50 字 → 门口 400，不再 NOT NULL 或 Data too long 500', async () => {
      expect(await check(CreateExportInvoiceDto, okInvoice)).toHaveLength(0);
      expect(props(await check(CreateExportInvoiceDto, { ...okInvoice, invoice_no: '' }))).toContain('invoice_no');
      expect(props(await check(CreateExportInvoiceDto, { ...okInvoice, invoice_no: 'X'.repeat(51) }))).toContain('invoice_no');
      expect(props(await check(CreateExportInvoiceDto, { invoice_no: 'INV-2' }))).toContain('items');
    });

    it('B047 前端实际发的字段原样放行：日期留空串、order_id 未选、款号空', async () => {
      // ExportInvoiceView 的 form 整体发出（invoice_date/customer_name/remark 默认空串，order_id 为 undefined）
      expect(await check(CreateExportInvoiceDto, {
        invoice_no: 'INV-3', invoice_date: '', customer_name: '', remark: '',
        items: [{ order_id: undefined, style_no: '', amount: 12.5 }],
      })).toHaveLength(0);
    });

    it('B127/B136 日期格式与金额下限在 DTO 拦下（Excel 粘贴/接口直调）', async () => {
      expect(props(await check(CreateExportInvoiceDto, { ...okInvoice, invoice_date: '2026/09/20' }))).toContain('invoice_date');
      expect(await check(AddReceiptDto, { amount: 100, receipt_date: '2026-09-20' })).toHaveLength(0);
      expect(props(await check(AddReceiptDto, { amount: 100, receipt_date: '20260920' }))).toContain('receipt_date');
      expect(props(await check(AddReceiptDto, { amount: 100 }))).toContain('receipt_date');
      expect(props(await check(AddReceiptDto, { amount: 0, receipt_date: '2026-09-20' }))).toContain('amount');
      expect(props(await check(AddReceiptDto, { amount: 100, receipt_date: '2026-09-20', exchange_rate: -100 }))).toContain('exchange_rate');
    });

    it('B127 格式对但日历上不存在的日期（2026-02-30）也拦下，不写 DATE 列 500', async () => {
      mockManager.findOne.mockResolvedValue({ id: 1, total_amount: 1000, deleted: 0 });
      await expect(service.addReceipt(1, { amount: 100, receipt_date: '2026-02-30' } as any))
        .rejects.toThrow('不是有效日期');
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.create({ ...okInvoice, invoice_date: '2026-02-30' } as any, 1))
        .rejects.toThrow('不是有效日期');
    });

    it('B048 累计收汇 ≤ 发票金额：同一笔水单登记两次被拦（与付款侧超付闸门同口径）', async () => {
      mockManager.findOne.mockResolvedValue({ id: 1, total_amount: 1000, deleted: 0 });
      mockManager.find.mockResolvedValue([{ id: 1, invoice_id: 1, amount: 1000 }]); // 已收满
      await expect(service.addReceipt(1, { amount: 1000, receipt_date: '2026-09-20' } as any))
        .rejects.toThrow('累计收汇');
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('B048 未超额照常登记，并锁发票行串行化并发', async () => {
      mockManager.findOne.mockResolvedValue({ id: 1, total_amount: 1000, deleted: 0 });
      mockManager.find.mockResolvedValue([{ id: 1, invoice_id: 1, amount: 400 }]);
      await service.addReceipt(1, { amount: 600, receipt_date: '2026-09-20' } as any);
      expect(mockManager.findOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
      expect(mockManager.save).toHaveBeenCalled();
    });

    it('B049 收汇增 / 删都给已拉取的已确认结算单打「待重算」软锁', async () => {
      mockManager.findOne.mockResolvedValue({ id: 1, total_amount: 1000, deleted: 0 });
      await service.addReceipt(1, { amount: 100, receipt_date: '2026-09-20' } as any);
      let sql = mockManager.query.mock.calls.at(-1);
      expect(sql[0]).toContain('needs_recalc = 1');
      expect(sql[1]).toEqual([1]);

      mockManager.findOne.mockResolvedValue({ id: 5, invoice_id: 1, amount: 100 });
      await service.removeReceipt(1, 5);
      sql = mockManager.query.mock.calls.at(-1);
      expect(sql[0]).toContain('needs_recalc = 1');
      expect(mockManager.delete).toHaveBeenCalled();
    });

    it('B049 删不存在的收汇记录仍然 404，且不打软锁', async () => {
      mockManager.findOne.mockResolvedValue(null);
      await expect(service.removeReceipt(1, 99)).rejects.toThrow(NotFoundException);
      expect(mockManager.query).not.toHaveBeenCalled();
    });

    it('B069 软删发票时让出发票号（原号#del<id>），同号可重新登记', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 3, invoice_no: 'INV-001', deleted: 0 });
      mockReceiptRepo.count.mockResolvedValue(0);
      await service.remove(3);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: 1, invoice_no: 'INV-001#del3' }));
    });

    it('B069 改写后的发票号不超列宽 50', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 987, invoice_no: 'X'.repeat(50), deleted: 0 });
      await service.remove(987);
      const saved = mockRepo.save.mock.calls.at(-1)[0];
      expect(saved.invoice_no.length).toBeLessThanOrEqual(50);
      expect(saved.invoice_no.endsWith('#del987')).toBe(true);
    });

    it('B069 并发同号撞唯一索引 → 中文提示，不再 500', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockManager.save.mockRejectedValueOnce(Object.assign(new Error('dup'), {
        code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry 'INV-001' for key 'export_invoice.uk_invoice_no'",
      }));
      await expect(service.create(okInvoice as any, 1)).rejects.toThrow('已存在');
    });

    it('B125 结算拉收汇份额不再逐行 N+1：一次 In() 取齐发票与收汇', async () => {
      mockItemRepo.find.mockResolvedValue([
        { invoice_id: 1, order_id: 10, amount: 500 },
        { invoice_id: 1, order_id: 10, amount: 500 },
        { invoice_id: 2, order_id: 10, amount: 1000 },
      ]);
      mockRepo.find.mockResolvedValue([
        { id: 1, invoice_no: 'INV-1', total_amount: 1000, deleted: 0 },
        { id: 2, invoice_no: 'INV-2', total_amount: 1000, deleted: 0 },
      ]);
      mockReceiptRepo.find.mockResolvedValue([
        { invoice_id: 1, amount: 1000, exchange_rate: 7, receipt_date: '2026-09-20', slip_url: null },
        { invoice_id: 2, amount: 400, exchange_rate: null, receipt_date: '2026-09-21', slip_url: null },
      ]);
      const out = await service.allocatedReceiptsForOrder(10);
      expect(mockRepo.find).toHaveBeenCalledTimes(1);   // 旧实现：每个款项行一次 findOne
      expect(mockReceiptRepo.find).toHaveBeenCalledTimes(1);
      expect(mockRepo.findOne).not.toHaveBeenCalled();
      // 两行各占发票1的 50% → 500 + 500；发票2 整票 → 400
      expect(out.map((r) => r.amount)).toEqual([500, 500, 400]);
    });

    it('B134 同类：款项行先各自取整再求和，发票总额 = 明细合计', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await service.create({
        invoice_no: 'INV-9',
        items: [1, 2, 3].map(() => ({ amount: 1.23456 })),
      } as any, 1);
      const header = mockManager.save.mock.calls[0][1];
      expect(header.total_amount).toBe(3.7038);
    });
  });
});
