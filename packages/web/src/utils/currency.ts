// 币种符号/名称统一口径（2026-08-04 反馈 #13：报价选了 CNY，下面还显示 $ 和「美金单价」）。
//
// 背景：外销金额那一栏历来按「美金」写死——列头「美金单价」、合计「报价美元价格」、符号 $。
// 单据币种早已走 currency 字典（可选 CNY/EUR/JPY…），展示侧却没跟上，于是 CNY 的单子
// 也显示成美金。这里收口成一处，避免各页面各写一份又漏一批。
//
// 注意：**币种字典发的是 CNY，不是 RMB**。历史代码里有按 'RMB' 判符号的写法，
// 那种判断对任何单据都不会命中，CNY 一律会掉进 $ 分支——见订单列表的同类回归。

const SYMBOL: Record<string, string> = {
  CNY: '￥', RMB: '￥', // RMB 一并兜住：老数据/老代码里可能残留这个写法
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  HKD: 'HK$',
  AUD: 'A$',
  CAD: 'C$',
};

/** 币种符号；不认识的币种直接回退成币种代码本身（显示 "SEK 12.00" 也好过显示成 $） */
export function currencySymbol(code?: string | null): string {
  const c = String(code ?? '').trim().toUpperCase();
  return SYMBOL[c] || c || '';
}

/** 金额带符号，如 ￥1,234.00 / $1,234.00。amount 允许字符串；非数字返回 '-' */
export function money(amount: any, code?: string | null, digits = 2): string {
  if (amount === '' || amount == null) return '-';
  const n = Number(amount);
  if (Number.isNaN(n)) return '-';
  return `${currencySymbol(code)}${n.toFixed(digits)}`;
}

/** 外销价列头，如「USD单价」「CNY单价」——替代写死的「美金单价」 */
export function fxPriceLabel(code?: string | null, suffix = '单价'): string {
  const c = String(code ?? '').trim().toUpperCase();
  return `${c || '外币'}${suffix}`;
}
