import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
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
      { path: 'dashboard', name: 'Dashboard', component: () => import('../views/DashboardView.vue') },
      { path: 'factories', name: 'Factories', component: () => import('../views/factory/FactoryListView.vue') },
      { path: 'factories/new', name: 'FactoryCreate', component: () => import('../views/factory/FactoryEditView.vue') },
      { path: 'factories/:id/edit', name: 'FactoryEdit', component: () => import('../views/factory/FactoryEditView.vue') },
      { path: 'factories/:id/view', name: 'FactoryView', component: () => import('../views/factory/FactoryEditView.vue'), meta: { readonly: true } },
      { path: 'customers', name: 'Customers', component: () => import('../views/customer/CustomerListView.vue') },
      { path: 'customers/new', name: 'CustomerCreate', component: () => import('../views/customer/CustomerEditView.vue') },
      { path: 'customers/:id/edit', name: 'CustomerEdit', component: () => import('../views/customer/CustomerEditView.vue') },
      { path: 'customers/:id/view', name: 'CustomerView', component: () => import('../views/customer/CustomerEditView.vue'), meta: { readonly: true } },
      { path: 'samples', name: 'Samples', component: () => import('../views/sample/SampleListView.vue') },
      { path: 'quotes', name: 'Quotes', component: () => import('../views/quote/QuoteListView.vue') },
      { path: 'orders', name: 'Orders', component: () => import('../views/order/OrderListView.vue') },
      { path: 'contracts', name: 'Contracts', component: () => import('../views/contract/ContractListView.vue') },
      { path: 'reconciliations', name: 'Reconciliations', component: () => import('../views/reconciliation/ReconciliationListView.vue') },
      { path: 'payments', name: 'Payments', component: () => import('../views/payment/PaymentListView.vue') },
      { path: 'settlements', name: 'Settlements', component: () => import('../views/settlement/SettlementListView.vue') },
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
});

export default router;
