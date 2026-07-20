import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../auth';
import { UserRole } from '@i9/types';

// localStorage is available in jsdom; we spy on it per test
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

describe('auth store', () => {
  beforeEach(() => {
    // Replace localStorage with our mock so the store reads empty state
    vi.stubGlobal('localStorage', localStorageMock);
    localStorageMock.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ------------------------------------------------------------------ setAuth
  describe('setAuth()', () => {
    it('stores token, role and realName in state', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 'tok123', role: UserRole.ADMIN, real_name: '张三' });

      expect(store.token).toBe('tok123');
      expect(store.role).toBe(UserRole.ADMIN);
      expect(store.realName).toBe('张三');
    });

    it('persists values to localStorage', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 'tok123', role: UserRole.FINANCE, real_name: '李四' });

      expect(localStorageMock.getItem('token')).toBe('tok123');
      expect(localStorageMock.getItem('role')).toBe(UserRole.FINANCE);
      expect(localStorageMock.getItem('realName')).toBe('李四');
    });
  });

  // ----------------------------------------------------------------- clearAuth
  describe('clearAuth()', () => {
    it('resets state to null after being logged in', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 'tok', role: UserRole.BUSINESS, real_name: '王五' });
      store.clearAuth();

      expect(store.token).toBeNull();
      expect(store.role).toBeNull();
      expect(store.realName).toBeNull();
    });

    it('removes all keys from localStorage', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 'tok', role: UserRole.BUSINESS, real_name: '王五' });
      store.clearAuth();

      expect(localStorageMock.getItem('token')).toBeNull();
      expect(localStorageMock.getItem('role')).toBeNull();
      expect(localStorageMock.getItem('realName')).toBeNull();
    });
  });

  // ------------------------------------------------------------------ hasRole
  describe('hasRole()', () => {
    it('returns true when the user has the exact role', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 'tok', role: UserRole.ADMIN, real_name: 'Admin' });

      expect(store.hasRole(UserRole.ADMIN)).toBe(true);
    });

    it('returns true when role is one of several supplied roles', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 'tok', role: UserRole.FINANCE, real_name: 'Finance' });

      expect(store.hasRole(UserRole.ADMIN, UserRole.FINANCE)).toBe(true);
    });

    it('returns false when user role is not in the supplied list', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 'tok', role: UserRole.BUSINESS, real_name: 'Biz' });

      expect(store.hasRole(UserRole.ADMIN, UserRole.FINANCE)).toBe(false);
    });

    it('returns false when not logged in (role is null)', () => {
      const store = useAuthStore();
      // no setAuth call → role is null
      expect(store.hasRole(UserRole.ADMIN)).toBe(false);
    });

    it('returns false for PATTERNMAKER when checking ADMIN', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 'tok', role: UserRole.PATTERNMAKER, real_name: 'PM' });

      expect(store.hasRole(UserRole.ADMIN)).toBe(false);
    });
  });

  // --------------------------------------------------------------- isLoggedIn
  describe('token (login state)', () => {
    it('token is null before login', () => {
      const store = useAuthStore();
      expect(store.token).toBeNull();
    });

    it('token is set after setAuth()', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 'abc', role: UserRole.ADMIN, real_name: 'A' });
      expect(store.token).toBe('abc');
    });

    it('token is null after clearAuth()', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 'abc', role: UserRole.ADMIN, real_name: 'A' });
      store.clearAuth();
      expect(store.token).toBeNull();
    });

    it('picks up token that was already in localStorage (simulates page reload)', () => {
      // Seed localStorage before the store is created
      localStorageMock.setItem('token', 'persisted-token');
      localStorageMock.setItem('role', UserRole.FINANCE);
      localStorageMock.setItem('realName', '持久化用户');

      // Create a fresh pinia + store to simulate page reload
      setActivePinia(createPinia());
      const store = useAuthStore();

      expect(store.token).toBe('persisted-token');
      expect(store.role).toBe(UserRole.FINANCE);
      expect(store.realName).toBe('持久化用户');
    });
  });

  // ------------------------------------------------------------------ canMenu
  describe('canMenu()（账号级菜单权限）', () => {
    it('ADMIN 恒全量（含 adminOnly 项，无视 menuKeys 配置）', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 't', role: UserRole.ADMIN, real_name: 'A', menu_keys: ['orders'] });
      expect(store.canMenu('accounts')).toBe(true);
      expect(store.canMenu('error-logs')).toBe(true);
      expect(store.canMenu('payments')).toBe(true);
    });

    it('menuKeys 为 null 时按角色默认（船务仅 订单/合同/对账/工作台）', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 't', role: UserRole.SHIPPING, real_name: '船' });
      expect(store.canMenu('orders')).toBe(true);
      expect(store.canMenu('contracts')).toBe(true);
      expect(store.canMenu('reconciliations')).toBe(true);
      expect(store.canMenu('payments')).toBe(false);
      expect(store.canMenu('samples')).toBe(false);
      expect(store.canMenu('accounts')).toBe(false);
    });

    it('主管默认菜单含账号管理、不含管理员专属项', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 't', role: UserRole.SUPERVISOR, real_name: '主' });
      expect(store.canMenu('accounts')).toBe(true);
      expect(store.canMenu('feedbacks')).toBe(false);
      expect(store.canMenu('error-logs')).toBe(false);
      expect(store.canMenu('dicts')).toBe(false);
    });

    it('财务默认仅财务相关菜单', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 't', role: UserRole.FINANCE, real_name: '财' });
      expect(store.canMenu('payments')).toBe(true);
      expect(store.canMenu('settlements')).toBe(true);
      expect(store.canMenu('reconciliations')).toBe(true);
      expect(store.canMenu('orders')).toBe(false);
      expect(store.canMenu('quotes')).toBe(false);
    });

    it('配置 menuKeys 后按配置（覆盖角色默认，可增可减）', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 't', role: UserRole.SHIPPING, real_name: '船', menu_keys: ['orders', 'payments'] });
      expect(store.canMenu('payments')).toBe(true);   // 配置新增
      expect(store.canMenu('contracts')).toBe(false); // 角色默认被覆盖
    });

    it('menuKeys 持久化并在刷新后恢复；clearAuth 一并清除', () => {
      const store = useAuthStore();
      store.setAuth({ access_token: 't', role: UserRole.SHIPPING, real_name: '船', menu_keys: ['orders'] });
      expect(localStorageMock.getItem('menuKeys')).toBe('["orders"]');
      setActivePinia(createPinia());
      const reloaded = useAuthStore();
      expect(reloaded.canMenu('orders')).toBe(true);
      expect(reloaded.canMenu('contracts')).toBe(false);
      reloaded.clearAuth();
      expect(localStorageMock.getItem('menuKeys')).toBeNull();
      expect(reloaded.canMenu('orders')).toBe(false);
    });
  });
});
