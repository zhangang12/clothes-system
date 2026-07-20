<template>
  <el-container class="layout">
    <el-aside :width="collapsed ? '64px' : '220px'" class="side">
      <div class="logo" :class="{ mini: collapsed }">
        <img src="/datex-mark.png" alt="" class="logo-mark-img" />
        <span v-show="!collapsed" class="logo-text">DATEX<small>服装智造</small></span>
      </div>
      <el-menu :router="true" :default-active="$route.path" class="side-menu"
        :collapse="collapsed" :collapse-transition="false">
        <el-menu-item index="/dashboard"><el-icon><Odometer /></el-icon><template #title>工作台</template></el-menu-item>
        <el-sub-menu index="base">
          <template #title><el-icon><Setting /></el-icon><span>基础资料</span></template>
          <el-menu-item index="/factories">工厂管理</el-menu-item>
          <el-menu-item index="/customers">客户管理</el-menu-item>
          <el-menu-item v-if="!isProduction" index="/company-profiles">本司主体</el-menu-item>
          <el-menu-item v-if="isAdmin" index="/dicts">字典维护</el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/samples"><el-icon><Shirt /></el-icon><template #title>样衣管理</template></el-menu-item>
        <el-menu-item v-if="!isProduction" index="/quotes"><el-icon><Document /></el-icon><template #title>客户报价</template></el-menu-item>
        <el-menu-item index="/orders"><el-icon><List /></el-icon><template #title>订单管理</template></el-menu-item>
        <el-menu-item index="/contracts"><el-icon><Tickets /></el-icon><template #title>合同管理</template></el-menu-item>
        <el-menu-item index="/reconciliations"><el-icon><DataAnalysis /></el-icon><template #title>对账管理</template></el-menu-item>
        <el-menu-item index="/payments"><el-icon><CreditCard /></el-icon><template #title>付款管理</template></el-menu-item>
        <el-menu-item index="/settlements"><el-icon><TrendCharts /></el-icon><template #title>结算清单</template></el-menu-item>
        <el-menu-item index="/export-invoices"><el-icon><Postcard /></el-icon><template #title>出口发票</template></el-menu-item>
        <el-menu-item v-if="!isProduction" index="/reports"><el-icon><PieChart /></el-icon><template #title>报表统计</template></el-menu-item>
        <el-menu-item v-if="isAdmin" index="/feedbacks"><el-icon><ChatDotRound /></el-icon><template #title>反馈管理</template></el-menu-item>
        <el-menu-item v-if="isAdmin" index="/error-logs"><el-icon><Warning /></el-icon><template #title>系统报错</template></el-menu-item>
        <el-menu-item v-if="isAdmin" index="/accounts"><el-icon><UserFilled /></el-icon><template #title>账号管理</template></el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="topbar">
        <div class="top-left">
          <button class="side-toggle" :title="collapsed ? '展开菜单' : '收起菜单'" @click="toggleSide">
            <el-icon><Expand v-if="collapsed" /><Fold v-else /></el-icon>
          </button>
          <div class="crumb"><span class="crumb-home">工作台</span><span v-if="pageTitle" class="crumb-sep">/</span>{{ pageTitle }}</div>
        </div>
        <el-dropdown>
          <span class="user-chip">
            <span class="avatar">{{ (auth.realName || 'U').charAt(0) }}</span>
            {{ auth.realName || '用户' }}
            <el-icon class="caret"><CaretBottom /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="pwdDialog = true">修改密码</el-dropdown-item>
              <el-dropdown-item divided @click="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <TabsBar />
      <el-main class="main">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <!-- key 必须绑 fullPath：同一路由换 :id（如「编辑样衣 #5」切「#7」）时强制重建组件，
                 否则 Vue 复用实例、onMounted 不重跑，表单残留上一张单据，保存即覆盖错单 -->
            <component :is="Component" :key="$route.fullPath" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
  <!-- 右下角问题反馈悬浮入口(所有登录用户可用) -->
  <FeedbackWidget />
  <ChangePasswordDialog v-model="pwdDialog" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { UserRole } from '@i9/types';
