import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
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
vi.mock('@/api/order', () => ({
  orderApi: {
    list: (...a: any[]) => mockList(...a),
    get: vi.fn(), copy: (...a: any[]) => mockCopy(...a),
    remove: vi.fn(), advance: vi.fn(), revert: vi.fn(), importBatch: vi.fn(),
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
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
  };
});

async function mountView() {
  setActivePinia(createPinia());
  useAuthStore().setAuth({ access_token: 'tok', role: UserRole.ADMIN, real_name: '测试用户' });
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
