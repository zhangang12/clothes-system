import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus, { ElMessageBox } from 'element-plus';
import SettlementListView from '../SettlementListView.vue';
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

// ── API mocks ────────────────────────────────────────────────────────────────
const mockList = vi.fn();
const mockGet = vi.fn();
const mockCreate = vi.fn();
const mockConfirm = vi.fn();
const mockRemove = vi.fn();
const mockAddCost = vi.fn();
const mockAddReceipt = vi.fn();
const mockUpdate = vi.fn();
const mockCostPreview = vi.fn();
const mockChangeLogs = vi.fn();
const mockStats = vi.fn();
const mockOrderList = vi.fn();
const mockOrderGet = vi.fn();

// 订单接口此前没打桩，测试里会真的发请求（jsdom XHR 噪音），B102/B108 也要靠它断言
vi.mock('@/api/order', () => ({
  orderApi: {
    list: (...a: any[]) => mockOrderList(...a),
    get: (...a: any[]) => mockOrderGet(...a),
  },
}));

vi.mock('@/api/settlement', () => ({
  settlementApi: {
    list: (...a: any[]) => mockList(...a),
    get: (...a: any[]) => mockGet(...a),
    create: (...a: any[]) => mockCreate(...a),
    confirm: (...a: any[]) => mockConfirm(...a),
    remove: (...a: any[]) => mockRemove(...a),
    addCost: (...a: any[]) => mockAddCost(...a),
    addReceipt: (...a: any[]) => mockAddReceipt(...a),
    update: (...a: any[]) => mockUpdate(...a),
    costPreview: (...a: any[]) => mockCostPreview(...a),
    changeLogs: (...a: any[]) => mockChangeLogs(...a),
    stats: (...a: any[]) => mockStats(...a),
    refreshCost: vi.fn(),
    removeCost: vi.fn(),
    removeReceipt: vi.fn(),
    reopen: vi.fn(),
    refundReceived: vi.fn(),
    pullInvoiceReceipts: vi.fn(),
    aggregate: vi.fn(),
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
      // RuleHint 是 main.ts 全局注册的组件，测试环境未注册需 stub，否则报 resolve 警告
      stubs: { ...commonStubs, RuleHint: true },
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
    mockUpdate.mockResolvedValue({});
    mockCostPreview.mockResolvedValue({ data: { rows: [], paid_tax: 0, unpaid_tax: 0, unpaid_count: 0 } });
    mockChangeLogs.mockResolvedValue({ data: [] });
    mockStats.mockResolvedValue({ data: { pending: 0, loss: 0, recalc: 0 } });
    mockOrderList.mockResolvedValue({ data: [] });
    mockOrderGet.mockResolvedValue({ data: { shipments: [], currency: 'USD' } });
  });

  afterEach(() => {
    vi.clearAllMocks();
    // 用例会改 mockRoute，不复位会串味
    mockRoute.params = {};
    mockRoute.query = {};
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

  // ─────────────────────────── 单据间快速跳转：/settlements/:id/view 自动开详情
  it('从别的单据跳来(:id/view)时自动拉取并打开该结算单详情', async () => {
    mockRoute.params = { id: '7' };
    mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledWith(7));
  });

  it('直接进列表(无 :id)时不拉详情', async () => {
    mockRoute.params = {};
    mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('跳来的结算单已删除时提示而不是整页崩', async () => {
    mockRoute.params = { id: '999' };
    mockGet.mockRejectedValue({ response: { data: { msg: '结算单不存在' } } });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledWith(999));
    expect(wrapper.exists()).toBe(true);
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

  it('B161 「确认」要先二次确认——误点一次就得走红冲重开', async () => {
    const confirmBox = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any);
    mockList.mockResolvedValue({ data: [makeSettlement({ id: 8, status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('JS-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '确认')!.trigger('click');
    await vi.waitFor(() => expect(mockConfirm).toHaveBeenCalledWith(8));
    expect(confirmBox).toHaveBeenCalled();
    expect(String(confirmBox.mock.calls[0][0])).toContain('红冲重开'); // 说清后果
  });

  it('B161 二次确认点「再看看」就不发请求', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('cancel'));
    mockList.mockResolvedValue({ data: [makeSettlement({ id: 8, status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('JS-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '确认')!.trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('B161 确认在途时不给点第二次（防重）', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any);
    let release!: (v: unknown) => void;
    mockConfirm.mockImplementation(() => new Promise((res) => { release = res; }));
    mockList.mockResolvedValue({ data: [makeSettlement({ id: 8, status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('JS-2024-001'));

    const btn = wrapper.findAll('button').find((b) => b.text() === '确认')!;
    await btn.trigger('click');
    await vi.waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    await btn.trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    release({});
  });

  it('B115 编辑结算单清空出口退税/运杂费要发 0，后端才写得进去（原来只能改成 0）', async () => {
    mockGet.mockResolvedValue({
      id: 5, settlement_no: 'JS-005', status: 'DRAFT', costs: [], receipts: [],
      tax_refund: '800.00', freight_fee: '120.00', exchange_rate: '7.1000',
    });
    mockList.mockResolvedValue({ data: [makeSettlement({ id: 5, status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('JS-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '详情')!.trigger('click');
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledWith(5));
    await wrapper.findAll('button').find((b) => b.text().includes('编辑'))!.trigger('click');
    await wrapper.vm.$nextTick();

    const vm = wrapper.vm as any;
    expect(vm.editForm.tax_refund).toBe(800); // 先确认带出来了
    vm.editForm.tax_refund = null;            // el-input-number 清空给的就是 null
    vm.editForm.freight_fee = null;
    await wrapper.vm.$nextTick();

    await wrapper.findAll('button').find((b) => b.text().includes('保存并重算'))!.trigger('click');
    await vi.waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const dto = mockUpdate.mock.calls[0][1];
    expect(dto.tax_refund).toBe(0);
    expect(dto.freight_fee).toBe(0);
  });

  it('B115 没清空的费用原样发，不会被强行归零', async () => {
    mockGet.mockResolvedValue({
      id: 5, settlement_no: 'JS-005', status: 'DRAFT', costs: [], receipts: [],
      tax_refund: '800.00', freight_fee: '120.00',
    });
    mockList.mockResolvedValue({ data: [makeSettlement({ id: 5, status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('JS-2024-001'));
    await wrapper.findAll('button').find((b) => b.text() === '详情')!.trigger('click');
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledWith(5));
    await wrapper.findAll('button').find((b) => b.text().includes('编辑'))!.trigger('click');
    await wrapper.vm.$nextTick();

    await wrapper.findAll('button').find((b) => b.text().includes('保存并重算'))!.trigger('click');
    await vi.waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][1].tax_refund).toBe(800);
    expect(mockUpdate.mock.calls[0][1].freight_fee).toBe(120);
  });

  it('B102 关联订单下拉走后端搜索，不再只拉前 100 张当「全部」', async () => {
    mockOrderList.mockResolvedValue({ data: [{ id: 1, order_no: 'DD-1', style_no: 'LM' }] });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockOrderList).toHaveBeenCalled());
    // 进页面先摆一批（无关键词）
    expect(mockOrderList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, size: 100 }));
    expect(mockOrderList.mock.calls[0][0].keyword).toBeUndefined();

    await (wrapper.vm as any).searchOrders('DD-2026');
    expect(mockOrderList).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: 'DD-2026' }));
  });

  it('B108 连切两个订单：先发的慢响应不能盖掉后发的成本预览', async () => {
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    const vm = wrapper.vm as any;

    let releaseSlow!: (v: any) => void;
    mockOrderGet
      .mockImplementationOnce(() => new Promise((res) => { releaseSlow = res; }))
      .mockImplementationOnce(async () => ({ data: { shipments: [], currency: 'USD' } }));
    mockCostPreview.mockResolvedValue({ data: { rows: [{ cost_name: '第二个订单的成本', amount: 1 }], paid_tax: 1 } });

    vm.createForm.order_id = 11;
    await wrapper.vm.$nextTick();
    vm.createForm.order_id = 22;
    await vi.waitFor(() => expect(mockCostPreview).toHaveBeenCalledWith(22));

    releaseSlow({ data: { shipments: [{ id: 99, qty: 5, shipment_date: '2026-09-01' }], currency: 'CNY' } });
    await new Promise((r) => setTimeout(r, 0));

    expect(mockCostPreview).not.toHaveBeenCalledWith(11);   // 旧订单的预览根本不该发
    expect(vm.orderShipments).toEqual([]);                  // 慢到的旧出货批没盖上来
    expect(vm.createForm.currency).not.toBe('CNY');
  });
});
