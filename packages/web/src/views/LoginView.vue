<template>
  <div class="login-page">
    <!-- 左：靛蓝品牌区 -->
    <div class="login-brand">
      <div class="brand-inner">
        <div class="brand-logo">I9</div>
        <h1>服装制造管理系统</h1>
        <p class="brand-sub">样衣 · 报价 · 订单 · 合同 · 对账 · 结算<br />全流程数字化协同</p>
        <div class="brand-threads"></div>
      </div>
    </div>
    <!-- 右：登录表单 -->
    <div class="login-form-wrap">
      <div class="login-card">
        <h2>欢迎登录</h2>
        <p class="form-sub">请输入您的账户信息</p>
        <el-form :model="form" @submit.prevent="handleLogin" label-position="top" size="large">
          <el-form-item label="用户名">
            <el-input v-model="form.username" placeholder="请输入用户名" :prefix-icon="User" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              :prefix-icon="Lock"
              show-password
              @keyup.enter="handleLogin"
            />
          </el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading" class="login-btn">
            登 录
          </el-button>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { User, Lock } from '@element-plus/icons-vue';
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
    // 全局 HTTP 拦截器已弹出错误提示
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  min-height: 100vh;
  background: var(--canvas);
}

/* 左侧品牌区 */
.login-brand {
  flex: 1.1;
  background: linear-gradient(150deg, var(--indigo) 0%, var(--indigo-d) 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.brand-inner { position: relative; z-index: 2; padding: 0 8%; }
.brand-logo {
  width: 64px; height: 64px;
  border: 2px solid var(--rust);
  border-radius: var(--r-lg);
  display: flex; align-items: center; justify-content: center;
  font-size: 30px; font-weight: 700; letter-spacing: 1px;
  color: var(--rust);
  margin-bottom: 28px;
}
.login-brand h1 { font-size: 32px; font-weight: 700; margin: 0 0 16px; letter-spacing: 2px; }
.brand-sub { font-size: 15px; line-height: 2; color: #C9D3DF; }
/* 织物纹理装饰 */
.brand-threads {
  position: absolute; inset: 0; z-index: 1;
  background-image: repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 14px);
}
.login-brand::after {
  content: ''; position: absolute; right: -80px; bottom: -80px;
  width: 280px; height: 280px; border-radius: 50%;
  background: rgba(209, 122, 64, 0.12);
}

/* 右侧表单区 */
.login-form-wrap {
  flex: 1;
  display: flex; align-items: center; justify-content: center;
}
.login-card {
  width: 360px;
  background: #fff;
  border: 1px solid var(--gray-1);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow);
  padding: 40px 36px;
}
.login-card h2 { font-size: 22px; color: var(--indigo); margin: 0 0 6px; font-weight: 600; }
.form-sub { font-size: 13px; color: var(--gray-5); margin: 0 0 28px; }
.login-btn { width: 100%; margin-top: 8px; font-size: 15px; letter-spacing: 4px; }

/* 移动端：隐藏品牌区 */
@media (max-width: 768px) {
  .login-brand { display: none; }
}
</style>
