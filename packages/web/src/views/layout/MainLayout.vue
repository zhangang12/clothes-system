<template>
  <el-container class="layout">
    <el-aside width="220px" class="side">
      <div class="logo">
        <img src="/datex-mark.png" alt="" class="logo-mark-img" />
        <span class="logo-text">DATEX<small>服装智造</small></span>
      </div>
      <el-menu :router="true" :default-active="$route.path" class="side-menu">
        <el-menu-item index="/dashboard"><el-icon><Odometer /></el-icon>工作台</el-menu-item>
        <el-sub-menu index="base">
          <template #title><el-icon><Setting /></el-icon>基础资料</template>
          <el-menu-item index="/factories">工厂管理</el-menu-item>
          <el-menu-item index="/customers">客户管理</el-menu-item>
          <el-menu-item v-if="!isProduction" index="/company-profiles">本司主体</el-menu-item>
          <el-menu-item v-if="isAdmin" index="/dicts">字典维护</el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/samples"><el-icon><Shirt /></el-icon>样衣管理</el-menu-item>
        <el-menu-item v-if="!isProduction" index="/quotes"><el-icon><Document /></el-icon>客户报价</el-menu-item>
        <el-menu-item index="/orders"><el-icon><List /></el-icon>订单管理</el-menu-item>
        <el-menu-item index="/contracts"><el-icon><Tickets /></el-icon>合同管理</el-menu-item>
        <el-menu-item index="/reconciliations"><el-icon><DataAnalysis /></el-icon>对账管理</el-menu-item>
        <el-menu-item index="/payments"><el-icon><CreditCard /></el-icon>付款管理</el-menu-item>
        <el-menu-item index="/settlements"><el-icon><TrendCharts /></el-icon>结算清单</el-menu-item>
        <el-menu-item index="/export-invoices"><el-icon><Postcard /></el-icon>出口发票</el-menu-item>
        <el-menu-item v-if="!isProduction" index="/reports"><el-icon><PieChart /></el-icon>报表统计</el-menu-item>
        <el-menu-item v-if="isAdmin" index="/feedbacks"><el-icon><ChatDotRound /></el-icon>反馈管理</el-menu-item>
        <el-menu-item v-if="isAdmin" index="/error-logs"><el-icon><Warning /></el-icon>系统报错</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="topbar">
        <div class="crumb"><span class="crumb-home">工作台</span><span v-if="pageTitle" class="crumb-sep">/</span>{{ pageTitle }}</div>
        <el-dropdown>
          <span class="user-chip">
            <span class="avatar">{{ (auth.realName || 'U').charAt(0) }}</span>
            {{ auth.realName || '用户' }}
            <el-icon class="caret"><CaretBottom /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <TabsBar />
      <el-main class="main">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
  <!-- 右下角问题反馈悬浮入口(所有登录用户可用) -->
  <FeedbackWidget />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { UserRole } from '@i9/types';
import { useAuthStore } from '../../stores/auth';
import { useTabsStore } from '../../stores/tabs';
import FeedbackWidget from '../../components/FeedbackWidget.vue';
import TabsBar from '../../components/TabsBar.vue';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const isAdmin = computed(() => auth.hasRole(UserRole.ADMIN));
// 版师/打样:仅样衣相关,隐藏其无权访问(会 403)的客户报价/报表/本司主体
const isProduction = computed(() => auth.hasRole(UserRole.PATTERNMAKER, UserRole.SAMPLE_MAKER));

// 标题统一取路由 meta.title（页签栏同源），工作台本身不再重复显示在面包屑右侧
const pageTitle = computed(() => {
  const t = (route.meta?.title as string) || '';
  return t === '工作台' ? '' : t;
});

function logout() {
  useTabsStore().reset(); // 换账号后不该看到上一个人开的页签
  auth.clearAuth();
  router.push('/login');
}
</script>

<style scoped>
.layout { height: 100vh; }

/* 侧边栏：靛蓝 */
.side { background: var(--indigo); display: flex; flex-direction: column; }
.logo {
  height: 60px; display: flex; align-items: center; gap: 10px;
  padding: 0 20px; background: var(--indigo-d); color: #fff;
}
.logo-mark-img {
  width: 34px; height: 34px; border-radius: 8px; background: #fff; padding: 3px;
  box-sizing: border-box; object-fit: contain;
}
.logo-text {
  display: flex; flex-direction: column; line-height: 1.15;
  font-size: 18px; font-weight: 800; letter-spacing: 2px; font-style: italic;
}
.logo-text small { font-size: 10px; font-weight: 400; letter-spacing: 3px; font-style: normal; color: #8FB8AE; }
.side-menu { flex: 1; border-right: none; }

/* 顶栏：白底米边 */
.topbar {
  height: 60px; background: #fff; border-bottom: 1px solid var(--gray-1);
  display: flex; align-items: center; justify-content: space-between; padding: 0 24px;
}
.crumb { font-size: 14px; color: var(--gray-9); font-weight: 500; }
.crumb-home { color: var(--gray-5); font-weight: 400; }
.crumb-sep { margin: 0 8px; color: var(--gray-3); }
.user-chip { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--gray-7); outline: none; }
.avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--indigo); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;
}
.caret { color: var(--gray-3); font-size: 12px; }

/* 内容区：米白 */
.main { background: var(--canvas); padding: 20px 24px; }

/* 页面切换淡入过渡 */
.page-enter-active, .page-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.page-enter-from { opacity: 0; transform: translateY(6px); }
.page-leave-to { opacity: 0; transform: translateY(-4px); }
@media (prefers-reduced-motion: reduce) {
  .page-enter-active, .page-leave-active { transition: none; }
  .page-enter-from, .page-leave-to { transform: none; }
}
</style>
