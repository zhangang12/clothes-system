import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defineComponent, h, reactive, ref, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import ElementPlus, { ElTable, ElTableColumn } from 'element-plus';

const mockRoute: any = { query: {} };
vi.mock('vue-router', () => ({ useRoute: () => mockRoute }));

import { useListState, useColumnWidths, clearListState } from '../listState';

/**
 * #139/#140（2026-09-15 EVA）：筛完款号进去改一张报价，关掉回来筛选条件、调过的列宽全没了。
 * 列表页每次切路由都会整体重建（MainLayout 的 :key="$route.fullPath"），这两个工具负责把手动调过的状态还原。
 */
function mountWithListState(setup: () => any) {
  const Comp = defineComponent({ setup() { setup(); return () => h('div'); } });
  return mount(Comp);
}

describe('useListState 记住筛选条件', () => {
  beforeEach(() => { sessionStorage.clear(); mockRoute.query = {}; });

  it('改过的筛选条件和日期范围，页面重建后还原', async () => {
    const first = mountWithListState(() => {
      const query = reactive({ page: 1, size: 20, style_no: '', status: undefined as string | undefined });
      const range = ref<[string, string] | null>(null);
      useListState('quotes', { query, range });
      query.style_no = 'LM'; query.page = 3; range.value = ['2026-09-01', '2026-09-15'];
      return { query, range };
    });
    await flushPromises();
    first.unmount();

    let restored: any;
    mountWithListState(() => {
      const query = reactive({ page: 1, size: 20, style_no: '', status: undefined as string | undefined });
      const range = ref<[string, string] | null>(null);
      useListState('quotes', { query, range });
      restored = { query, range };
      return {};
    });
    expect(restored.query.style_no).toBe('LM');
    expect(restored.query.page).toBe(3);
    expect(restored.range.value).toEqual(['2026-09-01', '2026-09-15']);
  });

  it('omit 的字段（只由跳转带入、页面上没输入框）不记，免得下次被看不见的条件过滤', async () => {
    const first = mountWithListState(() => {
      const q = reactive({ page: 1, reconcile_id: undefined as number | undefined, factory_id: undefined as number | undefined });
      useListState('payments', { q }, { omit: ['reconcile_id'] });
      q.reconcile_id = 88; q.factory_id = 5;
      return {};
    });
    await flushPromises();
    first.unmount();
    let q2: any;
    mountWithListState(() => {
      q2 = reactive({ page: 1, reconcile_id: undefined as number | undefined, factory_id: undefined as number | undefined });
      useListState('payments', { q: q2 }, { omit: ['reconcile_id'] });
      return {};
    });
    expect(q2.factory_id).toBe(5);
    expect(q2.reconcile_id).toBeUndefined();
  });

  it('从别的单据带参数跳过来时不还原，以跳转为准', async () => {
    sessionStorage.setItem('i9.list.contracts', JSON.stringify({ query: { keyword: '旧关键词' } }));
    mockRoute.query = { open: '12' };
    let q: any;
    mountWithListState(() => { q = reactive({ keyword: '' }); useListState('contracts', { query: q }); return {}; });
    expect(q.keyword).toBe('');
  });

  it('存档里多出来的旧字段不会塞进 query', () => {
    sessionStorage.setItem('i9.list.orders', JSON.stringify({ query: { keyword: 'A', removed_field: 'x' } }));
    let q: any;
    mountWithListState(() => { q = reactive({ keyword: '' }); useListState('orders', { query: q }); return {}; });
    expect(q.keyword).toBe('A');
    expect('removed_field' in q).toBe(false);
  });

  it('B144 clearListState 只清 i9.list.*，页签与列宽不动', () => {
    sessionStorage.setItem('i9.list.orders', JSON.stringify({ query: { keyword: 'A' } }));
    sessionStorage.setItem('i9.list.quotes', JSON.stringify({ query: { keyword: 'B' } }));
    sessionStorage.setItem('i9.tabs', '[]');
    localStorage.setItem('i9.colw.orders', '{"款号":200}');
    clearListState();
    expect(sessionStorage.getItem('i9.list.orders')).toBeNull();
    expect(sessionStorage.getItem('i9.list.quotes')).toBeNull();
    expect(sessionStorage.getItem('i9.tabs')).toBe('[]');
    expect(localStorage.getItem('i9.colw.orders')).toBe('{"款号":200}');
  });

  it('B144 清过之后页面重建就是干净的，不会还原上一个人的筛选', async () => {
    const first = mountWithListState(() => {
      const query = reactive({ page: 1, keyword: '' });
      useListState('orders', { query });
      query.keyword = '上一个人的款号'; query.page = 3;
      return {};
    });
    await flushPromises();
    first.unmount();
    clearListState();

    let q: any;
    mountWithListState(() => { q = reactive({ page: 1, keyword: '' }); useListState('orders', { query: q }); return {}; });
    expect(q.keyword).toBe('');
    expect(q.page).toBe(1);
  });
});

describe('useColumnWidths 记住列宽（真 el-table）', () => {
  beforeEach(() => localStorage.clear());

  function mountTable() {
    let api: any;
    const Comp = defineComponent({
      setup() {
        api = useColumnWidths('quotes');
        return () => h(ElTable, { ref: api.tableRef, data: [{ a: 1 }], onHeaderDragend: api.onHeaderDragend }, () => [
          h(ElTableColumn, { type: 'selection', width: 42 }),
          h(ElTableColumn, { label: '报价单号', prop: 'a', width: 150 }),
          h(ElTableColumn, { label: '客户款号', prop: 'a', minWidth: 120 }),
        ]);
      },
    });
    const w = mount(Comp, { global: { plugins: [ElementPlus] } });
    return { w, api: () => api };
  }
  const colsOf = (api: any) => api.tableRef.value.store.states.columns.value as any[];

  it('拖过的列宽写进本地；重新打开页面时按表头文字套回去，没拖过的列不动', async () => {
    const one = mountTable();
    await flushPromises(); await nextTick();
    const col = colsOf(one.api()).find((c) => c.label === '客户款号');
    one.api().onHeaderDragend(260, 120, col);
    one.w.unmount();
    expect(JSON.parse(localStorage.getItem('i9.colw.quotes')!)).toEqual({ 客户款号: 260 });

    const two = mountTable();
    await flushPromises(); await nextTick();
    const cols = colsOf(two.api());
    expect(cols.find((c) => c.label === '客户款号').width).toBe(260);
    expect(cols.find((c) => c.label === '报价单号').width).toBe(150);
  });

  it('没有表头文字的列（勾选列）拖了也不记', async () => {
    const one = mountTable();
    await flushPromises(); await nextTick();
    const sel = colsOf(one.api()).find((c) => c.type === 'selection');
    one.api().onHeaderDragend(80, 42, sel);
    expect(localStorage.getItem('i9.colw.quotes')).toBeNull();
  });
});
