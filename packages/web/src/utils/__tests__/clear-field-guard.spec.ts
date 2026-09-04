import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 源码守卫（#124）：编辑页里不许再写 `form.x || undefined`。
 * 那等于"清空永远存不进去"——后端 update 见 undefined 就不改。文本走 txt()、日期走 dateOrNull()、
 * 数字走 num()；白名单里的是 ID/枚举/必填/币种这类本来就不该发空串的字段。
 */
const VIEWS = path.resolve(__dirname, '../../views');
const ALLOW = new Set([
  'company_id', 'patternmakerId', 'name', 'currency', 'grade', 'type', 'portalAccount', 'portalPassword',
  'buyerId', 'sampleId', 'middlemanId', 'factoryId', 'order_id', 'parent_id',
]);
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : (/(EditView|ProfileView)\.vue$/.test(d.name) ? [p] : []);
  });
}

describe('编辑页清空语义守卫', () => {
  it("没有 form.x || undefined（清空必须发 '' 或 null）", () => {
    const bad: string[] = [];
    for (const f of walk(VIEWS)) {
      const src = fs.readFileSync(f, 'utf-8');
      for (const m of src.matchAll(/form\.(\w+) \|\| undefined\b/g)) {
        if (!ALLOW.has(m[1])) bad.push(`${path.relative(VIEWS, f)}: form.${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('守卫确实扫到了编辑页（别因为路径写错而空转变绿）', () => {
    expect(walk(VIEWS).length).toBeGreaterThanOrEqual(7);
  });
});
