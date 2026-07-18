import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePortalAuthStore = defineStore('portalAuth', () => {
  const token = ref<string | null>(localStorage.getItem('portal_token'));
  const factoryId = ref<number | null>(
    localStorage.getItem('portal_factory_id') ? Number(localStorage.getItem('portal_factory_id')) : null
  );
  const account = ref<string | null>(localStorage.getItem('portal_account'));

  function setAuth(data: { access_token: string; factory_id: number }, loginAccount?: string) {
    token.value = data.access_token;
    factoryId.value = data.factory_id;
    localStorage.setItem('portal_token', data.access_token);
    localStorage.setItem('portal_factory_id', String(data.factory_id));
    if (loginAccount) {
      account.value = loginAccount;
      localStorage.setItem('portal_account', loginAccount);
    }
  }

  function clearAuth() {
    token.value = null;
    factoryId.value = null;
    account.value = null;
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_factory_id');
    localStorage.removeItem('portal_account');
  }

  return { token, factoryId, account, setAuth, clearAuth };
});
