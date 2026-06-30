import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/portal/login',
    name: 'PortalLogin',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/portal',
    component: () => import('../views/layout/PortalLayout.vue'),
    redirect: '/portal/contracts',
    meta: { requiresAuth: true },
    children: [
      { path: 'contracts', name: 'PortalContracts', component: () => import('../views/ContractListView.vue') },
      { path: 'contracts/:id', name: 'PortalContractDetail', component: () => import('../views/ContractDetailView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/portal/login' },
];

const router = createRouter({
  history: createWebHistory('/'),
  routes,
});

router.beforeEach((to) => {
  if (!to.meta.public && !localStorage.getItem('portal_token')) {
    return { name: 'PortalLogin' };
  }
});

export default router;
