import { ValidationPipe } from '@nestjs/common';
import { CreateOrderDto } from '../dto/create-order.dto';

/**
 * 洗标号/Article 存在 matrix_data（JSON 列）里，没有嵌套 DTO 校验。
 * 而全局管道开了 whitelist:true —— 它会剥掉 DTO 上没声明的属性。
 * 这里让【真实的 ValidationPipe + 真实的 DTO】跑一遍，确认嵌套 JSON 里的
 * article 不会被静默洗掉（洗掉的话工厂就拿不到标类，且前端毫无报错）。
 */
describe('matrix_data 里的 article 能否穿过全局校验管道', () => {
  // 与 main.ts 保持一致
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const meta = { type: 'body' as const, metatype: CreateOrderDto };

  const dto = (matrixRows: any[]) => ({
    customer_id: 1,
    customer_po: 'PO-TEST',
    style_no: 'I27.230.03929',
    delivery_date: '2026-08-01',
    qty_total: matrixRows.reduce((s, r) => s + (r.qtys ?? []).reduce((a: number, b: number) => a + b, 0), 0),
    matrix_data: {
      pos: [{ po_no: '6800164753', destination: '', consignee: '' }],
      rows: matrixRows,
    },
  });

  it('article 原样保留（whitelist 不剥嵌套 JSON 的键）', async () => {
    const out: any = await pipe.transform(
      dto([{ style_no: 'I27.230.03929', color: '黑色19-4008', article: '15617939', size: 'P', qtys: [1405] }]),
      meta,
    );
    expect(out.matrix_data.rows[0].article).toBe('15617939');
    // 同时确认其它列没被动
    expect(out.matrix_data.rows[0]).toMatchObject({ color: '黑色19-4008', size: 'P', qtys: [1405] });
    expect(out.matrix_data.pos[0].po_no).toBe('6800164753');
  });

  it('多行各自的 article 都在', async () => {
    const out: any = await pipe.transform(
      dto([
        { style_no: 'A', color: '黑色19-4008', article: '15617939', size: 'P', qtys: [1405] },
        { style_no: 'A', color: '咖色17-1312', article: '16222610', size: 'M', qtys: [974] },
      ]),
      meta,
    );
    expect(out.matrix_data.rows.map((r: any) => r.article)).toEqual(['15617939', '16222610']);
  });

  it('老订单没有 article 也不报错（向后兼容）', async () => {
    const out: any = await pipe.transform(
      dto([{ style_no: 'A', color: '米白', size: 'PP', qtys: [500] }]),
      meta,
    );
    expect(out.matrix_data.rows[0].article).toBeUndefined();
  });
});
