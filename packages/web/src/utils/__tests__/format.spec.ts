import { describe, it, expect } from 'vitest';
import { fmtDate, fmtDateTime, todayStr } from '../format';

/**
 * B091：datetime 列以 UTC ISO 下发（07:30 本地 = 前一天 23:30Z），截前 10 位得到的是 UTC 日期，
 * 早 8 点前创建/确认/盖章的单据显示成前一天。DATE 列（纯 YYYY-MM-DD）本来就是本地口径，不能动。
 * 运行环境时区见 vitest 默认（本机 +08:00）；用例只断言「按本地时区换算」，不写死时区。
 */
const localDateOf = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

describe('fmtDate（B091 datetime 按本地时区取日期）', () => {
  it('B091 带 Z 的 UTC ISO 串先转本地再取日期，不再直接截前 10 位', () => {
    const iso = '2026-07-31T23:30:00.000Z'; // 本地 +08:00 = 08-01 07:30
    expect(fmtDate(iso)).toBe(localDateOf(iso));
    expect(fmtDate(iso)).not.toBe('2026-07-31');
  });

  it('B091 带 +08:00 偏移的 ISO 串同样按本地换算', () => {
    const iso = '2026-08-01T07:30:00+08:00';
    expect(fmtDate(iso)).toBe(localDateOf(iso));
  });

  it('B091 DATE 列（纯 YYYY-MM-DD）原样取前 10 位——它没有时区，转一道反而会错', () => {
    expect(fmtDate('2026-08-01')).toBe('2026-08-01');
    expect(fmtDate('2026-08-01 00:00:00')).toBe('2026-08-01');
  });

  it('空值给「—」，解析不了的原样返回', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('')).toBe('—');
    expect(fmtDate('待定')).toBe('待定');
  });

  it('fmtDateTime 仍按本地显示到分钟', () => {
    const iso = '2026-07-31T23:30:00.000Z';
    expect(fmtDateTime(iso)).toBe(`${localDateOf(iso)} ${String(new Date(iso).getHours()).padStart(2, '0')}:30`);
  });

  it('todayStr 是本地今天，不是 UTC 今天', () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    expect(todayStr()).toBe(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  });
});
