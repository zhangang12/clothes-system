import { describe, it, expect } from 'vitest';
import { matrixPivotRows } from '../orderPrint';

/**
 * #118 daisy 给的工厂样张（I25.230.02757）：每 PO 一行、尺码作列。
 * 用她样张的真实数字当 fixture——上次 #109/#110 的教训：fixture 跟着真实数据走。
 * 系统存储是「行 = 色·码，列 = PO」，这里验证转置正确。
 */
const SIZES = ['P', 'M', 'G', 'GG'];
const PO = [
  { po_no: '6800189356', article: '16715314', color: '酒红19-1627', qty: [793, 1005, 901, 701] },
  { po_no: '6800185644', article: '15617939', color: '黑色19-4008', qty: [919, 1195, 1074, 812] },
  { po_no: '6800185635', article: '15700690', color: '咖色19-1419', qty: [793, 1005, 901, 701] },
  { po_no: '6800189368', article: '16715314', color: '酒红19-1627', qty: [331, 309, 295, 265] },
  { po_no: '6800187500', article: '15617939', color: '黑色19-4008', qty: [457, 499, 438, 406] },
  { po_no: '6800187502', article: '15700690', color: '咖色19-1419', qty: [331, 309, 296, 264] },
];
// 转成系统存储形状：每 (色,码) 一行，qtys 按 PO 排
const COLORS = [...new Set(PO.map((p) => p.color))];
const matrix = {
  pos: PO.map((p) => ({ po_no: p.po_no, destination: '', consignee: '' })),
  rows: COLORS.flatMap((color) => SIZES.map((size, si) => ({
    style_no: 'I25.230.02757', color, article: PO.find((p) => p.color === color)!.article, size,
    qtys: PO.map((p) => (p.color === color ? p.qty[si] : 0)),
  }))),
};

describe('生产通知单 · 按 PO 转置（#118）', () => {
  const pivot = matrixPivotRows(matrix)!;

  it('每 PO 恰好一行（一 PO 一色），共 6 行——不是原来的 12 行竖表', () => {
    expect(pivot.rows).toHaveLength(6);
  });

  it('对照样张逐行核数：PO 6800185644 = 919/1195/1074/812 合计 4000', () => {
    const r = pivot.rows.find((x) => x[0] === '6800185644')!;
    expect(r).toEqual(['6800185644', '15617939', '黑色19-4008', 919, 1195, 1074, 812, 4000]);
  });

  it('尺码列顺序按录入顺序（P M G GG），不被字典序打乱', () => {
    expect(pivot.head).toEqual(['PO#', '洗标号', '颜色', 'P', 'M', 'G', 'GG', '合计']);
  });

  it('合计行与样张分毫不差：3624 / 4322 / 3905 / 3149 / 15000', () => {
    expect(pivot.foot.slice(3)).toEqual([3624, 4322, 3905, 3149, 15000]);
  });

  it('某 PO 与颜色组合没有数量时不出空行——这正是省纸的关键', () => {
    // 6 PO × 3 色 = 18 种组合，只有 6 种有量
    expect(pivot.rows.every((r) => Number(r[r.length - 1]) > 0)).toBe(true);
  });

  it('洗标号整列为空时不占列', () => {
    const m2 = { ...matrix, rows: matrix.rows.map((r) => ({ ...r, article: '' })) };
    expect(matrixPivotRows(m2)!.head).not.toContain('洗标号');
  });

  it('有目的地时补一列（船期系统里没有，不能编数据）', () => {
    const m3 = { ...matrix, pos: matrix.pos.map((p, i) => ({ ...p, destination: i === 0 ? 'SERBIA' : '' })) };
    const pv = matrixPivotRows(m3)!;
    expect(pv.head).toContain('目的地');
    expect(pv.rows.find((r) => r[0] === '6800189356')!.at(-1)).toBe('SERBIA');
  });

  it('没有搭配数据时返回 null，由调用方给一句话', () => {
    expect(matrixPivotRows({ pos: [], rows: [] })).toBeNull();
  });

  // ── #122 daisy：「每个 PO 全码的数量配比汇总：PO，P 100，M 200，G 300，合计 600」──
  describe('PO 小计（一 PO 多色时）', () => {
    // 让第一个 PO（6800189356，原本只有酒红）再带 100/200/300/0 的黑色
    const m4 = { ...matrix, rows: matrix.rows.map((r) => (r.color === '黑色19-4008'
      ? { ...r, qtys: r.qtys.map((q, i) => (i === 0 ? [100, 200, 300, 0][SIZES.indexOf(r.size)] : q)) }
      : r)) };
    const pv = matrixPivotRows(m4)!;

    it('多色 PO 在自己的色行之后补一行小计：各码相加、合计相加', () => {
      const idx = pv.rows.findIndex((r) => r[0] === '6800189356' && r[2] === '小计（全色）');
      expect(idx).toBeGreaterThan(0);
      expect(pv.rows[idx]).toEqual(['6800189356', '', '小计（全色）', 893, 1205, 1201, 701, 4000]);
      expect(pv.subtotal.has(idx)).toBe(true);
      // 小计紧跟在该 PO 的两行色行之后
      expect(pv.rows[idx - 1][0]).toBe('6800189356');
      expect(pv.rows[idx - 2][0]).toBe('6800189356');
    });

    it('一 PO 一色的 PO 不出小计——那行本身就是汇总，重复只会占纸', () => {
      const subs = pv.rows.filter((r) => r[2] === '小计（全色）');
      expect(subs).toHaveLength(1);
      expect(pv.rows).toHaveLength(6 + 1 + 1);   // 原 6 行 + 新增黑色行 + 1 行小计
    });

    it('合计行不把小计再加一遍（否则那个 PO 翻倍）', () => {
      expect(pv.foot.slice(3)).toEqual([3624 + 100, 4322 + 200, 3905 + 300, 3149, 15600]);
    });

    it('原样张（一 PO 一色）完全不受影响：没有小计行', () => {
      expect(pivot.subtotal.size).toBe(0);
      expect(pivot.rows).toHaveLength(6);
    });
  });
});
