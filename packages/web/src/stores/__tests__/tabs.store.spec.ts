import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTabsStore } from '../tabs';

// 只取 open() 用到的字段
const route = (fullPath: string, title?: string, id?: string) =>
  ({ fullPath, meta: title ? { title } : {}, params: id ? { id } : {} } as any);

describe('页签 store', () => {
  beforeEach(() => { sessionStorage.clear(); setActivePinia(createPinia()); });

  it('默认只有工作台，且工作台关不掉', () => {
    const t = useTabsStore();
    expect(t.tabs).toEqual([{ path: '/dashboard', title: '工作台' }]);
    expect(t.close('/dashboard')).toBe('/dashboard');
    expect(t.tabs).toHaveLength(1);
  });

  it('登记页签：同一路径不重复，无标题的路由不进页签', () => {
    const t = useTabsStore();
    t.open(route('/orders', '订单管理'));
    t.open(route('/orders', '订单管理'));
    t.open(route('/login'));
    expect(t.tabs.map((x) => x.path)).toEqual(['/dashboard', '/orders']);
  });

  it('同一编辑页的不同单据是两个页签，标题带编号', () => {
    const t = useTabsStore();
    t.open(route('/orders/1/edit', '编辑订单', '1'));
    t.open(route('/orders/2/edit', '编辑订单', '2'));
    expect(t.tabs.map((x) => x.title)).toEqual(['工作台', '编辑订单 #1', '编辑订单 #2']);
  });

  it('关闭页签后落到右邻，右邻没有则落到左邻', () => {
    const t = useTabsStore();
    t.open(route('/orders', '订单管理'));
    t.open(route('/contracts', '合同管理'));
    expect(t.close('/orders')).toBe('/contracts');   // 右邻
    expect(t.close('/contracts')).toBe('/dashboard'); // 已无右邻 → 左邻
  });

  it('关闭其他 / 关闭全部 都保留工作台', () => {
    const t = useTabsStore();
    t.open(route('/orders', '订单管理'));
    t.open(route('/contracts', '合同管理'));
    t.closeOthers('/contracts');
    expect(t.tabs.map((x) => x.path)).toEqual(['/dashboard', '/contracts']);
    expect(t.closeAll()).toBe('/dashboard');
    expect(t.tabs).toHaveLength(1);
  });

  it('刷新后页签还在：写入 sessionStorage，新 store 从中恢复', () => {
    const t = useTabsStore();
    t.open(route('/orders', '订单管理'));
    expect(JSON.parse(sessionStorage.getItem('i9.tabs')!)).toHaveLength(2);
    // 模拟刷新：重建 pinia，store 应从 sessionStorage 恢复
    setActivePinia(createPinia());
    expect(useTabsStore().tabs.map((x) => x.path)).toEqual(['/dashboard', '/orders']);
  });

  it('sessionStorage 是脏数据时兜底回默认，不炸', () => {
    sessionStorage.setItem('i9.tabs', '{不是JSON');
    setActivePinia(createPinia());
    expect(useTabsStore().tabs).toEqual([{ path: '/dashboard', title: '工作台' }]);
  });

  it('退出登录清空页签，不留给下一个账号', () => {
    const t = useTabsStore();
    t.open(route('/orders', '订单管理'));
    t.reset();
    expect(t.tabs).toHaveLength(1);
    expect(sessionStorage.getItem('i9.tabs')).toBeNull();
  });

  it('超过上限挤掉最早的非当前页签，工作台不被挤掉', () => {
    const t = useTabsStore();
    for (let i = 1; i <= 15; i++) t.open(route(`/orders/${i}/edit`, '编辑订单', String(i)));
    expect(t.tabs).toHaveLength(12);
    expect(t.tabs[0].path).toBe('/dashboard');           // 工作台还在
    // 取末位不用 Array.at：那是 ES2022，本包 tsconfig 的 lib 停在 ES2020，vue-tsc 会报 TS2550
    expect(t.tabs[t.tabs.length - 1].path).toBe('/orders/15/edit'); // 最新的在
  });
});
