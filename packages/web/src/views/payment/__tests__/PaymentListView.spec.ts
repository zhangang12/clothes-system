import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus, { ElMessage } from 'element-plus';
import PaymentListView from '../PaymentListView.vue';
import { paymentStubs } from '@/test-utils/el-stubs';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

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
const mockPrepayList = vi.fn();
const mockPrepayGetBalance = vi.fn();
const mockPrepayCreate = vi.fn();

const mockPRList = vi.fn();
const mockPRCreate = vi.fn();
const mockPRUpdate = vi.fn();
const mockPRSubmit = vi.fn();
const mockPRApprove = vi.fn();
const mockPRReject = vi.fn();
const mockPRMarkPaid = vi.fn();
const mockPRAddRecord = vi.fn();
const mockPRGetRecords = vi.fn().mockResolvedValue({ data: [] });
const mockPRRemove = vi.fn();

vi.mock('@/api/payment', () => ({
  prepaymentApi: {
    list: (...a: any[]) => mockPrepayList(...a),
    getBalance: (...a: any[]) => mockPrepayGetBalance(...a),
    create: (...a: any[]) => mockPrepayCreate(...a),
    attachSlip: vi.fn(),
    attachStatement: vi.fn(),
  },
  paymentRequestApi: {
    list: (...a: any[]) => mockPRList(...a),
    create: (...a: any[]) => mockPRCreate(...a),
    update: (...a: any[]) => mockPRUpdate(...a),
    attachSlip: vi.fn(),
    submit: (...a: any[]) => mockPRSubmit(...a),
    approve: (...a: any[]) => mockPRApprove(...a),
    reject: (...a: any[]) => mockPRReject(...a),
    markPaid: (...a: any[]) => mockPRMarkPaid(...a),
    addRecord: (...a: any[]) => mockPRAddRecord(...a),
    getRecords: (...a: any[]) => mockPRGetRecords(...a),
    remove: (...a: any[]) => mockPRRemove(...a),
  },
}));

// 导出走真实排版会去解 Blob，这里只关心「有没有导出」，把出口打桩；
// payableOf 是被测口径（B146），保留真实实现
const mockExportPR = vi.fn();
vi.mock('@/utils/paymentExcel', async (orig) => ({
  ...(await orig<typeof import('@/utils/paymentExcel')>()),
  exportPaymentRequestExcel: (...a: any[]) => mockExportPR(...a),
  exportPrepaymentExcel: vi.fn(),
}));

// 敏感附件签名（B027）：如实模拟「private/ 才加令牌」
const mockSignedUrl = vi.fn(async (u: string) => (u.includes('private') ? `${u}&t=tok` : u));
vi.mock('@/utils/secureFile', () => ({
  signedUrl: (u: string) => mockSignedUrl(u),
  openFile: vi.fn(),
  isPrivateFile: (u: string) => u.includes('private'),
}));

// ── ElMessage spy ──────────────────────────────────────────────────────────
// The view imports ElMessage directly from 'element-plus'. vi.stubGlobal won't
// intercept module-level bindings, so we spy on the real ElMessage object.
const ElMessageMock = {
  success: vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ id: '' } as any)),
  error: vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ id: '' } as any)),
  warning: vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ id: '' } as any)),
  info: vi.spyOn(ElMessage, 'info').mockImplementation(() => ({ id: '' } as any)),
};

// ── Fixtures ─────────────────────────────────────────────────────────────────
const makePrepay = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  factory_id: 10,
  contract_id: null,
  amount: '5000.00',
  used_amount: '1000.00',
  balance: '4000.00',
  pay_date: '2024-01-15',
  remark: '',
  created_at: '2024-01-01',
  ...overrides,
});

const makePR = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  pr_no: 'PR-2024-001',
  type: 'CONTRACT',
  factory_id: 10,
  amount: '3000.00',
  prepay_offset: '0.00',
  actual_pay: null,
  approval_status: 'DRAFT',
  ...overrides,
});

function mountView(role: UserRole) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setAuth({ access_token: 'tok', role, real_name: '测试用户' });

  return mount(PaymentListView, {
    global: {
      plugins: [pinia, ElementPlus],
      stubs: paymentStubs,
    },
  });
}

