import { describe, it, expect } from 'vitest';
import { duplicateAt, insertAbove, duplicateSelected } from '../rowOps';

const row = (name: string, extra: Record<string, unknown> = {}) => ({ item_name: name, ...extra });

describe('复制行', () => {
  it('副本紧跟在原行后面，不跑到表尾', () => {
    const list = [row('A'), row('B'), row('C')];
    expect(duplicateAt(list, 0)).toBe(true);
    expect(list.map((r) => r.item_name)).toEqual(['A', 'A', 'B', 'C']);
  });

  it('整行照抄，包括订单溯源 id——丢了它订单那边的「已订」绿标就没了', () => {
    const list = [row('拉链', { order_material_id: 88, color: '黑色', unit_price: 0.5 })];
    duplicateAt(list, 0);
    expect(list[1]).toEqual(list[0]);
    expect((list[1] as any).order_material_id).toBe(88);
  });

  it('副本是新对象，改了它不会连原行一起改', () => {
    const list = [row('A', { color: '黑' })];
    duplicateAt(list, 0);
    (list[1] as any).color = '深灰';
    expect((list[0] as any).color).toBe('黑');
  });

  it('下标越界不动数组', () => {
    const list = [row('A')];
    expect(duplicateAt(list, 5)).toBe(false);
    expect(duplicateAt(list, -1)).toBe(false);
    expect(list).toHaveLength(1);
  });
});

describe('插入空行', () => {
  it('插在指定行的上面——她指着第 1 行说漏了一行，往下插就补不到那个位置', () => {
    const list = [row('A'), row('B')];
    insertAbove(list, 0, () => row(''));
    expect(list.map((r) => r.item_name)).toEqual(['', 'A', 'B']);
  });

  it('中间插入把后面的行整体下移', () => {
    const list = [row('A'), row('B'), row('C')];
    insertAbove(list, 2, () => row('新'));
    expect(list.map((r) => r.item_name)).toEqual(['A', 'B', '新', 'C']);
  });

  it('插入的是新建的空行，不是共用同一个对象', () => {
    const list = [row('A')];
    insertAbove(list, 0, () => row(''));
    insertAbove(list, 0, () => row(''));
    (list[0] as any).item_name = '改了';
    expect(list[1].item_name).toBe('');
  });
});

describe('复制勾选的多行', () => {
  it('每行的副本紧跟它自己，不会挤到别人身边', () => {
    const list = [row('A'), row('B'), row('C'), row('D')];
    const n = duplicateSelected(list, [list[0], list[2]]);
    expect(n).toBe(2);
    expect(list.map((r) => r.item_name)).toEqual(['A', 'A', 'B', 'C', 'C', 'D']);
  });

  it('勾了全部也照样对位（从前往后插会整体错位）', () => {
    const list = [row('A'), row('B'), row('C')];
    duplicateSelected(list, [...list]);
    expect(list.map((r) => r.item_name)).toEqual(['A', 'A', 'B', 'B', 'C', 'C']);
  });

  it('没勾任何行时什么都不做', () => {
    const list = [row('A')];
    expect(duplicateSelected(list, [])).toBe(0);
    expect(list).toHaveLength(1);
  });

  it('勾选里混进了不在表里的行，只处理表里那些', () => {
    const list = [row('A'), row('B')];
    const n = duplicateSelected(list, [list[1], row('幽灵')]);
    expect(n).toBe(1);
    expect(list.map((r) => r.item_name)).toEqual(['A', 'B', 'B']);
  });
});
