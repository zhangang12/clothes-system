/**
 * 【真实往返·版师保存】以版师身份挂载真实的样衣编辑页，走页面自己的 savePatternmaker() 发到本地后端（生产备份副本）。
 * 与 roundtrip.e2e.spec.ts 同一套开关，平时跳过；只能指向本地测试库——它会真的写库。
 *   I9_E2E_API=http://127.0.0.1:3110/api/v1 I9_E2E_MANIFEST=/path/manifest.json I9_E2E_PM="152:16,149:17" I9_E2E_OUT=/path/out.json \
 *     npx vitest run src/__e2e__/patternmaker.e2e.spec.ts
 * I9_E2E_PM：「样衣 id:版师账号在 manifest.tokens 里的键」，逗号分隔。
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import { readFileSync, writeFileSync } from 'node:fs';
import { commonStubs } from '@/test-utils/el-stubs';

const API = process.env.I9_E2E_API;
const MANIFEST = process.env.I9_E2E_MANIFEST;
const PM = process.env.I9_E2E_PM;
const OUT = process.env.I9_E2E_OUT;
const enabled = !!(API && MANIFEST && PM && /127\.0\.0\.1|localhost/.test(API)); // 防手滑指向生产

vi.mock('element-plus', async (importOriginal) => {
  const mod = await importOriginal<any>();
  const stubs = await import('@/test-utils/el-stubs');
  // 「实际耗用尚未填写，确认保存？」一律确认——测的是保存本身
  return { ...mod, ElSelect: stubs.ElSelectStub, ElOption: stubs.ElOptionStub, ElMessageBox: { ...mod.ElMessageBox, confirm: vi.fn().mockResolvedValue('confirm') } };
});
const mockRoute: any = { params: {}, query: {}, meta: {}, fullPath: '/', path: '/' };
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useRoute: () => mockRoute,
  onBeforeRouteLeave: vi.fn(),
}));

describe.skipIf(!enabled)('真实往返：版师打开样衣原样保存（本地真库）', () => {
  let data: any;
  beforeAll(async () => {
    data = JSON.parse(readFileSync(MANIFEST!, 'utf-8'));
    const { http } = await import('@/api');
    http.defaults.baseURL = API;
    http.defaults.adapter = 'http';
    http.defaults.timeout = 30000;
  });

  it('逐张以版师身份保存', async () => {
    const { useAuthStore } = await import('@/stores/auth');
    const { sampleApi } = await import('@/api/sample');
    const View = (await import('@/views/sample/SampleEditView.vue')).default;
    const results: any[] = [];
    for (const pair of PM!.split(',')) {
      const [id, as] = pair.split(':');
      localStorage.clear(); sessionStorage.clear();
      const who = data.tokens[as];
      setActivePinia(createPinia());
      useAuthStore().setAuth({ access_token: who.token, role: who.role, real_name: who.real_name, menu_keys: who.menu_keys } as any);
      Object.assign(mockRoute, { params: { id }, query: {}, meta: {}, fullPath: `/samples/${id}/edit`, path: `/samples/${id}/edit` });
      const row: any = { id, as: who.username, stage: 'load' };
      const spy = vi.spyOn(sampleApi, 'patternmakerSave');
      let w: any;
      try {
        w = mount(View, { global: { plugins: [ElementPlus], stubs: { ...commonStubs, FileUpload: true, RuleHint: true, DocLinks: true, PrintDesigner: true } } });
        await vi.waitFor(() => { if (!w.vm.form?.sampleNo) throw new Error('not loaded'); }, { timeout: 15000, interval: 50 });
        await flushPromises();
        row.stage = 'save';
        await w.vm.savePatternmaker();
        await flushPromises();
        const call = spy.mock.calls.at(-1);
        row.sent = call ? call[1] : null;
        const res = spy.mock.results.at(-1);
        if (res) await res.value;
        row.ok = !!call;
      } catch (e: any) {
        row.ok = false;
        row.status = e?.response?.status ?? null;
        row.msg = e?.response?.data?.msg ?? e?.message ?? String(e);
      } finally {
        spy.mockRestore();
        try { await flushPromises(); w?.unmount(); } catch { /* 卸载异常不影响结论 */ }
      }
      results.push(row);
    }
    if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
    expect(results.length).toBe(PM!.split(',').length);
  }, 600_000);
});
