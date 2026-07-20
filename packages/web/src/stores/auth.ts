import { defineStore } from 'pinia';
import { ref } from 'vue';
import { UserRole, resolveMenuKeys } from '@i9/types';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const role = ref<UserRole | null>(localStorage.getItem('role') as UserRole | null);
  const realName = ref<string | null>(localStorage.getItem('realName'));
  // 账号级菜单权限（登录响应带入；null=按角色默认）。JSON 串存 localStorage。
  const menuKeys = ref<string[] | null>(parseMenuKeys(localStorage.getItem('menuKeys')));

  function parseMenuKeys(raw: string | null): string[] | null {
    if (!raw) return null;
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : null; } catch { return null; }
  }

  function setAuth(data: { access_token: string; role: UserRole; real_name: string; menu_keys?: string[] | null }) {
    token.value = data.access_token;
    role.value = data.role;
    realName.value = data.real_name;
    menuKeys.value = data.menu_keys ?? null;
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('role', data.role);
    localStorage.setItem('realName', data.real_name);
    if (menuKeys.value) localStorage.setItem('menuKeys', JSON.stringify(menuKeys.value));
    else localStorage.removeItem('menuKeys');
  }

  function clearAuth() {
    token.value = null;
    role.value = null;
    realName.value = null;
    menuKeys.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('realName');
    localStorage.removeItem('menuKeys');
  }

  function hasRole(...roles: UserRole[]) {
    return role.value !== null && roles.includes(role.value);
  }

  /** 侧栏/路由统一口径：ADMIN 恒全量；未配置按角色默认；配置后按配置 */
  function canMenu(key: string) {
    if (!role.value) return false;
    return resolveMenuKeys(role.value, menuKeys.value).includes(key);
  }

  return { token, role, realName, menuKeys, setAuth, clearAuth, hasRole, canMenu };
});
