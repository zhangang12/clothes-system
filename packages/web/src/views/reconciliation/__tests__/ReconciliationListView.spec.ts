import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus, { ElMessage } from 'element-plus';
import ReconciliationListView from '../ReconciliationListView.vue';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';
import { commonStubs } from '@/test-utils/el-stubs';

// ── Mock vue-router ─────────────────────────────────────────────────────────
// 组件用 useRoute 读 :id / query 决定是否自动打开详情；不 mock 的话 useRoute() 返回
// undefined，onMounted 里读 route.params 会抛（写法同 LoginView.spec）。
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRoute: any = { params: {}, query: {} };
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useRoute: () => mockRoute,
}));

// ── API mock ────────────────────────────────────────────────────────────────
const mockList = vi.fn();
const mockGet = vi.fn();
const mockCreate = vi.fn();
const mockConfirm = vi.fn();
const mockRemove = vi.fn();
const mockSubmit = vi.fn();
const mockSampleList = vi.fn();

// 样衣（工时对账候选池）、合同、付款申请此前没打桩，测试里会真的发请求（jsdom XHR 报错噪音）
vi.mock('@/api/sample', () => ({ sampleApi: { list: (...a: any[]) => mockSampleList(...a) } }));
vi.mock('@/api/contract', () => ({ contractApi: { byStyle: vi.fn().mockResolvedValue({ data: [] }) } }));
const mockPRListForLinks = vi.fn().mockResolvedValue({ data: [] });
vi.mock('@/api/payment', () => ({ paymentRequestApi: { list: (...a: any[]) => mockPRListForLinks(...a) } }));

