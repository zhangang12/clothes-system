import { describe, it, expect } from 'vitest';
import { num, checkNumericCells } from '../numGuard';

describe('numGuard（2026-08-04 反馈 #08 及举一反三）', () => {
  it('空值 → undefined（字段不发，后端 @IsOptional 放行）', () => {
    expect(num('')).toBeUndefined();
    expect(num(null)).toBeUndefined();
    expect(num(undefined)).toBeUndefined();
  });
  it('0 不能被吞掉（别写成 Number(v) || undefined）', () => {
    expect(num(0)).toBe(0);
    expect(num('0')).toBe(0);
  });
  it('非数字不外发 NaN——JSON.stringify(NaN) 是 null，会静默把数据写成空', () => {
    expect(num('若干')).toBeUndefined();
    expect(JSON.stringify({ v: NaN })).toBe('{"v":null}'); // 佐证为何必须拦
  });
  it('正常数值原样转换', () => {
    expect(num('1.25')).toBe(1.25);
    expect(num(' 3 ')).toBe(3);
  });

  const COLS: Array<[string, string]> = [['qty', '数量'], ['price', '单价']];
  it('报错定位到「第几行·哪一列·填了什么」，不再甩英文原文', () => {
    const err = checkNumericCells([{ qty: 1 }, { qty: '若干' }], COLS, '材料明细');
    expect(err).toBe('材料明细第 2 行「数量」填的是「若干」，这一列只能填数字');
  });
  it('留空是允许的，不报错（交给后端默认值）', () => {
    expect(checkNumericCells([{ qty: '', price: null }], COLS, '材料明细')).toBeNull();
  });
  it('全部合法返回 null', () => {
    expect(checkNumericCells([{ qty: 1, price: '2.5' }], COLS, '材料明细')).toBeNull();
  });
});
