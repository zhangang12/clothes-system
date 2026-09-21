import 'reflect-metadata';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { UpdateSampleDto } from '../../modules/sample/dto/update-sample.dto';
import { UpdateOrderDto } from '../../modules/order/dto/update-order.dto';
import { UpdatePaymentRequestDto } from '../../modules/payment/dto/update-payment-request.dto';
import { CreateExportInvoiceDto } from '../../modules/invoice/dto/create-export-invoice.dto';
import { UpdateReconciliationDraftDto } from '../../modules/reconciliation/dto/update-reconciliation-draft.dto';
import { UpdateQuoteDto } from '../../modules/quote/dto/update-quote.dto';
import { UpdateCustomerDto } from '../../modules/customer/dto/update-customer.dto';
import { readFileSync } from 'fs';
import { join } from 'path';

// 运行时读取（不为测试改 tsconfig 的 resolveJsonModule）
const loadFixture = (name: string): any => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf-8'));
const prodSample = loadFixture('prod-put-sample.json');
const prodOrder = loadFixture('prod-put-order.json');

/**
 * 【真实请求体回归】2026-09-21 生产事故：审查修复批把 10 个更新接口从 Partial<Dto>/any 换成真 DTO，
 * 各组测试夹具用的是理想化的数字 ID，而生产上前端回传的 ID 是字符串（mysql2 出 bigint 是字符串）——
 * 样衣整单 400（74 次）、订单 INSERT 撞主键 500（20 次），Amanda 一整天存不了单。
 *
 * 这里用**和 main.ts 一模一样的全局管道配置**，喂两份从生产 error_log 取回的真实请求体（只换了人名），
 * 再加四份按前端代码逐字段构造的请求体（ID 一律字符串、decimal 一律字符串，照生产形态）。
 * 以后谁再改这几个 DTO，先过这一关。
 */
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
const run = (metatype: any, body: unknown) => pipe.transform(JSON.parse(JSON.stringify(body)), { type: 'body', metatype, data: '' });
const messagesOf = async (metatype: any, body: unknown): Promise<string[]> => {
  try { await run(metatype, body); return []; } catch (e) {
    if (e instanceof BadRequestException) return ([] as string[]).concat((e.getResponse() as any).message ?? []);
    throw e;
  }
};

describe('真实请求体过全局校验管道（2026-09-21 生产回归）', () => {
  it('PUT /samples/:id 生产真实请求体（11 行材料，行 ID 为字符串）→ 放行，行 ID 保持原样', async () => {
    expect(await messagesOf(UpdateSampleDto, prodSample)).toEqual([]);
    const out: any = await run(UpdateSampleDto, prodSample);
    expect(out.materials.length).toBe((prodSample as any).materials.length);
    expect(out.materials.map((m: any) => m.id)).toEqual((prodSample as any).materials.map((m: any) => m.id));
  });

  it('PUT /orders/:id 生产真实请求体（14 行材料，行 ID 为字符串）→ 放行，行 ID 不被转成数字', async () => {
    expect(await messagesOf(UpdateOrderDto, prodOrder)).toEqual([]);
    const out: any = await run(UpdateOrderDto, prodOrder);
    // 转成数字就会让 TypeORM 认不出老行、INSERT 撞主键（见 common/validators/is-id-like.ts）
    for (const m of out.materials) expect(typeof m.id).toBe('string');
  });

  it('PATCH /payments/requests/:id 编辑草稿：工厂/对账单 ID 与金额取自列表行（字符串）→ 放行并转成数字', async () => {
    const body = {
      type: 'CONTRACT', factory_id: '36', reconcile_id: '28', amount: '35844.35', prepay_offset: '0',
      description: '', bank_name: '', bank_account: '', related_style_no: '', invoice_no: '', invoice_url: '',
    };
    expect(await messagesOf(UpdatePaymentRequestDto, body)).toEqual([]);
    const out: any = await run(UpdatePaymentRequestDto, body);
    expect(out.factory_id).toBe(36);
    expect(out.reconcile_id).toBe(28);
    expect(out.amount).toBe(35844.35);
  });

  it('POST /export-invoices：款项行的订单 ID 来自下拉（字符串）、日期可留空 → 放行', async () => {
    const body = {
      invoice_no: 'INV-0921', invoice_date: '', customer_name: '', remark: '',
      items: [{ order_id: '120', style_no: 'I27.235.03139', amount: 12000 }, { order_id: '', style_no: '', amount: 500 }],
    };
    expect(await messagesOf(CreateExportInvoiceDto, body)).toEqual([]);
  });

  it('PATCH /reconciliations/:id 改草稿（前端已 +row.x 转数字，清空发 undefined）→ 放行', async () => {
    expect(await messagesOf(UpdateReconciliationDraftDto, { invoice_no: 'FP001', invoice_amount: 1000, tax_rate: 13, description: '' })).toEqual([]);
    expect(await messagesOf(UpdateReconciliationDraftDto, { invoice_no: '', description: '' })).toEqual([]);
  });

  it('PUT /quotes/:id：样衣/中间商 ID 为字符串、买家清空为 null、明细不带 id → 放行', async () => {
    const body = {
      inquiryDate: '2026-09-21', sampleId: '298', middlemanId: '31', buyerId: null, styleNo: 'I27.115.08581',
      middlemanContact: '', currency: 'USD', exchangeRate: 7, tradeCountry: '', settlementMethod: '', priceTerms: '',
      salesperson: '业务员', profitRate: 0, quoteQty: null, totalRemark: '', image1: '', image2: '',
      items: [{ part: '大身', itemName: '面料', width: '145', color: '棕色', supplier: '', unit: '米', quoteUsage: 1.42, rmbPrice: 9.9, lossRate: 3, remark: '', sortOrder: 0 }],
      fees: [{ feeName: '加工费', rmbPrice: 25, quoteUsage: 1, sortOrder: 0 }],
    };
    expect(await messagesOf(UpdateQuoteDto, body)).toEqual([]);
  });

  it('PUT /customers/:id：联系人行带着详情接口回来的 id/customer_id/sort_order（字符串）→ 放行', async () => {
    const body = {
      name: 'ACME', type: 'MIDDLEMAN', relatedMiddleman: '', tradeCountry: '俄罗斯', countryRegion: '', city: '',
      homepage: '', address: '', priceTerms: '', settlementMethod: '', cooperationLevel: '', customerSource: '',
      paymentDays: null, businessScope: '', salesperson: '业务员', developDate: '2026-09-21', currency: 'USD',
      spare1: '', spare2: '', spare3: '', deliveryAddress: '', frontMark: '', sideMark: '', innerBoxText: '',
      customerRemark: '', commissionRate: null,
      contacts: [{ id: '88', customer_id: '31', sort_order: '0', name: 'Jane', department: '', gender: '', title: '', phone: '', mobile: '', mobile1: '', mobile2: '', email: '', remark: '' }],
      banks: [], expresses: [],
    };
    expect(await messagesOf(UpdateCustomerDto, body)).toEqual([]);
  });

  it('怪值仍然拦得住：行 ID 为负数/带字母/小数 → 400', async () => {
    for (const bad of ['-5', 'abc', '12.5', 0]) {
      const body = { ...(prodSample as any), materials: [{ ...(prodSample as any).materials[0], id: bad }] };
      const msgs = await messagesOf(UpdateSampleDto, body);
      expect(msgs.join('；')).toContain('有效的 ID');
    }
  });
});
