import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 源码守卫：**展开面板里带输入框的 el-table 必须声明 row-key**（#121）。
 *
 * element-plus 对 :data 是 deep watch，面板里每敲一个字符都会走 setData→updateExpandRows；
 * 其源码（store/expand.ts）无 rowKey 的分支是 `expandRows.value = []` 直接清空——
 * 展开面板应声关闭、输入框连焦点一起消失，「填 57.5 要重新点开 4 次」。
 * 纯展示的展开面板不受影响（关了再点开就行，没有输入进度可丢），故只盯有 v-model 的。
 */
const VIEWS = join(process.cwd(), 'src', 'views');

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? vueFiles(p) : (n.endsWith('.vue') ? [p] : []);
  });
}

/** 逐行扫：栈记录嵌套的 el-table 开标签；expand 列归属栈顶那张表 */
function offendersIn(src: string): boolean {
  const lines = src.split('\n');
  const stack: string[] = [];           // 每张打开的 el-table 的开标签文本
  let inExpand = -1;                    // 进入 expand 列时的栈深；-1 = 不在
  let expandOwnerHasKey = false;
  for (const ln of lines) {
    if (ln.includes('<el-table ') || ln.includes('<el-table\n') || /<el-table$/.test(ln.trim())) {
      stack.push(ln);
    }
    if (ln.includes('type="expand"') && stack.length) {
      inExpand = stack.length;
      expandOwnerHasKey = /row-key/.test(stack[stack.length - 1]);
    }
    if (inExpand > 0 && ln.includes('v-model') && !expandOwnerHasKey) return true;
    if (ln.includes('</el-table-column>') && inExpand === stack.length) inExpand = -1;
    if (ln.includes('</el-table>')) { stack.pop(); if (inExpand > stack.length) inExpand = -1; }
  }
  return false;
}

describe('展开面板输入框的 row-key 守卫', () => {
  const files = vueFiles(VIEWS);

  it('守卫本身要扫得到东西', () => {
    expect(files.some((f) => f.endsWith('OrderEditView.vue'))).toBe(true);
  });

  it('UT-EXP-01: 展开面板里有 v-model 的表都声明了 row-key', () => {
    const bad = files.filter((f) => offendersIn(readFileSync(f, 'utf8'))).map((f) => relative(VIEWS, f));
    expect(bad).toEqual([]);
  });
});
