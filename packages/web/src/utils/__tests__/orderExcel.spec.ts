import { describe, it, expect, vi, beforeEach } from 'vitest';

const exportDocXlsx = vi.fn().mockResolvedValue(undefined);
vi.mock('../docExcel', async (orig) => ({ ...(await orig<any>()), exportDocXlsx }));

const { exportOrderExcel } = await import('../orderExcel');

// 字段名照抄 order_main 真实列（make_date / qty_total / style_name…）——
// 最初这份 fixture 用的是 order_date / total_qty，库里根本没这两列，
// 于是导出来那几格全空而测试全绿（#110）。
const DETAIL = {
  order_no: 'O-20260818-004', style_no: 'WR02ADW3692', style_name: '男式夹克',
  make_date: '2026-08-18T00:00:00', salesperson: '姚霜梅',
  delivery_date: '2026-10-01', qty_total: 500, currency: 'USD', unit_price: 12.5, total_amount: 6250,
  middleman_name: '中间商A', buyer_name: '最终买家B', customer_po: 'PO-77',
  // 【按接口真实形状写】/orders/:id 回的是 OrderSizeMatrix 实体，搭配数据在 matrix.matrix_data 里。
  // 最初这份 fixture 被我写成了 { matrix: { pos, rows } }（少一层），于是导出器读错字段、
  // 测试却全绿——真到线上导出来是一张空表（#109/#110）。fixture 跟着接口走，别跟着实现走。
  matrix: {
    id: 9,
    order_id: 50,
    matrix_data: {
      pos: [{ po_no: 'PO-1', destination: 'SERBIA' }, { po_no: 'PO-2', destination: '' }],
      rows: [
        { style_no: 'WR02ADW3692', color: '深咖', article: '', size: 'S', qtys: [60, 10] },
        { style_no: 'WR02ADW3692', color: '米色', article: '', size: 'M', qtys: [84, 6] },
      ],
    },
  },
  materials: [
    { item_name: '主面料', part: '大身', color: '深咖', supplier: '苏州某某纺织', unit: '米',
      net_usage: 1.35, loss_rate: 3, final_purchase: 700, unit_price: 18.6, budget: 13020 },
  ],
};

const blocksOf = () => exportDocXlsx.mock.calls.at(-1)![0].blocks as any[];
/** 数值单元格取值：docExcel 里数字必须包成 { num, fmt }，直接给裸数字会被写成文本
 *  （#115 YSM：导出的订单表选中数量列，Excel 右下角求和=0） */
const numOf = (c: any) => (c && typeof c === 'object' && 'num' in c ? c.num : c);
const flat = () => JSON.stringify(blocksOf());
const tableTitled = (t: string) => blocksOf().find((b) => b.kind === 'table' && b.title === t);

beforeEach(() => exportDocXlsx.mockClear());

describe('订单导出 · 脱敏口径', () => {
  it('UT-ORD-X1: 对工厂的单据不含客户与价格——发给工厂不能带着客户报价', async () => {
    await exportOrderExcel(DETAIL, 'factory');
    const s = flat();
    expect(s).not.toContain('中间商A');
    expect(s).not.toContain('最终买家B');
    expect(s).not.toContain('PO-77');
    expect(s).not.toContain('6250');
  });

  it('UT-ORD-X2: 对客的单据不含供应商与成本——给客户不能带着我们的底价', async () => {
    await exportOrderExcel(DETAIL, 'customer');
    const s = flat();
    expect(s).not.toContain('苏州某某纺织');
    expect(s).not.toContain('18.6');
    expect(s).not.toContain('13020');
  });

  it('UT-ORD-X3: 对客单据干脆不出用料明细区', async () => {
    await exportOrderExcel(DETAIL, 'customer');
    expect(tableTitled('用料核算')).toBeUndefined();
  });

  it('UT-ORD-X11: 给工厂的那份要出用料明细，但不能带供应商与成本', async () => {
    await exportOrderExcel(DETAIL, 'factory');
    const t = tableTitled('用料核算');
    expect(t).toBeDefined();                    // 工厂要照着这个备料
    expect(t.head).not.toContain('供应商');      // 但别家供应商是谁不该让加工厂知道
    expect(t.head).not.toContain('单价');
    expect(t.head).not.toContain('预算');
    expect(JSON.stringify(t)).not.toContain('苏州某某纺织');
    expect(JSON.stringify(t)).not.toContain('18.6');
  });

  it('UT-ORD-X4: 内部单据才是全量', async () => {
    await exportOrderExcel(DETAIL, 'internal');
    const s = flat();
    expect(s).toContain('中间商A');
    expect(s).toContain('苏州某某纺织');
    expect(s).toContain('13020');
  });
});

