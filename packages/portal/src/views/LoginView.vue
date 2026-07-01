<template>
  <div class="portal-login">
    <h2>供应商登录</h2>
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
