import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus, { ElMessageBox } from 'element-plus';
import OrderListView from '../OrderListView.vue';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';
import { commonStubs } from '@/test-utils/el-stubs';

const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {}, query: {} }),
}));

const mockList = vi.fn();
const mockCopy = vi.fn();
const mockRemove = vi.fn();
vi.mock('@/api/order', () => ({
  orderApi: {
    list: (...a: any[]) => mockList(...a),
    get: vi.fn(), copy: (...a: any[]) => mockCopy(...a),
    remove: (...a: any[]) => mockRemove(...a), advance: vi.fn(), revert: vi.fn(), importBatch: vi.fn(),
  },
}));
vi.mock('@/api/contract', () => ({ contractApi: { generateFromOrder: vi.fn() } }));
vi.mock('@/api/quote', () => ({ quoteApi: { list: vi.fn() } }));

// 确认框一律放行，把测试焦点留在「守卫拦没拦住第二次请求」上
vi.mock('element-plus', async () => {
  const actual: any = await vi.importActual('element-plus');
  return {
    ...actual,
    ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm'), alert: vi.fn().mockResolvedValue(undefined) },
  };
});

async function mountView(role: UserRole = UserRole.ADMIN) {
  setActivePinia(createPinia());
  useAuthStore().setAuth({ access_token: 'tok', role, real_name: '测试用户' });
  mockList.mockResolvedValue({ data: [{ id: 7, order_no: 'O-20260805-001', currency: 'CNY', unit_price: 12 }], total: 1 });
  const w = mount(OrderListView, {
    global: {
      plugins: [ElementPlus],
      // ElDropdown 在 jsdom 里会递归更新（打印/生成合同两个下拉），本用例只关心 doCopy，直接 stub 掉
      stubs: { ...commonStubs, ElDropdown: true, ElDropdownMenu: true, ElDropdownItem: true },
    },
  });
  await new Promise((r) => setTimeout(r, 0));
  return w;
}

describe('OrderListView · 复制防连点（2026-08-04 反馈 #09 同型）', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('连点两次复制，只发出一次 copy 请求——后端 copy 无幂等，放行两次就真出两张连号草稿', async () => {
    const w: any = await mountView();
    let resolve!: (v: any) => void;
    mockCopy.mockReturnValue(new Promise((r) => { resolve = r; }));
    const row = { id: 7, order_no: 'O-20260805-001' };
    const p1 = w.vm.doCopy(row);
    const p2 = w.vm.doCopy(row);           // 第一次还在飞行中
    await new Promise((r) => setTimeout(r, 0));
    expect(mockCopy).toHaveBeenCalledTimes(1);
    resolve({ data: { order_no: 'O-20260805-002' } });
    await Promise.all([p1, p2]);
  });

  it('一次结束后可以再复制（守卫只挡并发，不是一次性开关）', async () => {
    const w: any = await mountView();
    mockCopy.mockResolvedValue({ data: { order_no: 'O-2' } });
    const row = { id: 7, order_no: 'O-1' };
    await w.vm.doCopy(row);
    await w.vm.doCopy(row);
    expect(mockCopy).toHaveBeenCalledTimes(2);
  });

  it('复制失败后守卫复位，不会把按钮永久卡死', async () => {
    const w: any = await mountView();
    mockCopy.mockRejectedValueOnce(new Error('boom'));
    await w.vm.doCopy({ id: 7, order_no: 'O-1' });
    mockCopy.mockResolvedValue({ data: { order_no: 'O-2' } });
    await w.vm.doCopy({ id: 7, order_no: 'O-1' });
    expect(mockCopy).toHaveBeenCalledTimes(2);
  });
});

describe('OrderListView · 2026-09-20 审查', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── B026：编辑按钮与行双击没有 canEdit 守卫，无权角色进了可编辑表单 ──
  it('B026 无编辑权限时双击行进「查看」而不是编辑表单', async () => {
    const w: any = await mountView(UserRole.SHIPPING);
    expect(w.vm.canEdit).toBe(false);
    w.vm.onRowDblclick({ id: 7, status: 'DRAFT' });
    expect(mockPush).toHaveBeenCalledWith({ name: 'OrderView', params: { id: 7 } });
    expect(mockPush).not.toHaveBeenCalledWith({ name: 'OrderEdit', params: { id: 7 } });
  });

  it('B026 有权限且是草稿时双击照常进编辑；非草稿进查看', async () => {
    const w: any = await mountView();
    w.vm.onRowDblclick({ id: 7, status: 'DRAFT' });
    expect(mockPush).toHaveBeenLastCalledWith({ name: 'OrderEdit', params: { id: 7 } });
    w.vm.onRowDblclick({ id: 8, status: 'CONFIRMED' });
    expect(mockPush).toHaveBeenLastCalledWith({ name: 'OrderView', params: { id: 8 } });
  });

  it('B026 无编辑权限时操作列不出现「编辑」按钮（留「查看」）', async () => {
    const w = await mountView(UserRole.SHIPPING);
    await vi.waitFor(() => expect(w.text()).toContain('O-20260805-001'));
    const texts = w.findAll('button').map((b: any) => b.text());
    expect(texts).not.toContain('编辑');
    expect(texts).toContain('查看');
  });

  // ── B107 同类：点「搜索」不重置页码，翻到第 3 页再搜出空表 ──
  it('B107 点搜索把页码拨回第 1 页（翻页本身不受影响）', async () => {
    const w: any = await mountView();
    w.vm.query.page = 3;
    w.vm.search();
    expect(w.vm.query.page).toBe(1);
  });

  // ── G1 配合项：批量删除被后端拦下时要说清原因 ──
  it('批量删除把后端拦截原因逐条列出来，而不是只报「拦截 N 条」', async () => {
    const w: any = await mountView();
    mockRemove.mockImplementation((id: number) => (id === 7
      ? Promise.reject({ response: { data: { msg: '该订单下还有未删除的合同' } } })
      : Promise.resolve({})));
    w.vm.selected = [{ id: 7, order_no: 'O-1' }, { id: 8, order_no: 'O-2' }];
    await w.vm.batchRemove();
    await vi.waitFor(() => expect(ElMessageBox.alert).toHaveBeenCalled());
    const [body, title] = (ElMessageBox.alert as any).mock.calls.at(-1);
    expect(body).toContain('O-1：该订单下还有未删除的合同');
    expect(title).toContain('成功 1 条');
    expect(title).toContain('拦截 1 条');
  });
});
