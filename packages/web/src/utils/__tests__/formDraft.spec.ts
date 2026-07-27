import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reactive } from 'vue';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { useFormDraft } from '../formDraft';
import { ElMessageBox } from 'element-plus';

// localStorage mock
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
vi.stubGlobal('localStorage', localStorageMock);

function mountWithDraft(form: any, key = '/samples/new') {
  let draft!: ReturnType<typeof useFormDraft>;
  const Comp = defineComponent({
    setup() { draft = useFormDraft(key, form); return () => h('div'); },
  });
  const wrapper = mount(Comp);
  return { wrapper, draft: () => draft };
}

describe('useFormDraft 表单本地草稿', () => {
  beforeEach(() => { localStorageMock.clear(); vi.restoreAllMocks(); });

  it('输入后防抖自动写入 localStorage', async () => {
    vi.useFakeTimers();
    const form = reactive({ a: 'x', items: [{ n: 1 }] });
    mountWithDraft(form);
    form.a = '改动';
    form.items.push({ n: 2 });
    await vi.advanceTimersByTimeAsync(900);
    const raw = store['i9.draft./samples/new'];
    expect(raw).toBeTruthy();
    const entry = JSON.parse(raw);
    expect(entry.data.a).toBe('改动');
    expect(entry.data.items).toHaveLength(2);
    expect(entry.t).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it('restorePrompt 选「恢复」→ 草稿回填表单', async () => {
    const form = reactive({ a: '', b: '' });
    const { draft } = mountWithDraft(form);
    store['i9.draft./samples/new'] = JSON.stringify({ t: Date.now(), data: { a: '存的内容', b: '第二字段' } });
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(true as any);
    await draft().restorePrompt();
    expect(form.a).toBe('存的内容');
    expect(form.b).toBe('第二字段');
  });

  it('restorePrompt 选「丢弃」→ 清除草稿不回填', async () => {
    const form = reactive({ a: '' });
    const { draft } = mountWithDraft(form);
    store['i9.draft./samples/new'] = JSON.stringify({ t: Date.now(), data: { a: '旧草稿' } });
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('cancel'));
    await draft().restorePrompt();
    expect(form.a).toBe('');
    expect(store['i9.draft./samples/new']).toBeUndefined();
  });

  it('无草稿时 restorePrompt 直接返回不弹窗', async () => {
    const form = reactive({ a: '' });
    const { draft } = mountWithDraft(form);
    const spy = vi.spyOn(ElMessageBox, 'confirm');
    await draft().restorePrompt();
    expect(spy).not.toHaveBeenCalled();
  });

  it('clear() 清除草稿（保存成功后调用）', () => {
    const form = reactive({ a: 'x' });
    const { draft } = mountWithDraft(form);
    store['i9.draft./samples/new'] = JSON.stringify({ t: 1, data: { a: 'x' } });
    draft().clear();
    expect(store['i9.draft./samples/new']).toBeUndefined();
  });

  it('不同路由 key 草稿互不干扰', async () => {
    vi.useFakeTimers();
    const f1 = reactive({ v: '样衣' });
    const f2 = reactive({ v: '报价' });
    mountWithDraft(f1, '/samples/1/edit');
    mountWithDraft(f2, '/quotes/2/edit');
    f1.v = '样衣改'; f2.v = '报价改';
    await vi.advanceTimersByTimeAsync(900);
    expect(JSON.parse(store['i9.draft./samples/1/edit']).data.v).toBe('样衣改');
    expect(JSON.parse(store['i9.draft./quotes/2/edit']).data.v).toBe('报价改');
    vi.useRealTimers();
  });

  it('卸载时兜底写一次（误关页面前数据不丢）', async () => {
    const form = reactive({ a: '最后编辑' });
    const { wrapper } = mountWithDraft(form);
    form.a = '卸载前的值';
    wrapper.unmount();
    const raw = store['i9.draft./samples/new'];
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw).data.a).toBe('卸载前的值');
  });

  it('clear() 后卸载不再写回（保存成功离开页面草稿不复活）', async () => {
    vi.useFakeTimers();
    const form = reactive({ a: 'x' });
    const { wrapper, draft } = mountWithDraft(form);
    form.a = '改动过';
    await vi.advanceTimersByTimeAsync(900);
    draft().clear(); // 模拟保存成功
    form.a = '保存后又打字（不应入草稿）';
    wrapper.unmount();
    expect(store['i9.draft./samples/new']).toBeUndefined();
    vi.useRealTimers();
  });

  it('hooks：多对象表单（form+terms）快照与自定义恢复', async () => {
    vi.useFakeTimers();
    const form = reactive({ a: '' });
    const terms = reactive({ t1: '' });
    let draft!: ReturnType<typeof useFormDraft>;
    const Comp = defineComponent({
      setup() {
        draft = useFormDraft('multi', form, {
          snapshot: () => ({ form: JSON.parse(JSON.stringify(form)), terms: { ...terms } }),
          restore: (d) => { Object.assign(form, d.form ?? {}); Object.assign(terms, d.terms ?? {}); },
        });
        return () => h('div');
      },
    });
    mount(Comp);
    form.a = '主表改动';
    terms.t1 = '条款改动'; // 副对象改动同样触发落盘
    await vi.advanceTimersByTimeAsync(900);
    const entry = JSON.parse(store['i9.draft.multi']);
    expect(entry.data.form.a).toBe('主表改动');
    expect(entry.data.terms.t1).toBe('条款改动');
    // 恢复
    form.a = ''; terms.t1 = '';
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(true as any);
    await draft!.restorePrompt();
    expect(form.a).toBe('主表改动');
    expect(terms.t1).toBe('条款改动');
    vi.useRealTimers();
  });
});
