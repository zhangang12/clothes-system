import { todayLocal, toLocalDateStr, dateColToStr } from '../local-date';

describe('local-date：业务日期取本地日历日，不取 UTC', () => {
  it('toLocalDateStr 用本地 getter（北京时间 00:30 是今天，UTC 还是昨天）', () => {
    const d = new Date(2026, 8, 21, 0, 30); // 本地 2026-09-21 00:30
    expect(toLocalDateStr(d)).toBe('2026-09-21');
    // 只要进程时区在 UTC 以东，toISOString 就会给出前一天——这正是要避开的
    if (d.getTimezoneOffset() < 0) expect(d.toISOString().slice(0, 10)).toBe('2026-09-20');
  });
  it('todayLocal 形如 YYYY-MM-DD 且等于 toLocalDateStr(now)', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayLocal()).toBe(toLocalDateStr(new Date()));
  });
  it('dateColToStr：Date 按本地取日、字符串截前 10 位、空值给 null', () => {
    expect(dateColToStr(new Date(2026, 8, 20, 0, 0))).toBe('2026-09-20');
    expect(dateColToStr('2026-09-20T16:00:00.000Z')).toBe('2026-09-20');
    expect(dateColToStr('2026-09-20')).toBe('2026-09-20');
    expect(dateColToStr(null)).toBeNull();
    expect(dateColToStr('')).toBeNull();
  });
});
