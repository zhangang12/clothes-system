import { describe, it, expect, vi, beforeEach } from 'vitest';

const exportDocXlsx = vi.fn().mockResolvedValue(undefined);
vi.mock('../docExcel', async (orig) => ({ ...(await orig<any>()), exportDocXlsx }));

const { exportOrderExcel } = await import('../orderExcel');

const DETAIL = {
  order_no: 'O-20260818-004', style_no: 'WR02ADW3692', order_date: '2026-08-18T00:00:00',
  delivery_date: '2026-10-01', total_qty: 500, currency: 'USD', unit_price: 12.5, total_amount: 6250,
  customer_name: '中间商A', buyer_name: '最终买家B', customer_po: 'PO-77',
  matrix: {
    pos: [{ po_no: 'PO-1', destination: 'SERBIA' }, { po_no: 'PO-2', destination: '' }],
    rows: [
      { style_no: 'WR02ADW3692', color: '深咖', article: '', size: 'S', qtys: [60, 10] },
      { style_no: 'WR02ADW3692', color: '米色', article: '', size: 'M', qtys: [84, 6] },
    ],
  },
  materials: [
    { item_name: '主面料', part: '大身', color: '深咖', supplier: '苏州某某纺织', unit: '米',
      net_usage: 1.35, loss_rate: 3, final_purchase: 700, unit_price: 18.6, budget: 13020 },
  ],
};

const blocksOf = () => exportDocXlsx.mock.calls.at(-1)![0].blocks as any[];
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
    expect(t.rows[0].at(-1)).toBe(70);   // 60+10
    expect(t.rows[1].at(-1)).toBe(90);   // 84+6
    expect(t.foot.at(-1)).toBe(160);
    expect(t.foot.slice(-3, -1)).toEqual([144, 16]); // PO-1 / PO-2 各自合计
  });

  it('UT-ORD-X6: 洗标号整列为空时不占版面（老订单没填过这列）', async () => {
    await exportOrderExcel(DETAIL, 'internal');
    expect(tableTitled('数量搭配（按 PO）').head).not.toContain('洗标号');
  });

  it('UT-ORD-X7: 有洗标号时才出这一列', async () => {
    const d = { ...DETAIL, matrix: { ...DETAIL.matrix, rows: [{ ...DETAIL.matrix.rows[0], article: 'ART-9' }] } };
    await exportOrderExcel(d, 'internal');
    expect(tableTitled('数量搭配（按 PO）').head).toContain('洗标号');
  });

  it('UT-ORD-X8: 没有搭配数据时给一句话，不是一张空表', async () => {
    await exportOrderExcel({ ...DETAIL, matrix: { pos: [], rows: [] } }, 'internal');
    const t = tableTitled('数量搭配（按 PO）');
    expect(t.rows).toHaveLength(0);
    expect(t.empty).toContain('未填写');
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
