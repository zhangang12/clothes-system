// 合同页的几段纯逻辑（2026-09-20 审查 B098 / B099 / B101 / B149），抽出来是为了能单测：
// 页面组件挂载太重，日期/行号这类边界最容易在页面里悄悄写错。

/** 单价没填（空/0/非数字）的货物明细行号（1 起）——B098：留空保存没有任何提示，总价 0 照样能推给供应商盖章 */
export function blankPriceRows(rows: Array<{ unit_price?: unknown }>): number[] {
  const out: number[] = [];
  (rows ?? []).forEach((m, i) => { if (!(Number(m?.unit_price) > 0)) out.push(i + 1); });
  return out;
}

/** 把行号列成一句能照做的话；全部有单价时返回 null */
export function blankPriceMessage(rows: number[]): string | null {
  if (!rows.length) return null;
  const head = rows.slice(0, 3).join('、');
  const more = rows.length > 3 ? ` 等 ${rows.length} 行` : '';
  return `货物明细第 ${head} 行${more}没填单价，合同总价会按 0 计算。仍要保存吗？`;
}

/**
 * 只取本地日历日的 'YYYY-MM-DD'。
 * - DATE 列本来就是 'YYYY-MM-DD'，原样返回；
 * - datetime / 裸 SQL 出来的 Date 经 JSON 是 UTC ISO（如 2026-09-19T16:00:00.000Z = 北京 09-20 00:00），
 *   直接 slice(0,10) 会少一天（B101 授权「有效期至」、B091 盖章时间都是这么错的），须先转本地再取日期。
 */
export function localDateStr(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 到期判断（B099）：按日历日比，到期日当天不算逾期。
 * 原来是 `new Date('YYYY-MM-DD') < new Date()`——字符串按 UTC 零点解析，北京时间早上 8:01 起当天到期的合同就标红了。
 * @param today 本地今天的 'YYYY-MM-DD'（传入便于测试）
 */
export function isPastDue(due: unknown, today: string): boolean {
  const d = localDateStr(due);
  return !!d && d < today;
}

/** 金额显示：为空给「—」，别把 NULL 显示成 0.00 / NaN（B149） */
export function amountText(currency: unknown, amount: unknown): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `${currency ?? ''} ${n.toFixed(2)}`.trim();
}
