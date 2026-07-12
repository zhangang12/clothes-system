<template>
  <div class="login-page">
    <!-- 左：DATEX 品牌区（墨绿→炭黑） -->
    <div class="login-brand">
      <div class="brand-inner">
        <div class="brand-chip">
          <img src="/datex-logo.png" alt="DATEX" class="brand-logo-img" />
        </div>
        <h1>服装智造管理系统</h1>
        <p class="brand-sub">样衣 · 报价 · 订单 · 合同 · 对账 · 结算</p>
        <div class="brand-flow">
          <span>全流程数字化协同</span>
        </div>
      </div>
      <div class="brand-threads"></div>
      <div class="brand-glow"></div>
    </div>

    <!-- 右：登录表单 -->
    <div class="login-form-wrap">
      <div class="login-card">
        <div class="card-brand">
          <img src="/datex-mark.png" alt="" class="card-mark" />
          <span class="card-name">DATEX</span>
        </div>
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
          <el-button native-type="submit" :loading="loading" class="login-btn">
            登 录
          </el-button>
        </el-form>
        <p class="copyright">© DATEX 服装智造 · 全流程管理平台</p>
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
/* DATEX 品牌色 */
.login-page {
  --teal: #2E8B78;
  --teal-d: #1E6B5C;
  --charcoal: #23343A;
  --charcoal-d: #1A2529;
  display: flex;
  min-height: 100vh;
  background: #f4f6f7;
}

/* 左侧品牌区 */
.login-brand {
  flex: 1.15;
  background: linear-gradient(155deg, var(--teal) 0%, var(--teal-d) 42%, var(--charcoal) 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.brand-inner { position: relative; z-index: 3; padding: 0 9%; max-width: 560px; }
.brand-chip {
  width: 168px; height: 168px;
  background: #fff;
  border-radius: 28px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 36px;
}
.brand-logo-img { width: 132px; height: auto; display: block; }
.login-brand h1 {
  font-size: 34px; font-weight: 700; margin: 0 0 14px;
  letter-spacing: 3px;
}
.brand-sub { font-size: 16px; letter-spacing: 2px; color: rgba(255, 255, 255, 0.86); margin: 0 0 20px; }
.brand-flow span {
  display: inline-block;
  font-size: 13px; letter-spacing: 1px;
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.22);
  padding: 8px 18px; border-radius: 999px;
  backdrop-filter: blur(4px);
}
/* 织物经纬纹理 */
.brand-threads {
  position: absolute; inset: 0; z-index: 1;
  background-image:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.04) 0 1px, transparent 1px 22px),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 22px);
}
.brand-glow {
  position: absolute; z-index: 2;
  right: -120px; bottom: -120px;
  width: 360px; height: 360px; border-radius: 50%;
  background: radial-gradient(circle, rgba(46, 139, 120, 0.45) 0%, transparent 70%);
}

/* 右侧表单区 */
.login-form-wrap {
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.login-card {
  width: 380px;
  background: #fff;
  border: 1px solid #eceff1;
  border-radius: 18px;
  box-shadow: 0 12px 40px rgba(35, 52, 58, 0.08);
  padding: 44px 40px 32px;
}
.card-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; }
.card-mark { width: 38px; height: 38px; }
.card-name { font-size: 22px; font-weight: 800; letter-spacing: 2px; color: var(--charcoal); font-style: italic; }
.login-card h2 { font-size: 22px; color: var(--charcoal); margin: 0 0 6px; font-weight: 600; }
.form-sub { font-size: 13px; color: #9aa4a9; margin: 0 0 26px; }
.login-btn {
  width: 100%; margin-top: 10px;
  font-size: 15px; letter-spacing: 6px;
  background: linear-gradient(135deg, var(--teal) 0%, var(--teal-d) 100%);
  border: none; color: #fff;
  height: 44px;
}
.login-btn:hover { background: linear-gradient(135deg, #35a08a 0%, #237a68 100%); }
.copyright { text-align: center; font-size: 12px; color: #b7c0c4; margin: 24px 0 0; }

/* 表单聚焦色调为墨绿 */
.login-card :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px var(--teal) inset; }
.login-card :deep(.el-input__prefix) { color: var(--teal); }

/* 移动端：隐藏品牌区 */
@media (max-width: 768px) {
  .login-brand { display: none; }
  .login-card { box-shadow: none; border: none; }
}
</style>
