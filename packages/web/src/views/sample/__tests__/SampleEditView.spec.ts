import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import SampleEditView from '../SampleEditView.vue';
import { commonStubs } from '@/test-utils/el-stubs';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

// ── Mock vue-router(写法同 PaymentListView.spec):编辑页按 :id 装载 ──
const mockPush = vi.fn();
const mockRoute: any = { params: { id: '7' }, query: {}, meta: {} };
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => mockRoute,
}));

// ── API mocks ────────────────────────────────────────────────────────────────
const mockSampleGet = vi.fn();
const mockVersionHistory = vi.fn().mockResolvedValue({ data: [] });
const mockListPatternmakers = vi.fn();
vi.mock('@/api/sample', () => ({
  sampleApi: {
    get: (...a: any[]) => mockSampleGet(...a),
    getVersionHistory: (...a: any[]) => mockVersionHistory(...a),
    listPatternmakers: (...a: any[]) => mockListPatternmakers(...a),
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

const mockFactorySelect = vi.fn().mockResolvedValue({ data: [] });
vi.mock('@/api/factory', () => ({
  factoryApi: { select: (...a: any[]) => mockFactorySelect(...a) },
}));

vi.mock('@/api/quote', () => ({
  quoteApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
}));

// ── Fixtures:bigint 主键经 mysql2 出来是字符串,这里全部按真实响应给字符串 id ──
const makeDetail = () => ({
  id: '7', sample_no: 'S-20260719-001', categories: '上衣', customer_id: '42', style_no: 'ST-001',
  buyer_id: '77', patternmaker_id: '55', patternmaker_name: '老张', status: 'PENDING',
  materials: [], shipRounds: [],
});

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setAuth({ access_token: 'tok', role: UserRole.ADMIN, real_name: '测试用户' });
  return mount(SampleEditView, {
    global: {
      plugins: [pinia, ElementPlus],
      stubs: { ...commonStubs, FileUpload: true, RuleHint: true, DocLinks: true },
    },
  });
}

describe('SampleEditView', () => {
  beforeEach(() => {
    mockSampleGet.mockResolvedValue({ data: makeDetail() });
    mockListPatternmakers.mockResolvedValue({ data: [{ id: '55', username: 'pm_zhang', real_name: '老张' }] });
    mockCustomerList.mockImplementation((_p?: any) => Promise.resolve({
      data: _p?.type === 'MIDDLEMAN'
        ? [{ id: '42', customer_no: 'C42', name: '甲中间商' }]
        : [{ id: '77', customer_no: 'B77', name: '乙买家' }],
    }));
    mockCustomerGet.mockImplementation((id: number) => Promise.resolve({
      data: id === 42
        ? { id: '42', customer_no: 'C42', name: '甲中间商' }
        : { id: '77', customer_no: 'B77', name: '乙买家' },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockRoute.params = { id: '7' };
    mockRoute.query = {};
  });

  // ── L12:制版师下拉选项 id 归一成数字,与 Number(patternmaker_id) 回显值同型 ──
  it('L12: 制版师选项 id 归一为数字,回显值与选项严格相等(不再 5 !== "5" 失配)', async () => {
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAllComponents({ name: 'ElOption' }).some((o) => o.text() === '老张')).toBe(true);
    });

    const pmOption = wrapper.findAllComponents({ name: 'ElOption' }).find((o) => o.text() === '老张')!;
    expect(pmOption.props('value')).toBe(55); // 选项 id 已 Number() 归一(惯例同 FactorySelect)

    // 回显值(load 里 Number(d.patternmaker_id))与选项严格相等 → el-select 能匹配,不回显裸 ID
    const pmSelect = wrapper.findAllComponents({ name: 'ElSelect' }).find((s) => s.props('modelValue') === 55);
    expect(pmSelect).toBeTruthy();
  });

  // ── L24:当前选中值已在选项里时,不重复按 id 补拉 ──
  it('L24: 选中值已在 size:100 选项内时不再单独补拉客户', async () => {
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAllComponents({ name: 'ElOption' }).some((o) => o.text().includes('甲中间商'))).toBe(true);
    });
    expect(mockCustomerGet).not.toHaveBeenCalled();
  });

  // ── L24:选项被 size:100 截断(当前值不在前 100 条)时,按 id 单独补拉入选项 ──
  it('L24: 选项截断缺失当前值时按 id 补拉,中间商/买家不回显裸 ID', async () => {
    mockCustomerList.mockResolvedValue({ data: [] }); // 模拟超 100 条后当前值不在首页选项
    const wrapper = mountView();

    await vi.waitFor(() => {
      expect(mockCustomerGet).toHaveBeenCalledWith(42);
      expect(mockCustomerGet).toHaveBeenCalledWith(77);
    });
    await vi.waitFor(() => {
      const texts = wrapper.findAllComponents({ name: 'ElOption' }).map((o) => o.text());
      expect(texts.some((t) => t.includes('甲中间商'))).toBe(true);
      expect(texts.some((t) => t.includes('乙买家'))).toBe(true);
    });
  });

  // ── L24:补拉失败(机密未授权 404/记录已删)不阻断页面,维持修复前行为 ──
  it('L24: 补拉失败时页面照常装载,不抛错', async () => {
    mockCustomerList.mockResolvedValue({ data: [] });
    mockCustomerGet.mockRejectedValue(new Error('404'));
    const wrapper = mountView();
    await vi.waitFor(() => expect(mockCustomerGet).toHaveBeenCalled());
    await vi.waitFor(() => expect(wrapper.text()).toContain('S-20260719-001'));
  });
});