describe('PaymentListView', () => {
  beforeEach(() => {
    mockPrepayList.mockResolvedValue({ data: [], total: 0 });
    mockPrepayGetBalance.mockResolvedValue(0);
    mockPRList.mockResolvedValue({ data: [], total: 0 });
    // Use mockClear (not mockReset) to preserve the spy implementation
    ElMessageMock.success.mockClear();
    ElMessageMock.warning.mockClear();
    ElMessageMock.error.mockClear();
    mockExportPR.mockClear();
    mockSignedUrl.mockClear();
    mockPRGetRecords.mockResolvedValue({ data: [] });
    mockPRSubmit.mockResolvedValue({});
    mockPRApprove.mockResolvedValue({});
    mockPRUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
    // 用例会改 mockRoute，不复位会串味
    mockRoute.params = {};
    mockRoute.query = {};
  });

  // ─────────────────────────────────────── tabs render
  it('renders both "预付款管理" and "付款申请" tab labels', async () => {
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockPrepayList).toHaveBeenCalled());

    expect(wrapper.text()).toContain('预付款管理');
    expect(wrapper.text()).toContain('付款申请');
  });

  it('loads prepayment list on mount', async () => {
    mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockPrepayList).toHaveBeenCalledTimes(1));
  });

  it('loads payment-request list on mount', async () => {
    mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockPRList).toHaveBeenCalledTimes(1));
  });

  // ───────────────────────── prepayment tab — section always visible
  it('prepayment tab renders its section', async () => {
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockPrepayList).toHaveBeenCalled());
    // The prepayment tab section always renders a "创建预付款" button for ADMIN
    // and the pagination stub showing a total
    expect(
      wrapper.text().includes('创建预付款') ||
      wrapper.find('.el-pagination-stub').exists(),
    ).toBe(true);
  });

  it('renders prepayment rows', async () => {
    mockPrepayList.mockResolvedValue({ data: [makePrepay({ balance: '4000.00' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('4000.00'));
  });

  // ─────────────────── payment-request tab — action buttons per status
  it('shows "提交" button for DRAFT request (canEdit role)', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    expect(wrapper.findAll('button').find((b) => b.text() === '提交')).toBeTruthy();
  });

  it('hides "提交" button for BUSINESS user on DRAFT request', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.BUSINESS);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    expect(wrapper.findAll('button').find((b) => b.text() === '提交')).toBeUndefined();
  });

  it('shows "批准" and "驳回" for PENDING request as ADMIN', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'PENDING' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    expect(wrapper.findAll('button').find((b) => b.text() === '批准')).toBeTruthy();
    expect(wrapper.findAll('button').find((b) => b.text() === '驳回')).toBeTruthy();
  });

  it('hides "批准" and "驳回" for PENDING request as FINANCE (not admin)', async () => {
    // In this component, approve/reject use `isAdmin` (not `canEdit`)
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'PENDING' })], total: 1 });
    const wrapper = mountView(UserRole.FINANCE);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    expect(wrapper.findAll('button').find((b) => b.text() === '批准')).toBeUndefined();
    expect(wrapper.findAll('button').find((b) => b.text() === '驳回')).toBeUndefined();
  });

  it('shows "付款" for APPROVED request as ADMIN', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'APPROVED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    expect(wrapper.findAll('button').find((b) => b.text() === '付款')).toBeTruthy();
  });

  it('shows "付款" for APPROVED request as FINANCE', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'APPROVED' })], total: 1 });
    const wrapper = mountView(UserRole.FINANCE);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    expect(wrapper.findAll('button').find((b) => b.text() === '付款')).toBeTruthy();
  });

  it('hides "付款" for APPROVED request as BUSINESS', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'APPROVED' })], total: 1 });
    const wrapper = mountView(UserRole.BUSINESS);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    // 组件里的文案是「付款」不是「标记付款」；写错文案会让这条 toBeUndefined 恒真、等于没测
    expect(wrapper.findAll('button').find((b) => b.text() === '付款')).toBeUndefined();
  });

  // ── 建单入口的角色门（2026-08-04 反馈 #12）────────────────────────────
  // 后端 POST /payments/requests 是 @Roles(ADMIN, FINANCE, BUSINESS)，注释写明
  // 「业务可发起无合同付款」，而前端曾按 canEdit(仅 ADMIN/FINANCE) 关掉入口。
  it('BUSINESS 能看到「新建付款申请」——后端本就允许业务发起无合同付款', async () => {
    mockPRList.mockResolvedValue({ data: [makePR()], total: 1 });
    const wrapper = mountView(UserRole.BUSINESS);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));
    expect(wrapper.findAll('button').find((b) => b.text() === '新建付款申请')).toBeTruthy();
  });

  // 2026-08-22 用户拍板放开：后端 POST /payments/prepayments 已改为
  // @Roles(ADMIN, FINANCE, BUSINESS)。登记一笔预付是发起动作，钱要真花出去仍须走
  // 付款申请并被审批（冲抵发生在 approve 那一步），所以业务能登记、动不了钱。
  it('BUSINESS 能看到「创建预付款」——已与「新建付款申请」放到同一档', async () => {
    mockPRList.mockResolvedValue({ data: [makePR()], total: 1 });
    const wrapper = mountView(UserRole.BUSINESS);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));
    expect(wrapper.findAll('button').find((b) => b.text() === '创建预付款')).toBeTruthy();
  });

  it('版师看不到「创建预付款」——放开只到业务，别顺手放给所有能进这页的角色', async () => {
    mockPRList.mockResolvedValue({ data: [makePR()], total: 1 });
    const wrapper = mountView(UserRole.PATTERNMAKER);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));
    expect(wrapper.findAll('button').find((b) => b.text() === '创建预付款')).toBeUndefined();
  });

  it('shows no transition-action buttons for PAID request', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'PAID' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    for (const text of ['提交', '批准', '驳回', '付款', '删除']) {   // 同上：文案是「付款」
      expect(wrapper.findAll('button').find((b) => b.text() === text)).toBeUndefined();
    }
  });

  // ─────────────────────── status labels
  it('shows "草稿" tag for DRAFT payment request', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));
    expect(wrapper.text()).toContain('草稿');
  });

  it('shows "待审批" tag for PENDING payment request', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'PENDING' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));
    expect(wrapper.text()).toContain('待审批');
  });

  it('shows "已批准" tag for APPROVED payment request', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'APPROVED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));
    expect(wrapper.text()).toContain('已批准');
  });

  it('shows "已驳回" tag for REJECTED payment request', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'REJECTED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));
    expect(wrapper.text()).toContain('已驳回');
  });

  it('shows "已付款" tag for PAID payment request', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'PAID' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));
    expect(wrapper.text()).toContain('已付款');
  });

  // ─────────────────────── reject dialog
  it('opens reject dialog when "驳回" is clicked', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'PENDING' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    const rejectBtn = wrapper.findAll('button').find((b) => b.text() === '驳回')!;
    await rejectBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('驳回原因');
  });

  it('warns when reject dialog submitted without a reason', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ id: 5, approval_status: 'PENDING' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '驳回')!.trigger('click');
    await wrapper.vm.$nextTick();

    // Submit without filling reason
    const confirmBtn = wrapper.findAll('button').find((b) => b.text() === '确认驳回')!;
    await confirmBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(ElMessageMock.warning).toHaveBeenCalledWith('请填写驳回原因');
    expect(mockPRReject).not.toHaveBeenCalled();
  });

  it('calls paymentRequestApi.reject with the reason text', async () => {
    mockPRReject.mockResolvedValue({});
    mockPRList.mockResolvedValue({
      data: [makePR({ id: 5, approval_status: 'PENDING' })],
      total: 1,
    });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '驳回')!.trigger('click');
    await wrapper.vm.$nextTick();

    // The reject dialog has a textarea for the reason
    const textarea = wrapper.find('textarea');
    await textarea.setValue('质量不合格');

    await wrapper.findAll('button').find((b) => b.text() === '确认驳回')!.trigger('click');
    await vi.waitFor(() => expect(mockPRReject).toHaveBeenCalledWith(5, '质量不合格'));
  });

  // ─────────────────────── 财务付款（分批 v1.1）
  it('opens installment-pay dialog with payable/paid/balance when 付款 clicked', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'APPROVED', actual_pay: 5000, paid_total: 2000 })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '付款')!.trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('财务付款'));
    expect(wrapper.text()).toContain('应付总额');
    expect(wrapper.text()).toContain('未付余额');
    expect(mockPRGetRecords).toHaveBeenCalled(); // 打开即加载分批记录
  });

  it('submits installment record with default amount = balance', async () => {
    mockPRAddRecord.mockResolvedValue({ data: { balance: 0, paid_total: 5000, request: { approval_status: 'PAID' } } });
    mockPRList.mockResolvedValue({ data: [makePR({ id: 7, approval_status: 'APPROVED', actual_pay: 5000, paid_total: 3000 })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '付款')!.trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('财务付款'));

    await wrapper.findAll('button').find((b) => b.text().includes('确认付款'))!.trigger('click');
    await vi.waitFor(() => expect(mockPRAddRecord).toHaveBeenCalledWith(7, expect.objectContaining({
      amount: 2000, // 默认=未付余额 5000-3000
      pay_method: 'BANK',
    })));
  });

  it('shows history records table inside pay dialog', async () => {
    mockPRGetRecords.mockResolvedValueOnce({ data: [
      { id: 1, pay_method: 'BANK', pay_date: '2026-07-01', amount: 1000, slip_url: '', remark: '首批' },
    ] });
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'APPROVED', actual_pay: 5000, paid_total: 1000 })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '付款')!.trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('银行转账'));
    expect(wrapper.text()).toContain('首批');
  });

  // ────────────── 单据间快速跳转：对账单详情 →「付款申请」按来源对账单过滤
  it('带 reconcile_id 跳来时切到付款申请页签并按该对账单过滤', async () => {
    mockRoute.query = { tab: 'request', reconcile_id: '33' };
    mountView(UserRole.ADMIN);
    await vi.waitFor(() =>
      expect(mockPRList).toHaveBeenCalledWith(expect.objectContaining({ reconcile_id: 33 })),
    );
  });

  it('过滤生效时给出可见的来源提示（隐藏的过滤条件会让人以为查不到数据）', async () => {
    mockRoute.query = { reconcile_id: '33' };
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('仅显示对账单 #33 关联的付款申请'));
  });

  it('直接进付款页时不带 reconcile_id、不显示来源提示', async () => {
    mockRoute.query = {};
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockPRList).toHaveBeenCalled());
    expect(mockPRList).toHaveBeenCalledWith(expect.objectContaining({ reconcile_id: undefined }));
    expect(wrapper.text()).not.toContain('仅显示对账单');
  });

  // ══════════════════════════ 2026-09-20 审查修复回归 ══════════════════════════

  it('B107 点「搜索」时页码归 1（翻到第 3 页再搜会得到一张空表）', async () => {
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockPRList).toHaveBeenCalledTimes(1));
    const vm = wrapper.vm as any;
    vm.prQuery.page = 3;
    await wrapper.vm.$nextTick();

    const searchBtns = wrapper.findAll('button').filter((b) => b.text().trim() === '搜索');
    await searchBtns[searchBtns.length - 1].trigger('click'); // 付款申请页签那个
    await vi.waitFor(() => expect(mockPRList).toHaveBeenCalledTimes(2));
    expect(mockPRList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    expect(vm.prQuery.page).toBe(1);
  });

  it('B107 预付款页签的搜索同样归 1', async () => {
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockPrepayList).toHaveBeenCalledTimes(1));
    const vm = wrapper.vm as any;
    vm.prepayQuery.page = 2;
    await wrapper.vm.$nextTick();

    const searchBtns = wrapper.findAll('button').filter((b) => b.text().trim() === '搜索');
    await searchBtns[0].trigger('click');
    await vi.waitFor(() => expect(mockPrepayList).toHaveBeenCalledTimes(2));
    expect(vm.prepayQuery.page).toBe(1);
  });

  it('B154 「重置」把四个日期筛选一起清掉（原来点了重置列表还是筛过的）', async () => {
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockPRList).toHaveBeenCalledTimes(1));
    const vm = wrapper.vm as any;
    Object.assign(vm.prQuery, {
      factory_id: 7, approval_status: 'PAID',
      due_start: '2026-09-01', due_end: '2026-09-30',
      paid_start: '2026-09-02', paid_end: '2026-09-20',
    });
    vm.prDateRange = ['2026-09-01', '2026-09-30'];
    await wrapper.vm.$nextTick();

    const resetBtns = wrapper.findAll('button').filter((b) => b.text().trim() === '重置');
    await resetBtns[resetBtns.length - 1].trigger('click');
    await vi.waitFor(() => expect(mockPRList).toHaveBeenCalledTimes(2));

    for (const k of ['due_start', 'due_end', 'paid_start', 'paid_end']) expect(vm.prQuery[k]).toBe('');
    expect(vm.prQuery.factory_id).toBeUndefined();
    expect(vm.prDateRange).toBeNull();
    expect(mockPRList).toHaveBeenLastCalledWith(expect.objectContaining({
      due_start: '', due_end: '', paid_start: '', paid_end: '', page: 1,
    }));
  });

  it('B109 改草稿时清空的收款银行/账号/款号要发空串，不能 delete（后端 ?? 会保留旧值）', async () => {
    mockPRCreate.mockResolvedValue({});
    mockPRList.mockResolvedValue({
      data: [makePR({
        id: 12, approval_status: 'DRAFT', type: 'NO_CONTRACT', factory_id: 10, amount: '3000.00',
        bank_name: '工行某支行', bank_account: '6222001', related_style_no: 'LM-01',
      })],
      total: 1,
    });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '编辑')!.trigger('click');
    await wrapper.vm.$nextTick();

    const vm = wrapper.vm as any;
    expect(vm.prForm.bank_account).toBe('6222001'); // 先确认带出来了
    vm.prForm.bank_name = '';
    vm.prForm.bank_account = '';
    vm.prForm.related_style_no = '';
    await wrapper.vm.$nextTick();

    await wrapper.findAll('button').find((b) => b.text() === '保存')!.trigger('click');
    await vi.waitFor(() => expect(mockPRUpdate).toHaveBeenCalled());
    const dto = mockPRUpdate.mock.calls[0][1];
    expect(dto.bank_name).toBe('');
    expect(dto.bank_account).toBe('');
    expect(dto.related_style_no).toBe('');
  });

  it('B109 新建时空的收款信息仍然不发（保持建单口径）', async () => {
    mockPRCreate.mockResolvedValue({});
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(mockPRList).toHaveBeenCalled());

    await wrapper.findAll('button').find((b) => b.text() === '新建付款申请')!.trigger('click');
    await wrapper.vm.$nextTick();
    const vm = wrapper.vm as any;
    Object.assign(vm.prForm, { factory_id: 3, amount: 100 });
    await wrapper.vm.$nextTick();

    await wrapper.findAll('button').find((b) => b.text() === '保存')!.trigger('click');
    await vi.waitFor(() => expect(mockPRCreate).toHaveBeenCalled());
    const dto = mockPRCreate.mock.calls[0][0];
    expect('bank_name' in dto).toBe(false);
    expect('bank_account' in dto).toBe(false);
  });

  it('B146 未付余额按 amount − prepay_offset 回退（老单 actual_pay 为空时不能只退回 amount）', async () => {
    mockPRList.mockResolvedValue({
      data: [makePR({ actual_pay: null, amount: '3000.00', prepay_offset: '3000.00', paid_total: '0.00' })],
      total: 1,
    });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));
    // 「已付 / 余额」列：0.00 / 0.00，而不是 0.00 / 3000.00
    expect(wrapper.text()).toContain('0.00 / 0.00');
    expect(wrapper.text()).not.toContain('0.00 / 3000.00');
  });

  it('B153 发票传了 3 份时逐份给入口（原来只开第一份）', async () => {
    mockPRList.mockResolvedValue({
      data: [makePR({ invoice_no: 'FP-1', invoice_url: '/f?p=private%2Fa.pdf,/f?p=private%2Fb.pdf,/f?p=private%2Fc.pdf' })],
      total: 1,
    });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));
    expect(wrapper.text()).toContain('第1份');
    expect(wrapper.text()).toContain('第2份');
    expect(wrapper.text()).toContain('第3份');
  });

  it('B153 只有一份时仍显示「查看」', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ invoice_url: '/f?p=private%2Fa.pdf' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));
    expect(wrapper.text()).toContain('查看');
    expect(wrapper.text()).not.toContain('第1份');
  });

  it('B155 分批付款记录拉不到就不出 Excel（财务不能拿到一份缺记录的文件）', async () => {
    // 用默认文案那条路径：'网络错误' 会撞上 errToast 的 800ms 去重（本文件里未 mock 的真请求也在喊这句）
    mockPRGetRecords.mockRejectedValueOnce(new Error('records down'));
    mockPRList.mockResolvedValue({ data: [makePR({ id: 9 })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '导出Excel')!.trigger('click');
    await vi.waitFor(() => expect(ElMessageMock.error)
      .toHaveBeenCalledWith(expect.stringContaining('分批付款记录获取失败')));
    expect(mockExportPR).not.toHaveBeenCalled();
  });

  it('B155 记录拉得到时照常导出', async () => {
    mockPRGetRecords.mockResolvedValueOnce({ data: [{ id: 1, amount: 100 }] });
    mockPRList.mockResolvedValue({ data: [makePR({ id: 9 })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '导出Excel')!.trigger('click');
    await vi.waitFor(() => expect(mockExportPR).toHaveBeenCalled());
    expect(mockExportPR.mock.calls[0][0].records).toHaveLength(1);
  });

  it('B110 「提交」连点两次只发一次请求', async () => {
    let release!: (v: unknown) => void;
    mockPRSubmit.mockImplementation(() => new Promise((res) => { release = res; }));
    mockPRList.mockResolvedValue({ data: [makePR({ id: 3, approval_status: 'DRAFT' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    // 【别只点两次按钮】点完第一次按钮就 :disabled 了，VTU 对 disabled 元素不再派发事件——
    // 那样测的是 disabled 绑定，把函数里的防重闸删掉照样绿（变异实测）。这里直接连调两次处理函数。
    const btn = wrapper.findAll('button').find((b) => b.text() === '提交')!;
    await btn.trigger('click');
    await (wrapper.vm as any).doSubmit({ id: 3 });
    expect(mockPRSubmit).toHaveBeenCalledTimes(1);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('button').find((b) => b.text() === '提交')!.attributes('disabled')).toBeDefined();
    release({});
  });

  it('B110 「批准」连点两次只发一次请求', async () => {
    let release!: (v: unknown) => void;
    mockPRApprove.mockImplementation(() => new Promise((res) => { release = res; }));
    mockPRList.mockResolvedValue({ data: [makePR({ id: 4, approval_status: 'PENDING' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    const btn = wrapper.findAll('button').find((b) => b.text() === '批准')!;
    await btn.trigger('click');
    await (wrapper.vm as any).doApprove({ id: 4 }); // 同上：绕开 disabled，直接考防重闸
    expect(mockPRApprove).toHaveBeenCalledTimes(1);
    release({});
  });

  it('B027 付款弹窗里的水单用签名链接显示（裸 private 地址必 403 裂图）', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'APPROVED', actual_pay: 5000, paid_total: 0 })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '付款')!.trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('财务付款'));

    const vm = wrapper.vm as any;
    vm.slipUrl = '/api/v1/uploads/file?p=private%2F2026%2F09%2Fslip.png';
    await vi.waitFor(() => expect(mockSignedUrl).toHaveBeenCalled());
    await wrapper.vm.$nextTick();
    const img = wrapper.find('.slip-preview img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toContain('t=tok');
  });

  it('B027 PDF 水单不套 <img>（套了必然裂图），给可点开的占位', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'APPROVED', actual_pay: 5000, paid_total: 0 })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '付款')!.trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('财务付款'));

    const vm = wrapper.vm as any;
    vm.slipUrl = '/api/v1/uploads/file?p=private%2F2026%2F09%2Fslip.pdf';
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.slip-preview img').exists()).toBe(false);
    expect(wrapper.text()).toContain('PDF 水单已上传');
  });

  it('B097 付款日期默认取本地今天，不是 UTC 今天（早 8 点前会差一天）', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'APPROVED', actual_pay: 5000, paid_total: 0 })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '付款')!.trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('财务付款'));

    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    expect((wrapper.vm as any).payForm.pay_date).toBe(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  });

  it('B099 当天到期不算逾期（原来按 UTC 零点解析，早上 8:01 起就标逾期）', async () => {
    // 把「现在」钉在本地 10:00：此刻 new Date('YYYY-MM-DD')（UTC 零点）已经早于现在，
    // 旧写法必判逾期、新写法不判——不钉时间的话半夜跑这条用例两种实现都说「没逾期」，等于没测
    const d = new Date();
    d.setHours(10, 0, 0, 0);
    vi.setSystemTime(d);
    const p = (n: number) => String(n).padStart(2, '0');
    const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    mockPRList.mockResolvedValue({ data: [makePR({ due_date: today, approval_status: 'APPROVED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));
    expect(wrapper.text()).not.toContain('逾期');
    vi.useRealTimers();
  });

  it('B099 昨天到期照旧标逾期', async () => {
    const d = new Date(Date.now() - 24 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    const yesterday = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    mockPRList.mockResolvedValue({ data: [makePR({ due_date: yesterday, approval_status: 'APPROVED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));
    expect(wrapper.text()).toContain('逾期');
  });
});
