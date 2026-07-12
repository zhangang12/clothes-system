<template>
  <div class="portal-login">
    <div class="portal-brand">
      <img src="/datex-mark.png" alt="DATEX" class="portal-mark" />
      <div class="portal-name">DATEX</div>
      <div class="portal-desc">供应商协同门户</div>
    </div>
    <van-form @submit="handleLogin">
      <van-field v-model="form.username" label="账号" placeholder="请输入账号" required />
      <van-field v-model="form.password" label="密码" type="password" placeholder="请输入密码" required />
      <div style="margin: 16px">
        <van-button type="primary" native-type="submit" block :loading="loading">登录</van-button>
      </div>
    </van-form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePortalAuthStore } from '../stores/auth';
import { http } from '../api/index';
const router = useRouter();
const auth = usePortalAuthStore();
const loading = ref(false);
const form = ref({ username: '', password: '' });
async function handleLogin() {
  loading.value = true;
  try {
    const res: any = await http.post('/auth/portal/login', form.value);
    auth.setAuth(res.data);
    router.push('/portal/contracts');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.portal-brand { text-align: center; padding: 40px 0 24px; }
.portal-mark { width: 72px; height: 72px; }
.portal-name { font-size: 30px; font-weight: 800; font-style: italic; letter-spacing: 3px; color: #23343A; margin-top: 10px; }
.portal-desc { font-size: 13px; color: #2E8B78; letter-spacing: 2px; margin-top: 4px; }
</style>
