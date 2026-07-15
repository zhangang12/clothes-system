<template>
  <!-- 多页签：模块间快速切换，免得每次都回侧边栏找（用户反馈：需要能直接跳到别的模块） -->
  <div class="tabs-bar">
    <div
      v-for="t in tabs.tabs"
      :key="t.path"
      class="tab"
      :class="{ active: t.path === route.fullPath, home: t.path === HOME }"
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
/* 页签栏：贴着顶栏，米白底把白色的页签「托」起来，形成层次 */
.tabs-bar {
  display: flex; align-items: center; gap: 6px;
  height: 42px; padding: 0 16px;
  background: var(--gray-0); border-bottom: 1px solid var(--gray-1);
  overflow-x: auto; overflow-y: hidden;
  scrollbar-width: none;              /* 页签栏自身的滚动条是噪音 */
}
.tabs-bar::-webkit-scrollbar { display: none; }

.tab {
  display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto;
  height: 30px; padding: 0 12px;
  border-radius: 15px;                 /* 胶囊形，和 .el-tag 的语言一致 */
  border: 1px solid transparent;
  background: #fff;
  font-size: 14px; color: var(--gray-5); cursor: pointer; user-select: none;
  transition: color .14s ease, background .14s ease, box-shadow .14s ease;
}
.tab:hover { color: var(--indigo); box-shadow: var(--shadow-sm); }

/* 当前页签：靛蓝实心 + 一点投影，让「我在哪」一眼可见 */
.tab.active {
  background: var(--indigo); color: #fff; font-weight: 500;
  box-shadow: 0 2px 8px rgba(30, 58, 95, .25);
}
/* 工作台是固定页签，给个铁锈橙小点暗示它关不掉 */
.tab.home::before {
  content: ''; width: 6px; height: 6px; border-radius: 50%;
  background: var(--rust); flex: 0 0 auto;
}
.tab.home.active::before { background: #fff; }

.tab-x {
  font-size: 12px; border-radius: 50%; padding: 2px;
  opacity: .45; transition: opacity .14s ease, background .14s ease;
}
.tab:hover .tab-x { opacity: 1; }
.tab-x:hover { background: rgba(30, 58, 95, .12); opacity: 1; }
.tab.active .tab-x { opacity: .7; }
.tab.active .tab-x:hover { background: rgba(255, 255, 255, .3); opacity: 1; }

.tab-menu {
  position: fixed; z-index: 3000; min-width: 108px; padding: 4px 0;
  background: #fff; border: 1px solid var(--gray-1); border-radius: var(--r);
  box-shadow: var(--shadow); font-size: 14px;
}
.tab-menu-item { padding: 7px 14px; cursor: pointer; color: var(--gray-7); }
.tab-menu-item:hover { background: var(--gray-0); color: var(--indigo); }

@media (prefers-reduced-motion: reduce) { .tab { transition: none; } }
</style>
