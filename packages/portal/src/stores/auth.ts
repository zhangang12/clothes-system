import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePortalAuthStore = defineStore('portalAuth', () => {
  const token = ref<string | null>(localStorage.getItem('portal_token'));
  const factoryId = ref<number | null>(
    localStorage.getItem('portal_factory_id') ? Number(localStorage.getItem('portal_factory_id')) : null
  );

  function setAuth(data: { access_token: string; factory_id: number }) {
    token.value = data.access_token;
    factoryId.value = data.factory_id;
    localStorage.setItem('portal_token', data.access_token);
    localStorage.setItem('portal_factory_id', String(data.factory_id));
  }

  function clearAuth() {
    token.value = null;
    factoryId.value = null;
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_factory_id');
  }

  return { token, factoryId, setAuth, clearAuth };
});
