import { describe, it, expect } from 'vitest';
import { splitLinesOf, materialPrintRows } from '../splitLines';

/**
 * fixture 按订单 O-20260901-001（#120 事故单）真实矩阵：1 个 PO、米白/浅棕两色各 4 码，合计 4528 件。
 * 数字与生产库一致——上次 #109/#110 的教训：fixture 跟着真实数据走，不跟着实现走。
 */
const ROWS = [
  { color: '米白11-0602', size: 'PP', qtys: [336] }, { color: '米白11-0602', size: 'P', qtys: [526] },
  { color: '米白11-0602', size: 'M', qtys: [740] }, { color: '米白11-0602', size: 'G', qtys: [662] },
  { color: '浅棕18-1048', size: 'PP', qtys: [455] }, { color: '浅棕18-1048', size: 'P', qtys: [552] },
  { color: '浅棕18-1048', size: 'M', qtys: [718] }, { color: '浅棕18-1048', size: 'G', qtys: [539] },
];
// om#1025：金属丝底PU，1.71 米/件，损耗 3%，整数取整
const PU = { item_name: '金属丝底PU', color: '米白', split_mode: 'BY_COLOR', unit: '米', net_usage: 1.71, loss_rate: 3, round_up: 1, final_purchase: 4000, total_purchase: 7976 };
// om#1028：拉链，1 条/件，分色分码
const ZIP = { item_name: '5# 金属拉链', color: '米白', split_mode: 'BY_BOTH', unit: '条', net_usage: 1, loss_rate: 0, round_up: 1, size_specs: { PP: '50', P: '52' } };

describe('splitLinesOf · 与后端 expandMaterialLines 同口径', () => {
  it('UT-SL-01 分色：每色 2264 件 × 1.71 × 1.03 向上取整 = 3988（订单 73 合同上的数）', () => {
    const lines = splitLinesOf(PU, ROWS);
    expect(lines.map((l) => [l.color, l.qty])).toEqual([['米白11-0602', 3988], ['浅棕18-1048', 3988]]);
    expect(lines[0].dim).toBe('color');
  });

  it('UT-SL-02 分色分码：8 个色码组合各一行，合计 = 大货数 4528', () => {
    const lines = splitLinesOf(ZIP, ROWS);
    expect(lines).toHaveLength(8);
    expect(lines.reduce((s, l) => s + l.qty, 0)).toBe(4528);
    expect(lines[0]).toMatchObject({ color: '米白11-0602', size: 'PP', qty: 336, dim: 'both' });
  });

  it('UT-SL-03 分码：颜色沿用材料行的，尺码来自矩阵', () => {
    const lines = splitLinesOf({ ...ZIP, split_mode: 'BY_SIZE' }, ROWS);
    expect(lines.map((l) => [l.size, l.qty])).toEqual([['PP', 791], ['P', 1078], ['M', 1458], ['G', 1201]]);
  });

  it('UT-SL-04 没单耗时按件数占比分摊采购量；final_purchase=0 不是有效值，退到 total_purchase', () => {
    const lines = splitLinesOf({ split_mode: 'BY_COLOR', unit: '米', net_usage: 0, final_purchase: 0, total_purchase: 500 }, ROWS);
    expect(lines.map((l) => l.qty)).toEqual([250, 250]);
  });

  it('UT-SL-05 不拆 / 没矩阵 → 空数组（调用方按整单）', () => {
    expect(splitLinesOf({ ...PU, split_mode: 'NONE' }, ROWS)).toEqual([]);
    expect(splitLinesOf(PU, [])).toEqual([]);
  });
});

describe('materialPrintRows · 打印/导出的材料行（#122 工厂要看到每个颜色各多少）', () => {
  it('UT-MPR-01 分色料逐色出行，多组补一行合计，序号只标在明细行', () => {
    const rows = materialPrintRows([PU], ROWS);
    expect(rows.map((r) => [r.kind, r.no, r.color, r.qty])).toEqual([
      ['line', 1, '米白11-0602', 3988],
      ['line', 1, '浅棕18-1048', 3988],
      ['sum', 1, '合计（2 组）', 7976],
    ]);
  });

  it('UT-MPR-02 分色分码行的颜色格带尺码与各码尺寸（拉链按码裁）', () => {
    const rows = materialPrintRows([ZIP], ROWS);
    expect(rows[0].color).toBe('米白11-0602 · PP(50)');
    expect(rows[2].color).toBe('米白11-0602 · M');       // 没填尺寸的码只出码名
    expect(rows.at(-1)).toMatchObject({ kind: 'sum', qty: 4528 });
  });

  it('UT-MPR-03 不拆的料原样一行；final_purchase=0 退到 total_purchase', () => {
    const rows = materialPrintRows([{ item_name: '30G有胶衬', color: '白色', split_mode: 'NONE', final_purchase: 0, total_purchase: 1726 }], ROWS);
    expect(rows).toEqual([expect.objectContaining({ kind: 'line', color: '白色', qty: 1726 })]);
  });

  it('UT-MPR-04 标了拆分但矩阵分不出组：明说，不印残留单色', () => {
    const rows = materialPrintRows([PU], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].color).toBe('自动分色（矩阵未分组）');
    expect(rows[0].qty).toBe(4000);
  });

  it('UT-MPR-05 序号按材料计，不按展开后的行计', () => {
    const rows = materialPrintRows([{ item_name: 'A', split_mode: 'NONE', total_purchase: 1 }, PU], ROWS);
    expect(rows.map((r) => r.no)).toEqual([1, 2, 2, 2]);
  });
});

describe('materialPrintRows · 按色单行', () => {
  it('UT-MPR-06 按色单行不是矩阵拆分：原样一行，颜色就是行上选的矩阵颜色，量是该行采购量', () => {
    const rows = materialPrintRows([
      { item_name: '金属丝底PU', color: '米白11-0602', split_mode: 'PER_COLOR', supplier: 'A厂', final_purchase: 0, total_purchase: 3988 },
      { item_name: '金属丝底PU', color: '浅棕18-1048', split_mode: 'PER_COLOR', supplier: 'B厂', final_purchase: 4000, total_purchase: 3988 },
    ], ROWS);
    expect(rows.map((r) => [r.kind, r.no, r.color, r.qty, r.supplier])).toEqual([
      ['line', 1, '米白11-0602', 3988, 'A厂'],
      ['line', 2, '浅棕18-1048', 4000, 'B厂'],
    ]);
  });
});

