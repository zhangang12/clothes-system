import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 源码守卫：**选样衣 / 选报价的下拉必须走远程搜索**。
 *
 * 这个坑踩过两次（#107 → #108）：全站关联下拉都是「拉前 100 条 + el-select 本地过滤」，
 * 数据没过 100 条看不出问题，一超就变成「列表页搜得到、这个下拉搜不到」。
 * 8-19 只改了报价编辑页的一个对话框，可用户用的是报价**列表页**那个，于是白改一轮——
 * 光靠"记得改全"是不行的，同一个页面里就有三处选样衣。
 *
 * 生产条数（2026-08-21）：样衣 175、报价 117，都已超过 100。
 * 以后谁再加一个选样衣/选报价的下拉，只写 filterable 的话这条会红。
 */
// 用 cwd 而不是 import.meta.url：vitest 转换后 import.meta.url 指向虚拟根，会解析成 /src/views
const VIEWS = join(process.cwd(), 'src', 'views');

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? vueFiles(p) : (n.endsWith('.vue') ? [p] : []);
  });
}

/** 取出模板里每个 <el-select …> … </el-select> 片段 */
/** 只认独立的 remote 属性：`\bremote\b` 会把 `:remote-method` 里的 remote 也算上，
 *  于是「只写 filterable + remote-method」这种真出过问题的写法反而被放行（本条实测踩过） */
const hasRemoteAttr = (open: string): boolean => /(^|\s):?remote(?![-\w])/.test(open);

function selectBlocks(src: string): Array<{ open: string; body: string }> {
  const out: Array<{ open: string; body: string }> = [];
  const re = /<el-select\b([\s\S]*?)>([\s\S]*?)<\/el-select>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push({ open: m[1], body: m[2] });
  return out;
}

describe('关联下拉的远程搜索守卫', () => {
  const files = vueFiles(VIEWS);

  it('这条守卫本身要扫到东西（路径写错时别悄悄放行）', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith('QuoteListView.vue'))).toBe(true);
  });

  it('UT-SEL-01: 选样衣的下拉都带 remote（本地过滤只能在前 100 条里找）', () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const b of selectBlocks(readFileSync(f, 'utf8'))) {
        if (!/\.sample_no\b/.test(b.body)) continue;          // 认「选样衣」的下拉
        if (!hasRemoteAttr(b.open)) bad.push(relative(VIEWS, f));
      }
    }
    expect(bad).toEqual([]);
  });

  it('UT-SEL-02: 选报价的下拉都带 remote', () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const b of selectBlocks(readFileSync(f, 'utf8'))) {
        if (!/\.quote_no\b/.test(b.body)) continue;
        if (!hasRemoteAttr(b.open)) bad.push(relative(VIEWS, f));
      }
    }
    expect(bad).toEqual([]);
  });

  it('UT-SEL-03: 带 remote 的都同时带 filterable 与 remote-method（缺一个就等于没改）', () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const b of selectBlocks(readFileSync(f, 'utf8'))) {
        if (!hasRemoteAttr(b.open)) continue;
        if (!/\bfilterable\b/.test(b.open) || !/remote-method/.test(b.open)) bad.push(relative(VIEWS, f));
      }
    }
    expect(bad).toEqual([]);
  });
});