import { useAuthStore } from '../../stores/auth';
import { useTabsStore } from '../../stores/tabs';
import FeedbackWidget from '../../components/FeedbackWidget.vue';
import TabsBar from '../../components/TabsBar.vue';
import ChangePasswordDialog from '../../components/ChangePasswordDialog.vue';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const pwdDialog = ref(false);
const isAdmin = computed(() => auth.hasRole(UserRole.ADMIN));
// 版师/打样:仅样衣相关,隐藏其无权访问(会 403)的客户报价/报表/本司主体
const isProduction = computed(() => auth.hasRole(UserRole.PATTERNMAKER, UserRole.SAMPLE_MAKER));

// 侧栏折叠：小屏/大表格时把横向空间还给内容，状态跨会话记忆
const SIDE_KEY = 'i9.side.collapsed';
const collapsed = ref(localStorage.getItem(SIDE_KEY) === '1');
function toggleSide() {
  collapsed.value = !collapsed.value;
  localStorage.setItem(SIDE_KEY, collapsed.value ? '1' : '0');
}

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
.side {
  background: var(--indigo); display: flex; flex-direction: column;
  transition: width 0.2s var(--ease);
}
.logo {
  height: 60px; flex: none; display: flex; align-items: center; gap: 10px;
  padding: 0 20px; background: var(--indigo-d); color: #fff;
  overflow: hidden; white-space: nowrap;
}
.logo.mini { padding: 0; justify-content: center; }
.logo-mark-img {
  width: 34px; height: 34px; border-radius: 8px; background: #fff; padding: 3px;
  box-sizing: border-box; object-fit: contain; flex: none;
}
.logo-text {
  display: flex; flex-direction: column; line-height: 1.15;
  font-size: 18px; font-weight: 800; letter-spacing: 2px; font-style: italic;
}
.logo-text small { font-size: 10px; font-weight: 400; letter-spacing: 3px; font-style: normal; color: #8FB8AE; }
.side-menu { flex: 1; border-right: none; overflow-y: auto; overflow-x: hidden; }
/* 侧栏内滚动条弱化成半透明白 */
.side-menu::-webkit-scrollbar { width: 4px; }
.side-menu::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.18); }

/* 顶栏：白底米边 */
.topbar {
  height: 60px; background: #fff; border-bottom: 1px solid var(--gray-1);
  display: flex; align-items: center; justify-content: space-between; padding: 0 20px;
}
.top-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.side-toggle {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border: none; border-radius: var(--r);
  background: transparent; color: var(--gray-5); font-size: 18px; cursor: pointer;
  transition: background-color 0.15s var(--ease), color 0.15s var(--ease);
}
.side-toggle:hover { background: var(--gray-0); color: var(--indigo); }
.crumb { font-size: 14px; color: var(--gray-9); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.crumb-home { color: var(--gray-5); font-weight: 400; }
.crumb-sep { margin: 0 8px; color: var(--gray-3); }
.user-chip { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; color: var(--gray-7); outline: none; padding: 4px 8px; border-radius: 8px; transition: background-color 0.15s var(--ease); }
.user-chip:hover { background: var(--gray-0); }
.avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--indigo); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600;
}
.caret { color: var(--gray-3); font-size: 13px; }

/* 内容区：米白 */
.main { background: var(--canvas); padding: 20px 24px; }

/* 页面切换淡入过渡 */
.page-enter-active, .page-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.page-enter-from { opacity: 0; transform: translateY(6px); }
.page-leave-to { opacity: 0; transform: translateY(-4px); }
@media (prefers-reduced-motion: reduce) {
  .side { transition: none; }
  .page-enter-active, .page-leave-active { transition: none; }
  .page-enter-from, .page-leave-to { transform: none; }
}
</style>
