<template>
  <el-container class="layout">
    <el-aside width="220px" class="side">
      <div class="logo">
        <span class="logo-mark">I9</span>
        <span class="logo-text">服装制造管理</span>
      </div>
      <el-menu :router="true" :default-active="$route.path" class="side-menu">
        <el-menu-item index="/dashboard"><el-icon><Odometer /></el-icon>工作台</el-menu-item>
        <el-sub-menu index="base">
          <template #title><el-icon><Setting /></el-icon>基础资料</template>
          <el-menu-item index="/factories">工厂管理</el-menu-item>
          <el-menu-item index="/customers">客户管理</el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/samples"><el-icon><Shirt /></el-icon>样衣管理</el-menu-item>
        <el-menu-item index="/quotes"><el-icon><Document /></el-icon>客户报价</el-menu-item>
        <el-menu-item index="/orders"><el-icon><List /></el-icon>订单管理</el-menu-item>
        <el-menu-item index="/contracts"><el-icon><Tickets /></el-icon>合同管理</el-menu-item>
        <el-menu-item index="/reconciliations"><el-icon><DataAnalysis /></el-icon>对账管理</el-menu-item>
        <el-menu-item index="/payments"><el-icon><CreditCard /></el-icon>付款管理</el-menu-item>
        <el-menu-item index="/settlements"><el-icon><TrendCharts /></el-icon>结算清单</el-menu-item>
        <el-menu-item index="/reports"><el-icon><PieChart /></el-icon>报表统计</el-menu-item>
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
      <el-main class="main"><router-view /></el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const titleMap: Record<string, string> = {
  '/dashboard': '工作台',
  '/factories': '工厂管理',
  '/customers': '客户管理',
  '/samples': '样衣管理',
  '/quotes': '客户报价',
  '/orders': '订单管理',
  '/contracts': '合同管理',
  '/reconciliations': '对账管理',
  '/payments': '付款管理',
  '/settlements': '结算清单',
  '/reports': '报表统计',
};
const pageTitle = computed(() => titleMap[route.path] || '');

function logout() { auth.clearAuth(); router.push('/login'); }
</script>

<style scoped>
.layout { height: 100vh; }

/* 侧边栏：靛蓝 */
.side { background: var(--indigo); display: flex; flex-direction: column; }
.logo {
  height: 60px; display: flex; align-items: center; gap: 10px;
  padding: 0 20px; background: var(--indigo-d); color: #fff;
}
.logo-mark {
  width: 32px; height: 32px; border: 1.5px solid var(--rust); border-radius: var(--r);
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; color: var(--rust); font-size: 15px;
}
.logo-text { font-size: 15px; font-weight: 600; letter-spacing: 1px; }
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
</style>
