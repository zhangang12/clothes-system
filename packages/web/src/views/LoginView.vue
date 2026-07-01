<template>
  <div class="login-container">
    <el-card class="login-card">
      <h2>I9 服装制造管理系统</h2>
      <el-form :model="form" @submit.prevent="handleLogin">
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" placeholder="请输入密码" />
        </el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" block>登录</el-button>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { http } from '../api/index';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const loading = ref(false);
const form = ref({ username: '', password: '' });

async function handleLogin() {
  loading.value = true;
  try {
    const res: any = await http.post('/auth/login', form.value);
    auth.setAuth(res.data);
    const redirect = (route.query.redirect as string) ?? '/';
    router.push(redirect);
  } catch {
    // error message shown by global HTTP interceptor
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-container { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f0f2f5; }
.login-card { width: 400px; }
h2 { text-align: center; margin-bottom: 24px; }
</style>
