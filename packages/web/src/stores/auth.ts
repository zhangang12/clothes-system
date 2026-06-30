import { defineStore } from 'pinia';
import { ref } from 'vue';
import { UserRole } from '@i9/types';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const role = ref<UserRole | null>(localStorage.getItem('role') as UserRole | null);
  const realName = ref<string | null>(localStorage.getItem('realName'));

  function setAuth(data: { access_token: string; role: UserRole; real_name: string }) {
    token.value = data.access_token;
    role.value = data.role;
    realName.value = data.real_name;
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('role', data.role);
    localStorage.setItem('realName', data.real_name);
  }

  function clearAuth() {
    token.value = null;
    role.value = null;
    realName.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('realName');
  }

  function hasRole(...roles: UserRole[]) {
    return role.value !== null && roles.includes(role.value);
  }

  return { token, role, realName, setAuth, clearAuth, hasRole };
});
