import { UserRole } from '@i9/types';

// 字段级角色脱敏（设计稿 F 系列 rec:0）：
//   版师(PATTERNMAKER)/打样(SAMPLE_MAKER) 不见「对客单价与毛利」及供应商成本；
//   结算「成本/毛利/净利」限 财务(FINANCE)/管理(ADMIN/SUPERVISOR)。
const MAKER_ROLES: string[] = [UserRole.PATTERNMAKER, UserRole.SAMPLE_MAKER];
const FINANCE_PRIVILEGED: string[] = [UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPERVISOR];

function strip(rec: any, fields: string[]): void {
  if (!rec || typeof rec !== 'object') return;
  for (const f of fields) if (f in rec) rec[f] = null;
}

// 兼容三种载荷：数组、分页 {items,total,...}、单条记录（含自身 items/materials 子表）
// 关键：分页包裹无自身 id；单条明细有 id（避免把报价明细 items 误当分页项）
function eachRecord(payload: any, fn: (rec: any) => void): any {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) { payload.forEach(fn); return payload; }
  if (Array.isArray(payload.items) && !('id' in payload)) { payload.items.forEach(fn); return payload; }
  fn(payload);
  return payload;
}

// 报价：对客单价/合计（版师/打样脱敏）
export function maskQuote(payload: any, role: string): any {
  if (!MAKER_ROLES.includes(role)) return payload;
  return eachRecord(payload, (q) => {
    strip(q, ['rmb_total', 'usd_total']);
    (q.items ?? []).forEach((it: any) => strip(it, ['rmb_price', 'usd_price', 'loss_amount']));
    (q.fees ?? []).forEach((f: any) => strip(f, ['rmb_price', 'usd_price']));
  });
}

// 订单：对客单价/金额（版师/打样脱敏）
export function maskOrder(payload: any, role: string): any {
  if (!MAKER_ROLES.includes(role)) return payload;
  return eachRecord(payload, (o) => {
    strip(o, ['unit_price', 'total_amount']);
    (o.materials ?? []).forEach((m: any) => strip(m, ['unit_price', 'budget']));
  });
}

// 合同：供应商单价/金额=成本（版师/打样脱敏）
export function maskContract(payload: any, role: string): any {
  if (!MAKER_ROLES.includes(role)) return payload;
  return eachRecord(payload, (c) => {
    strip(c, ['total_amount']);
    (c.materials ?? []).forEach((m: any) => strip(m, ['unit_price', 'amount']));
  });
}

// 结算：成本/毛利/净利（限财务/管理，其余角色脱敏）
const SETTLEMENT_SENSITIVE = [
  'gross_profit', 'gross_margin', 'net_profit', 'net_profit_ex_refund',
  'cost_per_unit_tax', 'cost_per_unit_extax', 'goods_amount_tax', 'goods_amount_extax',
  'breakeven_rate_tax', 'breakeven_rate_extax', 'finance_fee', 'total_cost', 'cost_per_unit',
];
export function maskSettlement(payload: any, role: string): any {
  if (FINANCE_PRIVILEGED.includes(role)) return payload;
  return eachRecord(payload, (s) => {
    strip(s, SETTLEMENT_SENSITIVE);
    (s.costs ?? []).forEach((c: any) => strip(c, ['unit_price', 'amount']));
  });
}
