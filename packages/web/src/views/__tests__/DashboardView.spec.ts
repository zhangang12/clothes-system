import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const mk = () => vi.fn().mockResolvedValue({ total: 1, data: [] });
const api = {
  factory: mk(), customer: mk(), sample: mk(), quote: mk(),
  order: mk(), contract: mk(), reconciliation: mk(), payment: mk(), settlement: mk(),
};
vi.mock('@/api/factory', () => ({ factoryApi: { list: (...a: any[]) => api.factory(...a) } }));
vi.mock('@/api/customer', () => ({ customerApi: { list: (...a: any[]) => api.customer(...a) } }));
vi.mock('@/api/sample', () => ({ sampleApi: { list: (...a: any[]) => api.sample(...a) } }));
vi.mock('@/api/quote', () => ({ quoteApi: { list: (...a: any[]) => api.quote(...a) } }));
vi.mock('@/api/order', () => ({ orderApi: { list: (...a: any[]) => api.order(...a) } }));
vi.mock('@/api/contract', () => ({ contractApi: { list: (...a: any[]) => api.contract(...a) } }));
vi.mock('@/api/reconciliation', () => ({ reconciliationApi: { list: (...a: any[]) => api.reconciliation(...a) } }));
vi.mock('@/api/payment', () => ({ paymentRequestApi: { list: (...a: any[]) => api.payment(...a) } }));
vi.mock('@/api/settlement', () => ({ settlementApi: { list: (...a: any[]) => api.settlement(...a) } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import DashboardView from '../DashboardView.vue';

function mountView(role: UserRole, menuKeys?: string[] | null) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().setAuth({ access_token: 'tok', role, real_name: '测试用户', menu_keys: menuKeys ?? null });
  return mount(DashboardView, { global: { plugins: [pinia, ElementPlus] } });
}

describe('DashboardView 按菜单权限出卡片（后端只读接口已挂 @MenuAccess，无权限会 403）', () => {
  beforeEach(() => { for (const f of Object.values(api)) f.mockClear(); });

  it('管理员看到全部卡片，请求也打全（9 张统计 + 4 条待办）', async () => {
    const w = mountView(UserRole.ADMIN);
    await flushPromises();
    expect(w.findAll('.stat-card')).toHaveLength(9);
    expect(w.findAll('.todo-card')).toHaveLength(4);
    expect(api.payment).toHaveBeenCalledTimes(2); // 付款单卡片 + 待审批付款待办
  });

  it('船务没有 factories/payments/settlements 菜单：这些卡片不显示，也绝不发请求', async () => {
    const w = mountView(UserRole.SHIPPING);
    await flushPromises();

    const labels = w.findAll('.stat-card').map((c) => c.text());
    expect(labels.some((t) => t.includes('工厂'))).toBe(false);
    expect(labels.some((t) => t.includes('付款单'))).toBe(false);
    expect(labels.some((t) => t.includes('结算单'))).toBe(false);
    expect(labels.some((t) => t.includes('订单'))).toBe(true);        // 船务有 orders
    expect(labels.some((t) => t.includes('对账单'))).toBe(true);      // 也有 reconciliations

    expect(api.factory).not.toHaveBeenCalled();
    expect(api.payment).not.toHaveBeenCalled();
    expect(api.settlement).not.toHaveBeenCalled();
    expect(api.order).toHaveBeenCalled();
  });

  it('船务的「待审批付款」待办也一起隐藏（原来无差别打满）', async () => {
    const w = mountView(UserRole.SHIPPING);
    await flushPromises();
    expect(w.text()).not.toContain('待审批付款');
    expect(w.findAll('.todo-card').length).toBeLessThan(4);
  });

  it('财务默认没有 factories 菜单：工厂卡片不出现，付款/结算照常', async () => {
    const w = mountView(UserRole.FINANCE);
    await flushPromises();
    expect(w.findAll('.stat-card').map((c) => c.text()).some((t) => t.includes('工厂'))).toBe(false);
    expect(api.factory).not.toHaveBeenCalled();
    expect(api.payment).toHaveBeenCalled();
    expect(api.settlement).toHaveBeenCalled();
  });

  it('按账号自定义 menu_keys 的也跟着走（与侧栏同一份 resolveMenuKeys）', async () => {
    const w = mountView(UserRole.BUSINESS, ['dashboard', 'orders']);
    await flushPromises();
    expect(w.findAll('.stat-card')).toHaveLength(1);
    expect(w.findAll('.stat-card')[0].text()).toContain('订单');
    expect(api.quote).not.toHaveBeenCalled();
    expect(api.contract).not.toHaveBeenCalled();
  });
});
