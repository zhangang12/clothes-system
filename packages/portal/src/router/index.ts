import { showNotify } from 'vant';
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
      // ownNav: 详情页自带返回导航栏，布局的门户导航栏让位（否则双导航叠放）
      { path: 'contracts/:id', name: 'PortalContractDetail', component: () => import('../views/ContractDetailView.vue'), meta: { ownNav: true } },
      { path: 'mine', name: 'PortalMine', component: () => import('../views/MineView.vue') },
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

/**
 * chunk 取不到时的兜底（与 web 端同一套，见 packages/web/src/router/index.ts）。
 * 正常情况下 utils/versionCheck 会先一步发现发版并整页跳转；这里防的是那个竞态窗口：
 * 恰好在两次轮询之间发了版、用户又正好点了进某一页。
 */
const RELOAD_FLAG = 'i9.chunkReloaded';
router.onError((err, to) => {
  const msg = String((err as any)?.message ?? err);
  const isChunkMiss = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(msg);
  if (!isChunkMiss) return;
  if (sessionStorage.getItem(RELOAD_FLAG)) {
    // 已经重载过一次还是失败：别再刷了，免得陷入刷新循环
    showNotify({ type: 'danger', message: '页面加载失败，请检查网络后重试' });
    return;
  }
  sessionStorage.setItem(RELOAD_FLAG, '1');
  window.location.assign(to.fullPath); // 用目标地址重载，用户停在他本来要去的页面
});
router.afterEach(() => { sessionStorage.removeItem(RELOAD_FLAG); });

export default router;
