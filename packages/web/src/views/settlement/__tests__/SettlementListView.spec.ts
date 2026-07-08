import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import SettlementListView from '../SettlementListView.vue';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';
import { commonStubs } from '@/test-utils/el-stubs';

// ── API mocks ────────────────────────────────────────────────────────────────
const mockList = vi.fn();
const mockGet = vi.fn();
const mockCreate = vi.fn();
const mockConfirm = vi.fn();
const mockRemove = vi.fn();
const mockAddCost = vi.fn();
const mockAddReceipt = vi.fn();

vi.mock('@/api/settlement', () => ({
  settlementApi: {
    list: (...a: any[]) => mockList(...a),
    get: (...a: any[]) => mockGet(...a),
    create: (...a: any[]) => mockCreate(...a),
    confirm: (...a: any[]) => mockConfirm(...a),
    remove: (...a: any[]) => mockRemove(...a),
    addCost: (...a: any[]) => mockAddCost(...a),
    addReceipt: (...a: any[]) => mockAddReceipt(...a),
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────
const makeSettlement = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  settlement_no: 'JS-2024-001',
  order_id: 100,
  revenue: '10000.00',
  total_cost: '7000.00',
  net_profit: '3000.00',
  status: 'DRAFT',
  confirmed_at: null,
  ...overrides,
});

function mountView(role: UserRole) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setAuth({ access_token: 'tok', role, real_name: '测试用户' });

  return mount(SettlementListView, {
    global: {
      plugins: [pinia, ElementPlus],
      stubs: commonStubs,
    },
  });
}

describe('SettlementListView', () => {
  beforeEach(() => {
    mockList.mockResolvedValue({ data: [], total: 0 });
    mockGet.mockResolvedValue({ costs: [], receipts: [] });
    mockCreate.mockResolvedValue({});
    mockConfirm.mockResolvedValue({});
    mockRemove.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────── list loading
  it('calls settlementApi.list on mount', async () => {
    mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
  });

  it('renders settlement rows returned by the API', async () => {
    mockList.mockResolvedValue({ data: [makeSettlement({ settlement_no: 'JS-001' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('JS-001'));
  });

  // ─────────────────────────────────── net_profit colour classes
  it('applies text-success class to a positive net_profit', async () => {
    mockList.mockResolvedValue({ data: [makeSettlement({ net_profit: '3000.00' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('3000.00'));

    const positiveSpan = wrapper.findAll('span').find(
      (s) => s.text() === '3000.00' && s.classes().includes('text-success'),
    );
    expect(positiveSpan).toBeTruthy();
  });

  it('applies text-danger class to a negative net_profit', async () => {
    mockList.mockResolvedValue({ data: [makeSettlement({ net_profit: '-500.00' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('-500.00'));

    const negativeSpan = wrapper.findAll('span').find(
      (s) => s.text() === '-500.00' && s.classes().includes('text-danger'),
    );
    expect(negativeSpan).toBeTruthy();
  });

  it('applies neither class when net_profit is zero', async () => {
    mockList.mockResolvedValue({ data: [makeSettlement({ net_profit: '0.00' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('0.00'));

    // Find the span inside the net_profit column template (not any other 0.00 text)
    const zeroSpans = wrapper.findAll('span').filter((s) => s.text() === '0.00');
    // At least one should exist; none should have colour classes
    const hasColorClass = zeroSpans.some(
      (s) => s.classes().includes('text-success') || s.classes().includes('text-danger'),
    );
    expect(hasColorClass).toBe(false);
  });

  // ─────────────────────────────────── 确认 button visibility
  it('shows "确认" button for DRAFT row as ADMIN', async () => {
    mockList.mockResolvedValue({ data: [makeSettlement({ status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('JS-2024-001'));
    expect(wrapper.findAll('button').find((b) => b.text() === '确认')).toBeTruthy();
  });

  it('shows "确认" button for DRAFT row as FINANCE', async () => {
    mockList.mockResolvedValue({ data: [makeSettlement({ status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.FINANCE);
    await vi.waitFor(() => expect(wrapper.text()).toContain('JS-2024-001'));
    expect(wrapper.findAll('button').find((b) => b.text() === '确认')).toBeTruthy();
  });

  it('hides "确认" button for CONFIRMED row', async () => {
    mockList.mockResolvedValue({ data: [makeSettlement({ status: 'CONFIRMED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('JS-2024-001'));
    expect(wrapper.findAll('button').find((b) => b.text() === '确认')).toBeUndefined();
  });

  it('hides "确认" button for BUSINESS even on DRAFT', async () => {
    mockList.mockResolvedValue({ data: [makeSettlement({ status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.BUSINESS);
    await vi.waitFor(() => expect(wrapper.text()).toContain('JS-2024-001'));
    expect(wrapper.findAll('button').find((b) => b.text() === '确认')).toBeUndefined();
  });

  // ─────────────────────────────────── 删除 button (ADMIN only)
  it('shows "删除" button for DRAFT + ADMIN', async () => {
    mockList.mockResolvedValue({ data: [makeSettlement({ status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('JS-2024-001'));
    expect(wrapper.findAll('button').find((b) => b.text() === '删除')).toBeTruthy();
  });

  it('hides "删除" for DRAFT + FINANCE (non-admin)', async () => {
    mockList.mockResolvedValue({ data: [makeSettlement({ status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.FINANCE);
    await vi.waitFor(() => expect(wrapper.text()).toContain('JS-2024-001'));
    expect(wrapper.findAll('button').find((b) => b.text() === '删除')).toBeUndefined();
  });

  it('hides "删除" for CONFIRMED row even as ADMIN', async () => {
    mockList.mockResolvedValue({ data: [makeSettlement({ status: 'CONFIRMED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('JS-2024-001'));
    expect(wrapper.findAll('button').find((b) => b.text() === '删除')).toBeUndefined();
  });

  // ──────────────────────────────── "新建结算单" visibility
  it('"新建结算单" is visible for ADMIN', async () => {
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(wrapper.text()).toContain('新建结算单');
  });

  it('"新建结算单" is shown for BUSINESS (出货后业务可建·结算串流程 rec)', async () => {
    const wrapper = mountView(UserRole.BUSINESS);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(wrapper.text()).toContain('新建结算单');
  });

  // ─────────────────────────────── cost lines can be added and removed
  it('adds a cost line when "+ 添加费用行" is clicked', async () => {
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());

    // Open create dialog
    const createBtn = wrapper.findAll('button').find((b) => b.text() === '新建结算单')!;
    await createBtn.trigger('click');
    await wrapper.vm.$nextTick();

    // No cost rows yet
    const addCostBtn = wrapper.findAll('button').find((b) => b.text() === '+ 添加费用行')!;
    const beforeCount = wrapper.findAll('button').filter((b) => b.text() === '删除').length;

    await addCostBtn.trigger('click');
    await wrapper.vm.$nextTick();

    const afterCount = wrapper.findAll('button').filter((b) => b.text() === '删除').length;
    expect(afterCount).toBe(beforeCount + 1);
  });

  it('removes a cost line when its 删除 button is clicked', async () => {
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());

    const createBtn = wrapper.findAll('button').find((b) => b.text() === '新建结算单')!;
    await createBtn.trigger('click');
    await wrapper.vm.$nextTick();

    const addCostBtn = wrapper.findAll('button').find((b) => b.text() === '+ 添加费用行')!;
    await addCostBtn.trigger('click');
    await addCostBtn.trigger('click');
    await wrapper.vm.$nextTick();

    const before = wrapper.findAll('button').filter((b) => b.text() === '删除').length;
    expect(before).toBe(2);

    const firstDelete = wrapper.findAll('button').find((b) => b.text() === '删除')!;
    await firstDelete.trigger('click');
    await wrapper.vm.$nextTick();

    const after = wrapper.findAll('button').filter((b) => b.text() === '删除').length;
    expect(after).toBe(1);
  });

  // ─────────────────────────────────────────────── pagination
  it('renders pagination when total > 0', async () => {
    mockList.mockResolvedValue({ data: [makeSettlement()], total: 30 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('30'));
    expect(wrapper.find('.el-pagination-stub').exists()).toBe(true);
  });
});
