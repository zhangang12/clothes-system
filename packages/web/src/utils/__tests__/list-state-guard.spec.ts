import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * #139/#140 守卫：有筛选条件（`const xxxQuery = reactive(` / `const query = reactive(`）的列表页，
 * 都要记住筛选条件（useListState）并记住列宽（@header-dragend 接 useColumnWidths）。
 * 新加的列表页忘了接，这里变红。
 */
const VIEWS = path.resolve(__dirname, '../../views');
const listViews = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? listViews(p) : (/ListView\.vue$/.test(e.name) ? [p] : []);
});

describe('列表页记住筛选条件与列宽', () => {
  const files = listViews(VIEWS).filter((f) => /const \w*[qQ]uery = reactive\(/.test(fs.readFileSync(f, 'utf-8')));

  it('扫到的列表页数量合理（防止路径写错导致空扫）', () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
  });

  it.each(listViews(VIEWS).filter((f) => /const \w*[qQ]uery = reactive\(/.test(fs.readFileSync(f, 'utf-8'))).map((f) => [path.relative(VIEWS, f), f]))(
    '%s', (_name, file) => {
      const s = fs.readFileSync(file as string, 'utf-8');
      expect(s).toMatch(/useListState\('[\w.-]+'/);
      expect(s).toMatch(/useColumnWidths\('[\w.-]+'/);
      expect(s).toMatch(/@header-dragend="on\w*HeaderDragend"/);
    });
});
