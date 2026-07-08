import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import ReconciliationListView from '../ReconciliationListView.vue';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';
import { commonStubs } from '@/test-utils/el-stubs';

// ── API mock ────────────────────────────────────────────────────────────────
const mockList = vi.fn();
const mockGet = vi.fn();
const mockCreate = vi.fn();
const mockConfirm = vi.fn();
const mockRemove = vi.fn();

vi.mock('@/api/reconciliation', () => ({
  reconciliationApi: {
    list: (...a: any[]) => mockList(...a),
    get: (...a: any[]) => mockGet(...a),
    create: (...a: any[]) => mockCreate(...a),
    confirm: (...a: any[]) => mockConfirm(...a),
    remove: (...a: any[]) => mockRemove(...a),
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
  });

  afterEach(() => {
    vi.clearAllMocks();
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
});
