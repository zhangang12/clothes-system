import { defineStore } from 'pinia';
import type { RouteLocationNormalized } from 'vue-router';

export interface PageTab {
  path: string;   // fullPath，作为唯一键：同一编辑页不同单据是两个页签
  title: string;
}

const HOME: PageTab = { path: '/dashboard', title: '工作台' };
const MAX = 12; // 超出后挤掉最早的非当前页签，避免无限堆积
const KEY = 'i9.tabs';

// 页签存 sessionStorage：F5 刷新后还在（store 在内存里，不存就全丢），
// 浏览器标签页关掉即清，不会串到下次会话。
function load(): PageTab[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(arr) || !arr.length) return [{ ...HOME }];
    const tabs = arr.filter((t) => t && typeof t.path === 'string' && typeof t.title === 'string');
    return tabs.some((t) => t.path === HOME.path) ? tabs : [{ ...HOME }, ...tabs];
  } catch {
    return [{ ...HOME }];
  }
}

export const useTabsStore = defineStore('tabs', {
  state: () => ({ tabs: load() as PageTab[] }),

  actions: {
    persist() {
      try { sessionStorage.setItem(KEY, JSON.stringify(this.tabs)); } catch { /* 隐私模式写不了，忽略 */ }
    },

    /** 进入路由时登记页签；已存在则不重复添加 */
    open(route: RouteLocationNormalized) {
      const title = (route.meta?.title as string) || '';
      if (!title) return;                       // 无标题的路由（如登录）不进页签
      const path = route.fullPath;
      if (this.tabs.some((t) => t.path === path)) return;
      // 同一单据带上编号，免得「编辑订单」开好几个分不清
      const id = route.params?.id;
      this.tabs.push({ path, title: id ? `${title} #${id}` : title });
      if (this.tabs.length > MAX) {
        const victim = this.tabs.findIndex((t) => t.path !== path && t.path !== HOME.path);
        if (victim >= 0) this.tabs.splice(victim, 1);
      }
      this.persist();
    },

    /** 关闭页签，返回关闭后应停留的路径（关的是当前页时才需要跳） */
    close(path: string): string {
      const i = this.tabs.findIndex((t) => t.path === path);
      if (i < 0 || path === HOME.path) return path; // 工作台不可关
      this.tabs.splice(i, 1);
      const next = this.tabs[i] ?? this.tabs[i - 1] ?? HOME;
      this.persist();
      return next.path;
    },

    closeOthers(keep: string) {
      this.tabs = this.tabs.filter((t) => t.path === keep || t.path === HOME.path);
      this.persist();
    },

    closeAll(): string {
      this.tabs = [{ ...HOME }];
      this.persist();
      return HOME.path;
    },

    reset() {
      this.tabs = [{ ...HOME }];
      try { sessionStorage.removeItem(KEY); } catch { /* 忽略 */ }
    },
  },
});
