// 统一展示格式化(修复 ISO/UTC 原文直显问题)
// 后端 datetime 多为 UTC ISO(如 2026-07-04T19:03:30.000Z),这里转本地并去毫秒/T/Z
export function fmtDateTime(v: unknown): string {
  if (v == null || v === '') return '—';
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return String(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtDate(v: unknown): string {
  if (v == null || v === '') return '—';
  const s = String(v);
  // 已是 YYYY-MM-DD 直接取前 10 位
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 今天（浏览器本地时区）的 YYYY-MM-DD。表单默认日期一律用它，
 * 别写 new Date().toISOString().slice(0,10)——那是 UTC 日期，早上 8 点前会少一天（2026-09-20 审查）。
 */
export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
