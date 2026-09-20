import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * B138：贸易国别输「美」回车 → 选中的是新建的「美」而不是已有的「美国」，
 * 并立刻 dictApi.create 写进**全员**字典。根因是 allow-create + default-first-option：
 * 高亮永远落在「新建：美」那一项上，回车即新建。去掉 default-first-option，
 * 回车只选高亮项；要新建得点下拉里那一行。
 */
const RAW = readFileSync(join(process.cwd(), 'src', 'components', 'DictSelect.vue'), 'utf8');
// 去掉 HTML 注释再比对：注释里写着「为什么不加 default-first-option」，不能让它把守卫弄绿/弄红
const SRC = RAW.replace(/<!--[\s\S]*?-->/g, '');

describe('DictSelect 不再「输入片段回车就新建脏字典项」（B138）', () => {
  it('B138 模板里没有 default-first-option', () => {
    expect(SRC).not.toMatch(/default-first-option/);
  });

  it('B138 allow-create 保留（确实要能新建，只是不再靠回车误触）', () => {
    expect(SRC).toMatch(/allow-create/);
    expect(SRC).toMatch(/filterable/);
  });

  it('B138 占位文案不再说「回车创建新值」——那正是误操作的来源', () => {
    expect(SRC).not.toMatch(/回车创建新值/);
    expect(SRC).toMatch(/点选创建/);
  });

  it('守卫本身扫得到文件、且注释确实被剥掉了（路径写错时别悄悄变绿）', () => {
    expect(SRC).toContain('dictApi');
    expect(RAW).toMatch(/default-first-option/); // 注释里有
    expect(SRC).not.toMatch(/default-first-option/); // 剥掉注释后没有
  });
});
