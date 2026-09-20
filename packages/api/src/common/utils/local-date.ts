/**
 * 业务日期一律取**进程本地时区**的日历日（2026-09-20 审查：前后端 20+ 处用 `toISOString().slice(0,10)`，
 * 那是 UTC 日期——生产进程时区 +08:00，北京时间 00:00–08:00 建的单「单号是今天、日期是昨天」，
 * 而单号 numbering.service 用的是本地 getter，两边分叉）。
 * 只用这两个函数，别再手写 toISOString().slice(0,10)。
 */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 今天（本地时区）的 YYYY-MM-DD */
export function todayLocal(): string {
  return toLocalDateStr(new Date());
}

/**
 * 把 mysql2 回来的 DATE 列（可能是 Date 对象，也可能已是 'YYYY-MM-DD' 字符串）归一成 'YYYY-MM-DD'。
 * mysql2 按连接时区 +08:00 把 DATE 解析成本地零点的 Date，直接 toISOString 会退回前一天。
 */
export function dateColToStr(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : toLocalDateStr(v);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}
