import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { ElMessage } from 'element-plus';
import { UserRole } from '@i9/types';
import { useAuthStore } from '../stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('../views/layout/MainLayout.vue'),
    redirect: '/dashboard',
    meta: { requiresAuth: true },
    children: [
      // meta.title 是页签栏与面包屑的唯一标题来源（原先布局里另有一份 titleMap，已收口到这里）
      // meta.menu 是账号级菜单权限的拦截依据（与侧栏 canMenu 同一口径，手输 URL 也拦）
      { path: 'dashboard', name: 'Dashboard', component: () => import('../views/DashboardView.vue'), meta: { title: '工作台' } },
      { path: 'factories', name: 'Factories', component: () => import('../views/factory/FactoryListView.vue'), meta: { title: '工厂管理', menu: 'factories' } },
      { path: 'factories/new', name: 'FactoryCreate', component: () => import('../views/factory/FactoryEditView.vue'), meta: { title: '新建工厂', menu: 'factories' } },
      { path: 'factories/:id/edit', name: 'FactoryEdit', component: () => import('../views/factory/FactoryEditView.vue'), meta: { title: '编辑工厂', menu: 'factories' } },
      { path: 'factories/:id/view', name: 'FactoryView', component: () => import('../views/factory/FactoryEditView.vue'), meta: { readonly: true, title: '工厂详情', menu: 'factories' } },
      { path: 'customers', name: 'Customers', component: () => import('../views/customer/CustomerListView.vue'), meta: { title: '客户管理', menu: 'customers' } },
      { path: 'customers/new', name: 'CustomerCreate', component: () => import('../views/customer/CustomerEditView.vue'), meta: { title: '新建客户', menu: 'customers' } },
      { path: 'customers/:id/edit', name: 'CustomerEdit', component: () => import('../views/customer/CustomerEditView.vue'), meta: { title: '编辑客户', menu: 'customers' } },
      { path: 'customers/:id/view', name: 'CustomerView', component: () => import('../views/customer/CustomerEditView.vue'), meta: { readonly: true, title: '客户详情', menu: 'customers' } },
      { path: 'samples', name: 'Samples', component: () => import('../views/sample/SampleListView.vue'), meta: { title: '样衣管理', menu: 'samples' } },
      { path: 'samples/new', name: 'SampleCreate', component: () => import('../views/sample/SampleEditView.vue'), meta: { title: '新建样衣', menu: 'samples' } },
      { path: 'samples/:id/edit', name: 'SampleEdit', component: () => import('../views/sample/SampleEditView.vue'), meta: { title: '编辑样衣', menu: 'samples' } },
      { path: 'samples/:id/view', name: 'SampleView', component: () => import('../views/sample/SampleEditView.vue'), meta: { readonly: true, title: '样衣详情', menu: 'samples' } },
      { path: 'samples/:id/patternmaker', name: 'SamplePatternmaker', component: () => import('../views/sample/SampleEditView.vue'), meta: { patternmaker: true, title: '版师填写', menu: 'samples' } },
      { path: 'quotes', name: 'Quotes', component: () => import('../views/quote/QuoteListView.vue'), meta: { title: '客户报价', menu: 'quotes' } },
      { path: 'quotes/new', name: 'QuoteCreate', component: () => import('../views/quote/QuoteEditView.vue'), meta: { title: '新建报价', menu: 'quotes' } },
      { path: 'quotes/:id/edit', name: 'QuoteEdit', component: () => import('../views/quote/QuoteEditView.vue'), meta: { title: '编辑报价', menu: 'quotes' } },
      { path: 'quotes/:id/view', name: 'QuoteView', component: () => import('../views/quote/QuoteEditView.vue'), meta: { readonly: true, title: '报价详情', menu: 'quotes' } },
      { path: 'orders', name: 'Orders', component: () => import('../views/order/OrderListView.vue'), meta: { title: '订单管理', menu: 'orders' } },
      { path: 'orders/new', name: 'OrderCreate', component: () => import('../views/order/OrderEditView.vue'), meta: { title: '新建订单', menu: 'orders' } },
      { path: 'orders/:id/edit', name: 'OrderEdit', component: () => import('../views/order/OrderEditView.vue'), meta: { title: '编辑订单', menu: 'orders' } },
      { path: 'orders/:id/view', name: 'OrderView', component: () => import('../views/order/OrderEditView.vue'), meta: { readonly: true, title: '订单详情', menu: 'orders' } },
      { path: 'contracts', name: 'Contracts', component: () => import('../views/contract/ContractListView.vue'), meta: { title: '合同管理', menu: 'contracts' } },
      { path: 'contracts/new', name: 'ContractCreate', component: () => import('../views/contract/ContractEditView.vue'), meta: { title: '新建合同', menu: 'contracts' } },
      { path: 'contracts/:id/edit', name: 'ContractEdit', component: () => import('../views/contract/ContractEditView.vue'), meta: { title: '编辑合同', menu: 'contracts' } },
      { path: 'reconciliations', name: 'Reconciliations', component: () => import('../views/reconciliation/ReconciliationListView.vue'), meta: { title: '对账管理', menu: 'reconciliations' } },
      // 对账/结算/发票的「详情」是列表页里的弹框、没有独立组件，故 :id/view 复用列表页
      // 并由它按 route.params.id 自动开弹框。给它真路由是为了单据间跳转有稳定地址，
      // 且多页签能按 :id 区分（原先 ?open=<id> 的跳法会开出两个都叫「合同管理」的页签）。
      { path: 'reconciliations/:id/view', name: 'ReconciliationView', component: () => import('../views/reconciliation/ReconciliationListView.vue'), meta: { title: '对账详情', menu: 'reconciliations' } },
      { path: 'payments', name: 'Payments', component: () => import('../views/payment/PaymentListView.vue'), meta: { title: '付款管理', menu: 'payments' } },
      { path: 'settlements', name: 'Settlements', component: () => import('../views/settlement/SettlementListView.vue'), meta: { title: '结算清单', menu: 'settlements' } },
      { path: 'settlements/:id/view', name: 'SettlementView', component: () => import('../views/settlement/SettlementListView.vue'), meta: { title: '结算详情', menu: 'settlements' } },
      { path: 'export-invoices', name: 'ExportInvoices', component: () => import('../views/invoice/ExportInvoiceView.vue'), meta: { title: '出口发票', menu: 'export-invoices' } },
      { path: 'export-invoices/:id/view', name: 'ExportInvoiceView', component: () => import('../views/invoice/ExportInvoiceView.vue'), meta: { title: '发票详情', menu: 'export-invoices' } },
      { path: 'reports', name: 'Reports', component: () => import('../views/report/ReportView.vue'), meta: { title: '报表统计', menu: 'reports' } },
      { path: 'company-profiles', name: 'CompanyProfiles', component: () => import('../views/company/CompanyProfileView.vue'), meta: { title: '本司主体', menu: 'company-profiles' } },
      { path: 'dicts', name: 'DictManage', component: () => import('../views/dict/DictManageView.vue'), meta: { title: '字典维护', menu: 'dicts' } },
      { path: 'feedbacks', name: 'Feedbacks', component: () => import('../views/feedback/FeedbackListView.vue'), meta: { admin: true, title: '反馈管理' } },
      { path: 'error-logs', name: 'ErrorLogs', component: () => import('../views/system/ErrorLogListView.vue'), meta: { admin: true, title: '系统报错' } },
      // 账号管理对 ADMIN+SUPERVISOR 放行（主管在服务端受限：只能指派非管理角色）；走菜单权限口径
      { path: 'accounts', name: 'Accounts', component: () => import('../views/system/AccountManageView.vue'), meta: { title: '账号管理', menu: 'accounts' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory('/'),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (!to.meta.public && !auth.token) {
    return { name: 'Login', query: { redirect: to.fullPath } };
  }
  // meta.admin 页只挡 token 不够：非管理员手输 URL 只会看到空壳页 + 后端 403，
  // 前端直接拦回工作台并提示（与侧栏 canMenu 的口径一致）
  if (to.meta.admin && !auth.hasRole(UserRole.ADMIN)) {
    ElMessage.warning('该页面仅管理员可访问');
    return { name: 'Dashboard' };
  }
  // 账号级菜单权限：手输 URL 同样拦截（侧栏隐藏只是 UX，这里是第二道）
  const menuKey = to.meta.menu as string | undefined;
  if (menuKey && !auth.canMenu(menuKey)) {
    ElMessage.warning('没有该菜单的访问权限，如需开通请联系管理员');
    return { name: 'Dashboard' };
  }
});

export default router;
