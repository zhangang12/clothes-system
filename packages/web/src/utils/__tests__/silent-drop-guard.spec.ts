import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 源码守卫：**保存时按条件丢整行的地方，必须先提示**。
 *
 * 一周之内同一类问题踩了五次：合同货物明细、报价明细、样衣材料、客户联系人/银行/快递、
 * 出口发票款项——都是「界面让你填，保存时一个 filter 把行悄悄扔掉，还提示保存成功」。
 * 靠"下次仔细点"防不住，所以钉一条守卫：**凡是在保存载荷里对集合做 filter 丢行的文件，
 * 必须同时用上 lineCheck 里的提示函数**（checkGoodsLines / halfFilledRows / droppedButFilledRows）。
 *
 * 命中新文件时不要直接把它加进白名单——先想清楚"这一行被丢掉，用户知不知情"。
 */
const VIEWS = join(process.cwd(), 'src', 'views');

// 这些 filter 不是"丢用户填的行"：删除选中行、纯展示过滤等
const ALLOW = /selected|selItems|selMats|selFees|selectedLines|selectedRounds|\.filter\(Boolean\)/;

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? vueFiles(p) : (n.endsWith('.vue') ? [p] : []);
  });
}

/** 取 buildDto 之类函数体 + create/update 调用前后，作为"保存载荷"范围 */
function payloadRegions(src: string): string {
  const out: string[] = [];
  const re = /function\s+build\w*\s*\([^)]*\)\s*[^{;]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1; let j = m.index + m[0].length;
    while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
    out.push(src.slice(m.index, j));
  }
  const re2 = /\.(create|update)\(/g;
  while ((m = re2.exec(src))) out.push(src.slice(Math.max(0, m.index - 1800), m.index + 400));
  return out.join('\n');
}

describe('静默丢行守卫', () => {
  const files = vueFiles(VIEWS);

  it('守卫本身要扫得到东西', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('UT-SD-01: 保存时丢行的页面，都要先提示用户', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const pay = payloadRegions(src);
      if (!pay) continue;
      // 找"对集合做 filter 后仍参与提交"的写法
      const drops = [...pay.matchAll(/(\w[\w.]*)\.filter\(\(([^)]*)\)\s*=>\s*([^\n]{0,100})/g)]
        .filter((mm) => !ALLOW.test(mm[0]));
      if (!drops.length) continue;
      const warned = /checkGoodsLines|halfFilledRows|droppedButFilledRows/.test(src);
      if (!warned) offenders.push(relative(VIEWS, f));
    }
    expect(offenders).toEqual([]);
  });
});
