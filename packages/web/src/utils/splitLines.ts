/**
 * 材料按订单尺码矩阵拆行（分色 / 分码 / 分色分码）——前端唯一的一份实现。
 *
 * 2026-09-02 从 ContractEditView 抽出来：此前合同带入、订单页预览、打印/导出各写各的，
 * #120 事故本身就是「两份实现漂移」的产物。口径以后端 contract.service.expandMaterialLines 为准：
 * key 用 JSON 化（颜色本身带空格，拼串会歧义）；分组量 × 单耗 × (1+损耗)，没单耗按件数占比
 * 分摊已核算采购量；整数单位向上取整。
 */
export const INT_UNITS = ['个', '条', '只', '件', '粒', '套', '对', 'pcs', 'PCS', 'PC'];

export type SplitDim = 'color' | 'size' | 'both';
export interface SplitLine { key: string; qty: number; dim: SplitDim; color: string; size: string }

export function splitLinesOf(m: any, matrixRows: any[]): SplitLine[] {
  const mode = m?.split_mode;
  if ((mode !== 'BY_COLOR' && mode !== 'BY_SIZE' && mode !== 'BY_BOTH') || !matrixRows?.length) return [];
  const groups = new Map<string, number>();
  const dims = new Map<string, { color: string; size: string }>();
  for (const r of matrixRows) {
    const color = String(r?.color ?? '').trim();
    const size = String(r?.size ?? '').trim();
    const key = mode === 'BY_COLOR' ? color : mode === 'BY_SIZE' ? size
      : (color && size ? JSON.stringify([color, size]) : '');
    const qty = Array.isArray(r?.qtys) ? r.qtys.reduce((s: number, n: any) => s + (+n || 0), 0) : +r?.qty || 0;
    if (!key || !qty) continue;
    groups.set(key, (groups.get(key) ?? 0) + qty);
    if (!dims.has(key)) dims.set(key, { color, size });
  }
  if (!groups.size) return [];
  const per = +m.net_usage || 0;
  const loss = 1 + (+m.loss_rate || 0) / 100;
  const totalGroupQty = [...groups.values()].reduce((a, b) => a + b, 0);
  // 0 不是有效值：生产 543/800 行 final_purchase 存 0 而非 NULL，?? 跳不过 0
  const fallbackBase = (+m.final_purchase > 0 ? +m.final_purchase : +m.total_purchase) || 0;
  const round = m.round_up === 1 || (m.round_up == null && INT_UNITS.includes(m.unit ?? ''));
  const dim: SplitDim = mode === 'BY_COLOR' ? 'color' : mode === 'BY_SIZE' ? 'size' : 'both';
  return [...groups].map(([key, groupQty]) => {
    let qty = per > 0 ? groupQty * per * loss : (totalGroupQty ? (fallbackBase * groupQty) / totalGroupQty : 0);
    qty = round ? Math.ceil(qty) : +qty.toFixed(2);
    const d = dims.get(key) ?? { color: '', size: '' };
    return { key, qty, dim, color: d.color, size: d.size };
  });
}

/** 打印/导出用的材料行：拆分料逐组出行（工厂要看到每个颜色各多少），多组时补一行合计 */
export interface MaterialPrintRow {
  kind: 'line' | 'sum';
  no: number;
  item_name: string;
  part: string;
  /** 颜色格：拆分行给「颜色 · 尺码」，不拆给原颜色，标了拆分但矩阵分不出组时明说 */
  color: string;
  supplier: string;
  unit: string;
  net_usage: unknown;
  loss_rate: unknown;
  qty: number | null;
  unit_price: unknown;
  budget: unknown;
}

export function materialPrintRows(materials: any[], matrixRows: any[]): MaterialPrintRow[] {
  const out: MaterialPrintRow[] = [];
  (materials ?? []).forEach((m, i) => {
    const base = {
      no: i + 1, item_name: m.item_name ?? '', part: m.part ?? '', supplier: m.supplier ?? '', unit: m.unit ?? '',
      net_usage: m.net_usage, loss_rate: m.loss_rate, unit_price: m.unit_price, budget: m.budget,
    };
    const split = m.split_mode === 'BY_COLOR' || m.split_mode === 'BY_SIZE' || m.split_mode === 'BY_BOTH';
    const lines = split ? splitLinesOf(m, matrixRows) : [];
    // 0 不是有效值（同 splitLinesOf）；两个都没有给 null，渲染层出「—」
    const whole = +m.final_purchase > 0 ? +m.final_purchase : (+m.total_purchase > 0 ? +m.total_purchase : null);
    if (!lines.length) {
      out.push({ kind: 'line', ...base, color: split ? '自动分色（矩阵未分组）' : (m.color ?? ''), qty: whole });
      return;
    }
    for (const l of lines) {
      const color = l.dim === 'size' ? (m.color ?? '') : l.color;
      // 分码行带上各码尺寸（拉链/织带按码不同尺寸），工厂按码裁料
      // 只拆颜色的行不带尺码（分组 key 是颜色，记下的 size 只是该色首行的码，没有意义）
      const sizeKey = l.dim === 'color' ? '' : l.size;
      const spec = sizeKey ? String(m.size_specs?.[sizeKey] ?? '').trim() : '';
      const sizeCell = sizeKey ? (spec ? `${sizeKey}(${spec})` : sizeKey) : '';
      out.push({ kind: 'line', ...base, color: [color, sizeCell].filter(Boolean).join(' · '), qty: l.qty });
    }
    if (lines.length > 1) {
      out.push({ kind: 'sum', ...base, color: `合计（${lines.length} 组）`, qty: +lines.reduce((s, l) => s + l.qty, 0).toFixed(2) });
    }
  });
  return out;
}
