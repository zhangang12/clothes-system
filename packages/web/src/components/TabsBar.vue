<template>
  <!-- 多页签：模块间快速切换，免得每次都回侧边栏找（用户反馈：需要能直接跳到别的模块） -->
  <div class="tabs-bar">
    <div
      v-for="t in tabs.tabs"
      :key="t.path"
      class="tab"
      :class="{ active: t.path === route.fullPath }"
      @click="go(t.path)"
      @contextmenu.prevent="openMenu($event, t.path)"
    >
      <span class="tab-txt">{{ t.title }}</span>
      <el-icon v-if="t.path !== HOME" class="tab-x" @click.stop="onClose(t.path)"><Close /></el-icon>
    </div>

    <!-- 右键菜单：关闭其他 / 关闭全部 -->
    <div v-if="menu.show" class="tab-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <div class="tab-menu-item" @click="doCloseOthers">关闭其他</div>
      <div class="tab-menu-item" @click="doCloseAll">关闭全部</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Close } from '@element-plus/icons-vue';
import { useTabsStore } from '../stores/tabs';

const HOME = '/dashboard';
const route = useRoute();
const router = useRouter();
const tabs = useTabsStore();
const menu = reactive({ show: false, x: 0, y: 0, path: '' });

// 每次导航登记页签（含首屏）
watch(() => route.fullPath, () => tabs.open(route), { immediate: true });

function go(path: string) {
  if (path !== route.fullPath) router.push(path);
}
function onClose(path: string) {
  const next = tabs.close(path);
  if (path === route.fullPath) router.push(next);
}
function openMenu(e: MouseEvent, path: string) {
  Object.assign(menu, { show: true, x: e.clientX, y: e.clientY, path });
}
function closeMenu() { menu.show = false; }
function doCloseOthers() {
  tabs.closeOthers(menu.path);
  if (menu.path !== route.fullPath) router.push(menu.path);
  closeMenu();
}
function doCloseAll() {
  router.push(tabs.closeAll());
  closeMenu();
}

onMounted(() => document.addEventListener('click', closeMenu));
onBeforeUnmount(() => document.removeEventListener('click', closeMenu));
</script>

<style scoped>
.tabs-bar {
  display: flex; align-items: center; gap: 4px;
  height: 38px; padding: 0 16px;
  background: #fff; border-bottom: 1px solid var(--gray-1);
  overflow-x: auto; overflow-y: hidden; scrollbar-width: thin;
}
.tab {
  display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto;
  height: 26px; padding: 0 10px; border-radius: var(--r);
  border: 1px solid var(--gray-1); background: var(--gray-0);
  font-size: 12px; color: var(--gray-7); cursor: pointer; user-select: none;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.tab:hover { border-color: var(--indigo-l); color: var(--indigo); }
.tab.active {
  background: var(--indigo); border-color: var(--indigo); color: #fff; font-weight: 500;
}
.tab-x { font-size: 12px; border-radius: 50%; padding: 1px; }
.tab-x:hover { background: rgba(0, 0, 0, 0.18); }
.tab.active .tab-x:hover { background: rgba(255, 255, 255, 0.28); }

.tab-menu {
  position: fixed; z-index: 3000; min-width: 108px; padding: 4px 0;
  background: #fff; border: 1px solid var(--gray-1); border-radius: var(--r);
  box-shadow: var(--shadow); font-size: 13px;
}
.tab-menu-item { padding: 6px 14px; cursor: pointer; color: var(--gray-7); }
.tab-menu-item:hover { background: var(--gray-0); color: var(--indigo); }

@media (prefers-reduced-motion: reduce) { .tab { transition: none; } }
</style>
