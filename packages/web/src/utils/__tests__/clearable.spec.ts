import { describe, it, expect } from 'vitest';
import { txt, dateOrNull } from '../clearable';

describe('clearable · 编辑页空值语义（#124）', () => {
  it('txt：空/未定义 → 空串（清空要发出去），有值原样', () => {
    expect(txt('')).toBe('');
    expect(txt(null)).toBe('');
    expect(txt(undefined)).toBe('');
    expect(txt('PO: 14.83')).toBe('PO: 14.83');
  });
  it('dateOrNull：空 → null（DATE 列不接受空串），有值原样', () => {
    expect(dateOrNull('')).toBeNull();
    expect(dateOrNull(undefined)).toBeNull();
    expect(dateOrNull('2026-09-04')).toBe('2026-09-04');
  });
});
