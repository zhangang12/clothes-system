// DTO 上的装饰器要靠 reflect-metadata，单测配置没全局引入，这里显式补一句
import 'reflect-metadata';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { UpdateOrderDto, UpdateMatrixDto } from '../dto/update-order.dto';
import { OrderController } from '../order.controller';

/**
 * B006：PUT /orders/:id 与 PATCH /orders/:id/matrix 原来用 `Partial<CreateOrderDto>` / 内联类型接 body，
 * 编译后 metatype 是 Object，全局 ValidationPipe 整体跳过——任意字段、任意类型都能进来。
 * 这里用【真实的 ValidationPipe（与 main.ts 同配置）+ 真实 DTO】跑一遍，并用 design:paramtypes
 * 钉住控制器参数确实是这两个类（改回 Partial<> 这里就红）。
 */
describe('B006 订单更新类接口的 body 校验', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const bodyOf = (metatype: any) => ({ type: 'body' as const, metatype });

  // 与 packages/web/src/views/order/OrderEditView.vue buildDto() 逐字段对齐（编辑保存实际发的形状）
  const frontendPayload = () => ({
    quote_id: 12, customer_id: 3,
    customer_po: 'PO-1', style_no: 'I27.230.03929',
    unit_price: 12.5, currency: 'USD', delivery_date: null,          // dateOrNull → 没填就是 null
    commission_rate: 0, factory_id: undefined, salesperson: null,     // txt() 没填是 null
    split_mode: 'NONE', qty_total: 1405,
    att_artwork: null, att_sizechart: null, att_board: null, att_packing: null, att_filling: null,
    matrix_data: {
      pos: [{ po_no: '6800164753', destination: '', consignee: '' }],
      rows: [{ style_no: 'I27.230.03929', color: '黑色19-4008', article: '15617939', size: 'P', qtys: [1405] }],
    },
    materials: [{
      id: 11, item_name: '面料A', part: '前胸', width: '150', color: '黑色', composition: '100%涤',
      puller: undefined, zipper_teeth: undefined, code_band: undefined,
      supplier: 'A厂', unit: '米', unit_price: 20, net_usage: 1.5, loss_rate: 3,
      split_mode: 'BY_SIZE', final_purchase: null, size_specs: { S: '50', M: '52' }, round_up: undefined, sort_order: 0,
    }],
  });

  it('B006 控制器参数是真 DTO 类（Partial<> / 内联类型会被管道跳过）', () => {
    const upd = Reflect.getMetadata('design:paramtypes', OrderController.prototype, 'update');
    expect(upd[1]).toBe(UpdateOrderDto);
    const mx = Reflect.getMetadata('design:paramtypes', OrderController.prototype, 'updateMatrix');
    expect(mx[1]).toBe(UpdateMatrixDto);
  });

  it('B006 前端编辑页实际发送的 body 原样通过（不会因换 DTO 而 400）', async () => {
    const out: any = await pipe.transform(frontendPayload(), bodyOf(UpdateOrderDto));
    expect(out.materials[0]).toMatchObject({ id: 11, item_name: '面料A', size_specs: { S: '50', M: '52' } });
    expect(out.matrix_data.rows[0].article).toBe('15617939'); // 嵌套 JSON 不被 whitelist 剥掉
    expect(out.delivery_date).toBeNull();
  });

  it('B006 局部更新可以只传一个字段（PartialType：customer_id/qty_total 不再必填）', async () => {
    await expect(pipe.transform({ unit_price: 5 }, bodyOf(UpdateOrderDto))).resolves.toMatchObject({ unit_price: 5 });
    await expect(pipe.transform({ materials: [] }, bodyOf(UpdateOrderDto))).resolves.toMatchObject({ materials: [] });
  });

  it('B006 未知字段 / 字符串金额 / 非法枚举 / 超长文本 → 400（原来直接落到 MySQL）', async () => {
    await expect(pipe.transform({ status: 'DONE' }, bodyOf(UpdateOrderDto))).rejects.toThrow(BadRequestException);
    await expect(pipe.transform({ unit_price: 'abc' }, bodyOf(UpdateOrderDto))).rejects.toThrow(BadRequestException);
    await expect(pipe.transform({ split_mode: 'BY_COLOR_SIZE' }, bodyOf(UpdateOrderDto))).rejects.toThrow(BadRequestException);
    // 上限跟列宽 varchar(255) 走；生产里真有 153 字的客户 PO（9-22 真库往返发现原先 50 的上限挡住了 12 张订单）
    await expect(pipe.transform({ customer_po: 'x'.repeat(256) }, bodyOf(UpdateOrderDto))).rejects.toThrow(BadRequestException);
    await expect(pipe.transform({ customer_po: 'x'.repeat(153) }, bodyOf(UpdateOrderDto))).resolves.toBeDefined();
    await expect(pipe.transform({ materials: [{ item_name: 'A', net_usage: -1 }] }, bodyOf(UpdateOrderDto))).rejects.toThrow(BadRequestException);
  });

  it('B006 矩阵接口：matrix_data 必须是对象，多余字段拒绝', async () => {
    const md = { pos: [], rows: [{ color: '黑', qtys: [10] }] };
    await expect(pipe.transform({ matrix_data: md }, bodyOf(UpdateMatrixDto))).resolves.toMatchObject({ matrix_data: md });
    await expect(pipe.transform({}, bodyOf(UpdateMatrixDto))).rejects.toThrow(BadRequestException);
    await expect(pipe.transform({ matrix_data: 'oops' }, bodyOf(UpdateMatrixDto))).rejects.toThrow(BadRequestException);
    await expect(pipe.transform({ matrix_data: md, qty_total: 1 }, bodyOf(UpdateMatrixDto))).rejects.toThrow(BadRequestException);
  });
});
