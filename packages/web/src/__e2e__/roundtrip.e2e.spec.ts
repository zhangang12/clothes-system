/**
 * 【真实往返】编辑页「打开 → 原样保存」在真后端 + 真数据上跑一遍（2026-09-22 起的发版前检查）。
 *
 * 背景：9-21 审查修复批的测试全是 mock，夹具是手写的理想化数据；上线后前端回传的字符串 ID
 * 被新 DTO 拒掉/转错，样衣 400、订单 500，业务一整天存不了单。这里不再手写「前端会发什么」：
 * 挂载**真实的编辑页**，让它通过**真实网络**从本地后端（灌了生产备份副本）加载单据，
 * 再调用页面**自己的 buildDto()** 组装请求、用页面自己的 API 发回去，记录后端的真实响应。
 *
 * 平时跳过；只有设置了 I9_E2E_MANIFEST（清单+本地令牌）与 I9_E2E_API 时才运行：
 *   I9_E2E_API=http://127.0.0.1:3110/api/v1 I9_E2E_MANIFEST=/path/manifest.json I9_E2E_OUT=/path/out.json \
 *     npx vitest run src/__e2e__/roundtrip.e2e.spec.ts
 * 只能指向**本地测试库**——它会真的写库。
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import { readFileSync, writeFileSync } from 'node:fs';
import { commonStubs } from '@/test-utils/el-stubs';

const API = process.env.I9_E2E_API;
const MANIFEST = process.env.I9_E2E_MANIFEST;
const OUT = process.env.I9_E2E_OUT;
const enabled = !!(API && MANIFEST && /127\.0\.0\.1|localhost/.test(API)); // 防手滑指向生产

vi.mock('element-plus', async (importOriginal) => {
  const mod = await importOriginal<any>();
  const stubs = await import('@/test-utils/el-stubs');
  return { ...mod, ElSelect: stubs.ElSelectStub, ElOption: stubs.ElOptionStub };
});
const mockRoute: any = { params: {}, query: {}, meta: {}, fullPath: '/', path: '/' };
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useRoute: () => mockRoute,
  onBeforeRouteLeave: vi.fn(),
}));

type Kind = 'samples' | 'orders' | 'quotes' | 'customers' | 'factories' | 'contracts';
const results: any[] = [];

describe.skipIf(!enabled)('真实往返：编辑页打开后原样保存（本地真库）', () => {
  let data: any;
  let http: any;
  let apis: any;
  beforeAll(async () => {
    data = JSON.parse(readFileSync(MANIFEST!, 'utf-8'));
    ({ http } = await import('@/api'));
    http.defaults.baseURL = API;
    http.defaults.adapter = 'http'; // jsdom 里默认走 XHR 会受 CORS 约束；测试直连 Node http
    http.defaults.timeout = 30000;
    apis = {
      samples: (await import('@/api/sample')).sampleApi,
      orders: (await import('@/api/order')).orderApi,
      quotes: (await import('@/api/quote')).quoteApi,
      customers: (await import('@/api/customer')).customerApi,
      factories: (await import('@/api/factory')).factoryApi,
      contracts: (await import('@/api/contract')).contractApi,
    };
  });

  const VIEWS: Record<Kind, { load: () => Promise<any>; loaded: (vm: any) => boolean }> = {
    samples: { load: () => import('@/views/sample/SampleEditView.vue'), loaded: (vm) => !!vm.form?.sampleNo },
    orders: { load: () => import('@/views/order/OrderEditView.vue'), loaded: (vm) => !!vm.form?.orderNo },
    quotes: { load: () => import('@/views/quote/QuoteEditView.vue'), loaded: (vm) => !!vm.form?.quoteNo },
    customers: { load: () => import('@/views/customer/CustomerEditView.vue'), loaded: (vm) => !!vm.form?.customerNo },
    factories: { load: () => import('@/views/factory/FactoryEditView.vue'), loaded: (vm) => !!(vm.form?.factoryNo || vm.form?.name) },
    contracts: { load: () => import('@/views/contract/ContractEditView.vue'), loaded: (vm) => !!vm.form?.contract_no },
  };

  for (const kind of Object.keys(VIEWS) as Kind[]) {
    it(`${kind}：逐张打开并原样保存`, async () => {
      const { useAuthStore } = await import('@/stores/auth');
      const View = (await VIEWS[kind].load()).default;
      for (const rec of data.manifest[kind] as Array<{ id: string; as: string }>) {
        localStorage.clear(); sessionStorage.clear();
        const who = data.tokens[rec.as] ?? data.tokens['1'];
        setActivePinia(createPinia());
        useAuthStore().setAuth({ access_token: who.token, role: who.role, real_name: who.real_name, menu_keys: who.menu_keys } as any);
        Object.assign(mockRoute, { params: { id: rec.id }, query: {}, meta: {}, fullPath: `/${kind}/${rec.id}/edit`, path: `/${kind}/${rec.id}/edit` });
        const row: any = { kind, id: rec.id, as: who.username, stage: 'load' };
        let w: any;
        try {
          w = mount(View, { global: { plugins: [ElementPlus], stubs: { ...commonStubs, FileUpload: true, RuleHint: true, DocLinks: true, PrintDesigner: true } } });
          await vi.waitFor(() => { if (!VIEWS[kind].loaded(w.vm)) throw new Error('not loaded'); }, { timeout: 15000, interval: 50 });
          await flushPromises();
          row.stage = 'build';
          const dto = (w.vm as any).buildDto();
          row.stage = 'save';
          await apis[kind].update(Number(rec.id), dto);
          row.ok = true;
        } catch (e: any) {
          row.ok = false;
          row.status = e?.response?.status ?? null;
          row.msg = e?.response?.data?.msg ?? e?.message ?? String(e);
        } finally {
          try { await flushPromises(); w?.unmount(); } catch { /* 卸载异常不影响结论 */ }
        }
        results.push(row);
      }
      if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
      expect(results.filter((r) => r.kind === kind).length).toBe(data.manifest[kind].length);
    }, 1800_000);
  }
});