describe('订单导出 · 数量搭配', () => {
  it('UT-ORD-X5: 每行有小计、末行有各 PO 合计', async () => {
    await exportOrderExcel(DETAIL, 'internal');
    const t = tableTitled('数量搭配（按 PO）');
    expect(numOf(t.rows[0].at(-1))).toBe(70);   // 60+10
    expect(numOf(t.rows[1].at(-1))).toBe(90);   // 84+6
    expect(numOf(t.foot.at(-1))).toBe(160);
    expect(t.foot.slice(-3, -1).map(numOf)).toEqual([144, 16]); // PO-1 / PO-2 各自合计
  });

  it('UT-ORD-X6: 洗标号整列为空时不占版面（老订单没填过这列）', async () => {
    await exportOrderExcel(DETAIL, 'internal');
    expect(tableTitled('数量搭配（按 PO）').head).not.toContain('洗标号');
  });

  it('UT-ORD-X7: 有洗标号时才出这一列', async () => {
    const d = { ...DETAIL, matrix: { ...DETAIL.matrix, matrix_data: { ...DETAIL.matrix.matrix_data, rows: [{ ...DETAIL.matrix.matrix_data.rows[0], article: 'ART-9' }] } } };
    await exportOrderExcel(d, 'internal');
    expect(tableTitled('数量搭配（按 PO）').head).toContain('洗标号');
  });

  it('UT-ORD-X8: 没有搭配数据时给一句话，不是一张空表', async () => {
    await exportOrderExcel({ ...DETAIL, matrix: { matrix_data: { pos: [], rows: [] } } }, 'internal');
    const t = tableTitled('数量搭配（按 PO）');
    expect(t.rows).toHaveLength(0);
    expect(t.empty).toContain('未填写');
  });
});

describe('订单导出 · 抬头字段', () => {
  // 【按字段名精确取值，别用 toContain 扫全串】最初这条写成 expect(s).toContain('500')，
  // 而单价 12.5 会被格式化成「12.5000」——里面就含 500，于是把 qty_total 写成不存在的
  // total_qty 时测试照样绿。断言要钉在那一格上。
  const kvOf = (label: string) =>
    (blocksOf().find((b) => b.kind === 'kv') as any).pairs.find((p: any[]) => p[0] === label)?.[1];

  it('UT-ORD-X11b: 抬头几格取的是真列名，写错会静默变空', async () => {
    await exportOrderExcel(DETAIL, 'internal');
    expect(numOf(kvOf('大货总数'))).toBe(500);     // qty_total，不是 total_qty
    expect(String(kvOf('制单日期'))).toBe('2026-08-18'); // make_date，不是 order_date
    expect(kvOf('品名')).toBe('男式夹克');
    expect(kvOf('业务员')).toBe('姚霜梅');
  });
});

describe('订单导出 · 数字要是数字', () => {
  // #115：docExcel 把所有单元格钉成文本（款号 I27.230.03929 不能被截成 27.23），
  // 数字必须走 numCell 这个唯一出口，否则 Excel 里选中一列「求和=0」，没法二次核算。
  const isNumCell = (c: any) => !!c && typeof c === 'object' && typeof c.num === 'number';

  it('UT-ORD-X12: 搭配表里每个 PO 的数量都是数值单元格，不是文本', async () => {
    await exportOrderExcel(DETAIL, 'internal');
    const t = tableTitled('数量搭配（按 PO）');
    expect(isNumCell(t.rows[0][4])).toBe(true);
    expect(isNumCell(t.rows[0].at(-1))).toBe(true);
    expect(t.foot.slice(-3).every(isNumCell)).toBe(true);
  });

  it('UT-ORD-X13: 用料核算的耗用/采购量/单价/预算也都是数值', async () => {
    await exportOrderExcel(DETAIL, 'internal');
    const t = tableTitled('用料核算');
    const row = t.rows[0];
    expect(row.filter(isNumCell).length).toBeGreaterThanOrEqual(4);
  });

  it('UT-ORD-X14: 款号、颜色仍是原文本——包成数值会变空或被 Excel 截断', async () => {
    await exportOrderExcel(DETAIL, 'internal');
    const t = tableTitled('数量搭配（按 PO）');
    // 钉死原值：只断言 typeof 是 string 会被骗——numCell('WR02ADW3692') 返回的空串也是 string
    expect(t.rows[0][0]).toBe('WR02ADW3692');
    expect(t.rows[0][1]).toBe('深咖');
  });

  it('UT-ORD-X15: 没填的数值给空单元格，不是 0——未填 ≠ 用量为零', async () => {
    await exportOrderExcel({ ...DETAIL, materials: [{ item_name: '面料' }] }, 'internal');
    const t = tableTitled('用料核算');
    // 逐格钉住，别用 some(...==='')：随便哪一格空着都能骗过去
    const i = t.head.indexOf('单件耗用');
    expect(i).toBeGreaterThan(0);
    expect(t.rows[0][i]).toBe('');
    expect(t.rows[0][t.head.indexOf('单价')]).toBe('');
  });
});

describe('订单导出 · 文件名', () => {
  it('UT-ORD-X9: 文件名带订单号与口径，一眼看出这份能不能外发', async () => {
    await exportOrderExcel(DETAIL, 'factory');
    expect(exportDocXlsx.mock.calls.at(-1)![0].filename).toBe('订单-O-20260818-004-生产通知单.xlsx');
  });

  it('UT-ORD-X10: 没有订单号也能导出，不至于报错', async () => {
    await exportOrderExcel({ ...DETAIL, order_no: undefined }, 'internal');
    expect(exportDocXlsx.mock.calls.at(-1)![0].filename).toContain('export');
  });
});
