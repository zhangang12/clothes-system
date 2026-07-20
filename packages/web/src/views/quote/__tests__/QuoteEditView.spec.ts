import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import QuoteEditView from '../QuoteEditView.vue';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';
import { commonStubs } from '@/test-utils/el-stubs';

// DictSelect 在 script 里直接 h(ElSelect)/h(ElOption)，绕开模板 stub → 模块级替身（与 commonStubs 同款）
vi.mock('element-plus', async (importOriginal) => {
  const mod = await importOriginal<any>();
  const stubs = await import('@/test-utils/el-stubs');
  return { ...mod, ElSelect: stubs.ElSelectStub, ElOption: stubs.ElOptionStub };
});

// ── Mock vue-router：编辑态 :id=7 ───────────────────────────────────────────
const mockPush = vi.fn();
const mockRoute: any = { params: { id: '7' }, query: {}, meta: {} };
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => mockRoute,
}));

// ── API mock ────────────────────────────────────────────────────────────────
const mockQuoteGet = vi.fn();
vi.mock('@/api/quote', () => ({
  quoteApi: {
    get: (...a: any[]) => mockQuoteGet(...a),
    create: vi.fn(),
    update: vi.fn(),
    copy: vi.fn(),
    submit: vi.fn(),
    adjust: vi.fn(),
    toContract: vi.fn(),
    importFromSample: vi.fn(),
  },
}));
const mockCustomerList = vi.fn();
const mockCustomerGet = vi.fn();
vi.mock('@/api/customer', () => ({
  customerApi: {
    list: (...a: any[]) => mockCustomerList(...a),
    get: (...a: any[]) => mockCustomerGet(...a),
  },
}));
const mockSampleList = vi.fn();
const mockSampleGet = vi.fn();
vi.mock('@/api/sample', () => ({
  sampleApi: {
    list: (...a: any[]) => mockSampleList(...a),
    get: (...a: any[]) => mockSampleGet(...a),
  },
}));
vi.mock('@/api/company', () => ({ companyApi: { getDefault: vi.fn() } }));
vi.mock('@/api/dict', () => ({ dictApi: { list: vi.fn() } }));

// 报价详情：中间商 999 / 买家 888 / 样衣 777 均不在前 100 条选项里（size:100 截断场景）
const detail = {
  id: 7, quote_no: 'Q-20260719-001', customer_id: 999, buyer_id: 888, sample_id: 777,
  inquiry_date: '2026-07-01', currency: 'USD', exchange_rate: 7, status: 'DRAFT',
  items: [], fees: [], related_orders: [],
};

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setAuth({ access_token: 'tok', role: UserRole.ADMIN, real_name: '测试用户' });
  return mount(QuoteEditView, {
    global: {
      plugins: [pinia, ElementPlus],
      stubs: { ...commonStubs, FileUpload: true, RuleHint: true, DocLinks: true },
    },
  });
}

describe('QuoteEditView 下拉截断回显(L24)', () => {
  beforeEach(() => {
    mockCustomerList.mockResolvedValue({ data: [{ id: 1, customer_no: 'C-001', name: '在列客户' }], total: 200 });
    mockSampleList.mockResolvedValue({ data: [{ id: 1, sample_no: 'S-001', style_no: 'ST-001' }], total: 200 });
    mockQuoteGet.mockResolvedValue({ data: detail });
    mockCustomerGet.mockImplementation((id: number) => Promise.resolve({
      data: id === 999
        ? { id: 999, customer_no: 'C-999', name: '截断中间商', contacts: [] }
        : { id: 888, customer_no: 'C-888', name: '截断买家', contacts: [] },
    }));
    mockSampleGet.mockResolvedValue({ data: { id: 777, sample_no: 'S-777', style_no: 'ST-777' } });
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockRoute.params = { id: '7' };
    mockRoute.meta = {};
  });

  it('当前值不在前 100 条选项时按 id 补拉并入选项，不回显裸 ID', async () => {
    const wrapper = mountView();
    // 买家补拉是本修复独有：修复前没有任何代码按 buyer_id 拉详情
    await vi.waitFor(() => expect(mockCustomerGet).toHaveBeenCalledWith(888));
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('C-999 · 截断中间商');
      expect(wrapper.text()).toContain('C-888 · 截断买家');
      expect(wrapper.text()).toContain('S-777 · ST-777');
    });
  });

  it('当前值已在选项里时不额外补拉（loadContacts 的 get(1) 除外）', async () => {
    mockQuoteGet.mockResolvedValue({ data: { ...detail, customer_id: 1, buyer_id: 1, sample_id: 1 } });
    const wrapper = mountView();
    await vi.waitFor(() => expect(wrapper.text()).toContain('Q-20260719-001'));
    // 让挂载流程的剩余微任务跑完再断言“没有多余拉取”
    await new Promise((r) => setTimeout(r, 0));
    // customerApi.get 只会因 loadContacts(1) 被调，绝不按缺失 id 补拉
    expect(mockCustomerGet.mock.calls.every((c) => c[0] === 1)).toBe(true);
    // 样衣 1 已在选项里且有 sample_no → loadSampleNo/补拉都不发请求
    expect(mockSampleGet).not.toHaveBeenCalled();
  });
});
