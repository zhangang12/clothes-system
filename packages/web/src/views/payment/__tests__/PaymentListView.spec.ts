import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus, { ElMessage } from 'element-plus';
import PaymentListView from '../PaymentListView.vue';
import { paymentStubs } from '@/test-utils/el-stubs';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

// ── API mocks ────────────────────────────────────────────────────────────────
const mockPrepayList = vi.fn();
const mockPrepayGetBalance = vi.fn();
const mockPrepayCreate = vi.fn();

const mockPRList = vi.fn();
const mockPRCreate = vi.fn();
const mockPRSubmit = vi.fn();
const mockPRApprove = vi.fn();
const mockPRReject = vi.fn();
const mockPRMarkPaid = vi.fn();
const mockPRRemove = vi.fn();

vi.mock('@/api/payment', () => ({
  prepaymentApi: {
    list: (...a: any[]) => mockPrepayList(...a),
    getBalance: (...a: any[]) => mockPrepayGetBalance(...a),
    create: (...a: any[]) => mockPrepayCreate(...a),
  },
  paymentRequestApi: {
    list: (...a: any[]) => mockPRList(...a),
    create: (...a: any[]) => mockPRCreate(...a),
    submit: (...a: any[]) => mockPRSubmit(...a),
    approve: (...a: any[]) => mockPRApprove(...a),
    reject: (...a: any[]) => mockPRReject(...a),
    markPaid: (...a: any[]) => mockPRMarkPaid(...a),
    remove: (...a: any[]) => mockPRRemove(...a),
  },
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
  });

  afterEach(() => {
    vi.clearAllMocks();
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

  it('shows "标记付款" for APPROVED request as ADMIN', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'APPROVED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    expect(wrapper.findAll('button').find((b) => b.text() === '标记付款')).toBeTruthy();
  });

  it('shows "标记付款" for APPROVED request as FINANCE', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'APPROVED' })], total: 1 });
    const wrapper = mountView(UserRole.FINANCE);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    expect(wrapper.findAll('button').find((b) => b.text() === '标记付款')).toBeTruthy();
  });

  it('hides "标记付款" for APPROVED request as BUSINESS', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'APPROVED' })], total: 1 });
    const wrapper = mountView(UserRole.BUSINESS);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    expect(wrapper.findAll('button').find((b) => b.text() === '标记付款')).toBeUndefined();
  });

  it('shows no transition-action buttons for PAID request', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'PAID' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    for (const text of ['提交', '批准', '驳回', '标记付款', '删除']) {
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

  // ─────────────────────── mark-paid dialog
  it('opens mark-paid dialog when "标记付款" is clicked', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ approval_status: 'APPROVED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '标记付款')!.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('上传付款水单');
    expect(wrapper.text()).toContain('水单URL');
  });

  it('warns when marking paid without a slip URL', async () => {
    mockPRList.mockResolvedValue({ data: [makePR({ id: 7, approval_status: 'APPROVED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '标记付款')!.trigger('click');
    await wrapper.vm.$nextTick();

    await wrapper.findAll('button').find((b) => b.text() === '确认付款')!.trigger('click');
    await wrapper.vm.$nextTick();

    expect(ElMessageMock.warning).toHaveBeenCalledWith('请上传或填写水单地址');
    expect(mockPRMarkPaid).not.toHaveBeenCalled();
  });

  it('calls paymentRequestApi.markPaid with the slip URL', async () => {
    mockPRMarkPaid.mockResolvedValue({});
    mockPRList.mockResolvedValue({ data: [makePR({ id: 7, approval_status: 'APPROVED' })], total: 1 });
    const wrapper = mountView(UserRole.ADMIN);
    await vi.waitFor(() => expect(wrapper.text()).toContain('PR-2024-001'));

    await wrapper.findAll('button').find((b) => b.text() === '标记付款')!.trigger('click');
    await wrapper.vm.$nextTick();

    // The mark-paid dialog has an el-input (rendered as an input[type=text])
    // Find the one inside the mark-paid dialog. It will be the last text input
    // because the dialog is appended after other content.
    const inputs = wrapper.findAll('input').filter((i) => i.element.type !== 'number');
    // Find the slip URL input — should be the only text input visible in this dialog
    const slipInput = inputs[inputs.length - 1];
    await slipInput.setValue('https://cdn.example.com/slip.jpg');

    await wrapper.findAll('button').find((b) => b.text() === '确认付款')!.trigger('click');
    await vi.waitFor(() =>
      expect(mockPRMarkPaid).toHaveBeenCalledWith(7, 'https://cdn.example.com/slip.jpg'),
    );
  });
});
