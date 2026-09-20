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
// B030（2026-09-20 审查）：只抹顶层与 materials[] 不够——盖章快照 snapshot_json.materials[]、
// 发货批次 shipments[]（amount/snapshot_unit_price）及批次物料行 items[] 里的单价原样返回，
// 版师查任一已盖章合同详情，成本价全在快照里。这里把三处一并抹掉。
const LINE_PRICE_FIELDS = ['unit_price', 'amount'];
const SHIPMENT_PRICE_FIELDS = ['amount', 'snapshot_unit_price'];
function maskContractSnapshot(c: any): void {
  let snap = c.snapshot_json;
  if (snap == null) return;
  // json 列经 TypeORM 出来是对象；万一是字符串就先解析，解析不了宁可整体抹掉也不能原样放出去
  if (typeof snap === 'string') {
    try { snap = JSON.parse(snap); } catch { c.snapshot_json = null; return; }
    c.snapshot_json = snap;
  }
  if (!snap || typeof snap !== 'object') return;
  strip(snap, ['total_amount']);
  (Array.isArray(snap.materials) ? snap.materials : []).forEach((m: any) => strip(m, LINE_PRICE_FIELDS));
}
export function maskContract(payload: any, role: string): any {
  if (!MAKER_ROLES.includes(role)) return payload;
  return eachRecord(payload, (c) => {
    strip(c, ['total_amount', 'unit_price']); // unit_price：price-hint 这类扁平行的单价
    (c.materials ?? []).forEach((m: any) => strip(m, LINE_PRICE_FIELDS));
    maskContractSnapshot(c);
    (c.shipments ?? []).forEach((s: any) => {
      strip(s, SHIPMENT_PRICE_FIELDS);
      (s.items ?? []).forEach((it: any) => strip(it, LINE_PRICE_FIELDS));
    });
  });
}

// 工厂：银行账号/税号/开票联系方式（版师/打样脱敏；B030 同批、G4 提出）
// 版师/打样默认菜单里有「工厂」（老板定过的口径，不用 @Roles 砍），敏感字段靠这里抹——
// 合同金额对这两个角色已脱敏，工厂的明文银行账号/税号却还在，口径不一致。
// 【只抹这 8 个字段】开户行名称、注册资金、年销售额属于工厂档案的常规资料，不在本次范围内；
// 要扩范围请与业务确认后再加，别顺手把页面抹空
const FACTORY_SENSITIVE = [
  'bank_account', 'bank_account2',
  'tax_no', 'tax_no2',
  'invoice_phone', 'invoice_phone2',
  'invoice_address', 'invoice_address2',
];
export function maskFactory(payload: any, role: string): any {
  if (!MAKER_ROLES.includes(role)) return payload;
  return eachRecord(payload, (f) => strip(f, FACTORY_SENSITIVE));
}

// 结算：成本/毛利/净利（限财务/管理，其余角色脱敏）
const SETTLEMENT_SENSITIVE = [
  'gross_profit', 'gross_margin', 'net_profit', 'net_profit_ex_refund',
  'cost_per_unit_tax', 'cost_per_unit_extax', 'goods_amount_tax', 'goods_amount_extax',
  'breakeven_rate_tax', 'breakeven_rate_extax', 'finance_fee', 'total_cost', 'cost_per_unit',
  'unpaid_goods_tax', 'unpaid_count',
];
export function maskSettlement(payload: any, role: string): any {
  if (FINANCE_PRIVILEGED.includes(role)) return payload;
  return eachRecord(payload, (s) => {
    strip(s, SETTLEMENT_SENSITIVE);
    (s.costs ?? []).forEach((c: any) => strip(c, ['unit_price', 'amount']));
  });
}
