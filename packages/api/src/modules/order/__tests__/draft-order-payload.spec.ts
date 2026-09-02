// DTO 上的装饰器要靠 reflect-metadata，单测配置没全局引入，这里显式补一句
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateOrderDto } from '../dto/create-order.dto';
import { draftOrderFromQuotePayload } from '@i9/types';

/**
 * 新建订单页「从报价导入」要先静默建一张草稿订单（#116/#117 的做法）。
 * 前端原来在页面里手写请求体，漏了本 DTO 里**必填**的 qty_total，于是这条路 8-27 上线后
 * 一直 400（生产 error_log #29：daisy 9-01 连点 3 次，只看到英文 `qty_total must not be less than 0`）。
 * 前端 mock 掉 create 的单测天生看不见 DTO 校验，所以请求体挪进 @i9/types 一份，
 * 这里用**真 DTO** 校验它——两边再漂移就在这里变红。
 */
const errorsOf = (payload: Record<string, unknown>) =>
  validate(plainToInstance(CreateOrderDto, payload), { whitelist: true, forbidNonWhitelisted: true });

describe('从报价建草稿订单的请求体（前后端契约）', () => {
  it('UT-ORD-D01: 共享请求体能通过 CreateOrderDto —— 一个字段都不缺', async () => {
    const errs = await errorsOf(draftOrderFromQuotePayload({ quote_id: 12, customer_id: 3, style_no: 'I27.230.03929' }));
    expect(errs.map((e) => e.property)).toEqual([]);
  });

  it('UT-ORD-D02: 草稿件数为 0（件数随后由尺码矩阵回填）', () => {
    expect(draftOrderFromQuotePayload({ quote_id: 12, customer_id: 3 }).qty_total).toBe(0);
  });

  it('UT-ORD-D03: 报价没款号时不发空串（style_no 可选，但不能是 ""）', async () => {
    const payload = draftOrderFromQuotePayload({ quote_id: 12, customer_id: 3, style_no: '' });
    expect(payload.style_no).toBeUndefined();
    expect(await errorsOf(payload)).toEqual([]);
  });

  it('UT-ORD-D04: 反证——漏 qty_total 就是生产上那个 400', async () => {
    const { qty_total, ...missing } = draftOrderFromQuotePayload({ quote_id: 12, customer_id: 3 });
    expect(qty_total).toBe(0);
    expect((await errorsOf(missing)).map((e) => e.property)).toContain('qty_total');
  });
});