vi.mock('@/api/reconciliation', () => ({
  reconciliationApi: {
    list: (...a: any[]) => mockList(...a),
    get: (...a: any[]) => mockGet(...a),
    create: (...a: any[]) => mockCreate(...a),
    confirm: (...a: any[]) => mockConfirm(...a),
    remove: (...a: any[]) => mockRemove(...a),
    submit: (...a: any[]) => mockSubmit(...a),
    generateLabor: vi.fn().mockResolvedValue({}),
    updateDraft: vi.fn().mockResolvedValue({}),
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────
const makeItem = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  reconcile_no: 'RC-2024-001',
  type: 'CONTRACT',
  factory_id: 10,
  total_amount: '5000.00',
  tax_rate: 13,
  tax_amount: '650.00',
  has_invoice: true,
  status: 'DRAFT',
  created_at: '2024-01-01 10:00:00',
  ...overrides,
});

function mountView(role: UserRole) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setAuth({ access_token: 'tok', role, real_name: '测试用户' });

  return mount(ReconciliationListView, {
    global: {
      plugins: [pinia, ElementPlus],
      stubs: commonStubs,
    },
  });
}

describe('ReconciliationListView', () => {
  beforeEach(() => {
    mockList.mockResolvedValue({ data: [], total: 0 });
    mockGet.mockResolvedValue({});
    mockCreate.mockResolvedValue({});
    mockConfirm.mockResolvedValue({});
    mockRemove.mockResolvedValue({});
    mockSubmit.mockResolvedValue({});
    mockSampleList.mockResolvedValue({ data: [], total: 0 });
    mockPRListForLinks.mockClear();
    mockPRListForLinks.mockResolvedValue({ data: [] });
    vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ id: '' } as any));
    vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ id: '' } as any));
    vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ id: '' } as any));
  });

  afterEach(() => {
    vi.clearAllMocks();
    // 用例会改 mockRoute，不复位会串味
    mockRoute.params = {};
    mockRoute.query = {};
  });

  // ─────────────────────────────────────── basic render & list loading
  it('calls reconciliationApi.list on mount', async () => {
    mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
  });

  it('renders rows returned by the API (row count and action buttons)', async () => {
    const items = [
      makeItem({ id: 1, status: 'DRAFT' }),
      makeItem({ id: 2, status: 'CONFIRMED' }),
    ];
    mockList.mockResolvedValue({ data: items, total: 2 });

    const wrapper = mountView(UserRole.ADMIN);
    // Each row renders a "详情" button in its #default scoped slot
    await vi.waitFor(() => {
      const detailBtns = wrapper.findAll('button').filter((b) => b.text() === '详情');
      expect(detailBtns).toHaveLength(2);
    });
  });

  // ───────────────────────────────────── "新建对账单" button visibility
  it('shows "新建对账单" button for ADMIN', async () => {
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(wrapper.text()).toContain('新建对账单');
  });

  it('shows "新建对账单" button for FINANCE', async () => {
    const wrapper = mountView(UserRole.FINANCE);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(wrapper.text()).toContain('新建对账单');
  });

  it('shows "新建对账单" button for BUSINESS (业务员可新建·补充确认v1.1)', async () => {
    const wrapper = mountView(UserRole.BUSINESS);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(wrapper.text()).toContain('新建对账单');
  });

  it('hides "新建对账单" button for PATTERNMAKER', async () => {
    const wrapper = mountView(UserRole.PATTERNMAKER);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(wrapper.text()).not.toContain('新建对账单');
  });

  // ──────────────────────────────────────────────── status tag labels
  it('shows "草稿" text for DRAFT status', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('草稿'));
  });

  it('shows "已确认" text for CONFIRMED status', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ status: 'CONFIRMED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('已确认'));
  });

  it('shows "已付款" text for PAID status', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ status: 'PAID' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('已付款'));
  });

  // ─────────────────────────────────────── status tag Element Plus types
  it('DRAFT status tag has el-tag--info class', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    // Wait for table rows to render (not just option text which appears immediately)
    await vi.waitFor(() => expect(wrapper.findAll('button').some((b) => b.text() === '详情')).toBe(true));

    const tags = wrapper.findAll('.el-tag');
    // ElTag wraps text in a child span; t.text() returns concatenated child text
    const draftTag = tags.find((t) => t.text().trim() === '草稿');
    expect(draftTag).toBeTruthy();
    expect(draftTag!.classes()).toContain('el-tag--info');
  });

  it('CONFIRMED status tag does NOT have el-tag--info or el-tag--success', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ status: 'CONFIRMED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.findAll('button').some((b) => b.text() === '详情')).toBe(true));

    const tags = wrapper.findAll('.el-tag');
    const tag = tags.find((t) => t.text().trim() === '已确认');
    expect(tag).toBeTruthy();
    expect(tag!.classes()).not.toContain('el-tag--info');
    expect(tag!.classes()).not.toContain('el-tag--success');
  });

  it('PAID status tag has el-tag--success class', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ status: 'PAID' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.findAll('button').some((b) => b.text() === '详情')).toBe(true));

    const tags = wrapper.findAll('.el-tag');
    const tag = tags.find((t) => t.text().trim() === '已付款');
    expect(tag).toBeTruthy();
    expect(tag!.classes()).toContain('el-tag--success');
  });

  // ────────────────────────────── 确认 button only shown for DRAFT + canEdit
  it('shows "提交复核" on DRAFT and "复核确认" on PENDING (ADMIN, 二级审批)', async () => {
    mockList.mockResolvedValue({
      data: [
        makeItem({ id: 1, status: 'DRAFT' }),
        makeItem({ id: 2, reconcile_no: 'RC-002', status: 'PENDING' }),
      ],
      total: 2,
    });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => {
      const detailBtns = wrapper.findAll('button').filter((b) => b.text() === '详情');
      expect(detailBtns).toHaveLength(2);
    });

    const submitBtns = wrapper.findAll('button').filter((b) => b.text() === '提交复核');
    const reviewBtns = wrapper.findAll('button').filter((b) => b.text() === '复核确认');
    expect(submitBtns.length).toBe(1); // DRAFT row
    expect(reviewBtns.length).toBe(1); // PENDING row
  });

  it('hides "复核确认" button for FINANCE user on PENDING row (仅主管/ADMIN)', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ status: 'PENDING' })], total: 1 });
    const wrapper = mountView(UserRole.FINANCE);
    await vi.waitFor(() => expect(wrapper.text()).toContain('RC-2024-001'));

    const reviewBtns = wrapper.findAll('button').filter((b) => b.text() === '复核确认');
    expect(reviewBtns.length).toBe(0);
  });

  // ──────────────────────────────────────────── 删除 button (ADMIN only)
  it('shows "删除" button for DRAFT + ADMIN', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('RC-2024-001'));

    const btn = wrapper.findAll('button').find((b) => b.text() === '删除');
    expect(btn).toBeTruthy();
  });

  it('hides "删除" button for DRAFT + FINANCE (non-admin)', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.FINANCE);
    await vi.waitFor(() => expect(wrapper.text()).toContain('RC-2024-001'));

    const btn = wrapper.findAll('button').find((b) => b.text() === '删除');
    expect(btn).toBeUndefined();
  });

  it('hides "删除" button for CONFIRMED row even as ADMIN', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ status: 'CONFIRMED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('RC-2024-001'));

    const btn = wrapper.findAll('button').find((b) => b.text() === '删除');
    expect(btn).toBeUndefined();
  });

  // ─────────────────────────────────────── 详情 → calls reconciliationApi.get
  it('clicking "详情" calls reconciliationApi.get with the row id', async () => {
    const item = makeItem({ id: 42 });
    mockList.mockResolvedValue({ data: [item], total: 1 });
    mockGet.mockResolvedValue({ reconcile_no: 'RC-042', status: 'DRAFT', shipments: [] });

    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('RC-2024-001'));

    const detailBtn = wrapper.findAll('button').find((b) => b.text() === '详情');
    expect(detailBtn).toBeTruthy();

    await detailBtn!.trigger('click');
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledWith(42));
  });

  // ──────────────────────────────────────────────────────── search form
  it('clicking 搜索 re-calls list', async () => {
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    const searchBtn = wrapper.findAll('button').find((b) => b.text().trim() === '搜索');
    await searchBtn!.trigger('click');
    await vi.waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it('clicking 重置 re-calls list', async () => {
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    const resetBtn = wrapper.findAll('button').find((b) => b.text().trim() === '重置');
    await resetBtn!.trigger('click');
    await vi.waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  // ─────────────────────────────────────────────────────── pagination
  it('renders pagination total when data is loaded', async () => {
    mockList.mockResolvedValue({ data: [makeItem()], total: 50 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('50'));
    expect(wrapper.find('.el-pagination-stub').exists()).toBe(true);
  });

  // ─────────────────────── 单据间快速跳转：/reconciliations/:id/view 自动开详情
  it('从别的单据跳来(:id/view)时自动拉取并打开该对账单详情', async () => {
    mockRoute.params = { id: '5' };
    mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledWith(5));
  });

  it('直接进列表(无 :id)时不拉详情', async () => {
    mockRoute.params = {};
    mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(mockGet).not.toHaveBeenCalled();
  });

  // ══════════════════════════ 2026-09-20 审查修复回归 ══════════════════════════

  it('B107 点「搜索」时页码归 1（翻到第 3 页再搜会得到一张空表）', async () => {
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
    const vm = wrapper.vm as any;
    vm.query.page = 3;
    vm.query.keyword = 'LM';
    await wrapper.vm.$nextTick();

    await wrapper.findAll('button').find((b) => b.text().trim() === '搜索')!.trigger('click');
    await vi.waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, keyword: 'LM' }));
  });

  it('B156 版师看不到草稿的「修改」按钮（后端限 ADMIN/主管/财务/业务，点了必 403）', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.PATTERNMAKER);
    await vi.waitFor(() => expect(wrapper.text()).toContain('RC-2024-001'));
    expect(wrapper.findAll('button').find((b) => b.text() === '修改')).toBeUndefined();
  });

  it('B156 业务/财务/管理员仍能看到「修改」', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ status: 'DRAFT' })], total: 1 });
    for (const role of [UserRole.ADMIN, UserRole.FINANCE, UserRole.BUSINESS]) {
      const wrapper = mountView(role);
      await vi.waitFor(() => expect(wrapper.text()).toContain('RC-2024-001'));
      expect(wrapper.findAll('button').find((b) => b.text() === '修改')).toBeTruthy();
    }
  });

  it('B028 工时对账候选样衣分页拉全，不是只取最近 100 条', async () => {
    // 289 件已对账样衣（生产实况）：第 101 条起的老样衣原来永远进不了候选池
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, sample_no: `S-${i + 1}`, labor_amount: 10, patternmaker_id: 1 }));
    const page2 = Array.from({ length: 100 }, (_, i) => ({ id: i + 101, sample_no: `S-${i + 101}`, labor_amount: 10, patternmaker_id: 1 }));
    const page3 = Array.from({ length: 89 }, (_, i) => ({ id: i + 201, sample_no: `S-${i + 201}`, labor_amount: 10, patternmaker_id: 1 }));
    mockSampleList.mockImplementation(async (p: any) => ({ data: [page1, page2, page3][p.page - 1] ?? [], total: 289 }));

    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    await wrapper.findAll('button').find((b) => b.text().includes('生成工时对账'))!.trigger('click');
    await vi.waitFor(() => expect(mockSampleList).toHaveBeenCalledTimes(3));

    expect(mockSampleList).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: 'RECONCILED', page: 1, size: 100 }));
    expect(mockSampleList).toHaveBeenNthCalledWith(3, expect.objectContaining({ page: 3 }));
    expect((wrapper.vm as any).laborSamples).toHaveLength(289);
  });

  it('B028 一页就拉完时不多打一次请求', async () => {
    mockSampleList.mockResolvedValue({ data: [{ id: 1, sample_no: 'S-1', labor_amount: 5, patternmaker_id: 1 }], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    await wrapper.findAll('button').find((b) => b.text().includes('生成工时对账'))!.trigger('click');
    await vi.waitFor(() => expect(mockSampleList).toHaveBeenCalledTimes(1));
  });

  it('B028 候选样衣拉失败时说一声，不是给一张空表让人以为没样衣', async () => {
    mockSampleList.mockRejectedValue(new Error('samples down'));
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    await wrapper.findAll('button').find((b) => b.text().includes('生成工时对账'))!.trigger('click');
    await vi.waitFor(() => expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('候选样衣加载失败')));
  });

  it('B110 「提交复核」连点两次只发一次请求', async () => {
    let release!: (v: unknown) => void;
    mockSubmit.mockImplementation(() => new Promise((res) => { release = res; }));
    mockList.mockResolvedValue({ data: [makeItem({ id: 3, status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('RC-2024-001'));

    const btn = wrapper.findAll('button').find((b) => b.text() === '提交复核')!;
    await btn.trigger('click');
    await btn.trigger('click');
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    release({});
  });

  it('B110 「复核确认」连点两次只发一次请求', async () => {
    let release!: (v: unknown) => void;
    mockConfirm.mockImplementation(() => new Promise((res) => { release = res; }));
    mockList.mockResolvedValue({ data: [makeItem({ id: 4, status: 'PENDING' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('RC-2024-001'));

    const btn = wrapper.findAll('button').find((b) => b.text() === '复核确认')!;
    await btn.trigger('click');
    await btn.trigger('click');
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    release({});
  });

  it('MenuAccess 无 payments 菜单时详情不反查付款申请（查了必 403，红字会糊在详情弹框上）', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ id: 42 })], total: 1 });
    mockGet.mockResolvedValue({ reconcile_no: 'RC-042', status: 'DRAFT', shipments: [] });
    const wrapper = mountView(UserRole.SHIPPING); // 船务默认菜单没有 payments
    await vi.waitFor(() => expect(wrapper.text()).toContain('RC-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '详情')!.trigger('click');
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledWith(42));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPRListForLinks).not.toHaveBeenCalled();
  });

  it('MenuAccess 有 payments 菜单时照常反查关联付款申请', async () => {
    mockList.mockResolvedValue({ data: [makeItem({ id: 42 })], total: 1 });
    mockGet.mockResolvedValue({ reconcile_no: 'RC-042', status: 'DRAFT', shipments: [] });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('RC-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '详情')!.trigger('click');
    await vi.waitFor(() => expect(mockPRListForLinks).toHaveBeenCalledWith(
      expect.objectContaining({ reconcile_id: 42 }),
    ));
  });
});
