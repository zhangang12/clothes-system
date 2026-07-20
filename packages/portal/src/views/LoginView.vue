<template>
  <div class="portal-login">
    <!-- 品牌区：墨绿→炭黑渐变 + 织物斜纹，与 DATEX 官方视觉一致 -->
    <div class="portal-brand">
      <img src="/datex-mark.png" alt="DATEX" class="portal-mark" />
      <div class="portal-name">DATEX</div>
      <div class="portal-desc">供应商协同门户</div>
    </div>

    <div class="login-card">
      <div class="card-title">账号登录</div>
      <van-form @submit="handleLogin">
        <van-cell-group inset class="login-fields">
          <van-field
            v-model="form.username" label="账号" placeholder="工厂编号，如 s001"
            autocomplete="username" clearable required
          />
          <van-field
            v-model="form.password" label="密码" type="password" placeholder="请输入密码"
            autocomplete="current-password" required
          />
        </van-cell-group>
        <div class="login-btn-wrap">
          <van-button type="primary" native-type="submit" block round :loading="loading">登 录</van-button>
        </div>
      </van-form>
      <div class="login-hint">合同推送后自动开通账号 · 如忘记密码请联系业务员重置</div>
    </div>

    <div class="login-footer">DATEX 服装智造 · 从一片布，到一张单，全程可控</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
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
    auth.setAuth(res.data, form.value.username.trim());
    router.push('/portal/contracts');
  } catch (e: any) {
    // 登录失败留在本页、输入不清空:401=账号或密码错误,其余给通用提示(M11)
    showToast(e?.response?.status === 401 ? '账号或密码错误' : (e?.response?.data?.msg ?? '网络错误，请稍后重试'));
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.portal-login {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.025) 0 2px, transparent 2px 6px),
    linear-gradient(160deg, #2E8B78 0%, #23343A 62%, #1A272C 100%);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.portal-brand { text-align: center; padding: 64px 0 30px; color: #fff; }
.portal-mark {
  width: 74px; height: 74px; border-radius: 18px; background: #fff; padding: 6px;
  box-sizing: border-box; object-fit: contain;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
}
.portal-name { font-size: 30px; font-weight: 800; font-style: italic; letter-spacing: 4px; margin-top: 12px; }
.portal-desc { font-size: 13px; letter-spacing: 4px; margin-top: 4px; color: rgba(255, 255, 255, 0.75); }

.login-card {
  margin: 0 20px;
  background: #fff;
  border-radius: 16px;
  padding: 20px 4px 16px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18);
}
.card-title { font-size: 16px; font-weight: 600; color: var(--dx-ink, #23343A); padding: 0 20px 12px; }
.login-fields { margin: 0 12px; border: 1px solid #EDEAE2; border-radius: 10px; }
.login-btn-wrap { margin: 18px 16px 4px; }
.login-hint { text-align: center; font-size: 12px; color: #9aa0a6; padding: 10px 16px 6px; }

.login-footer {
  margin-top: auto;
  text-align: center;
  font-size: 12px;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.45);
  padding: 24px 0 20px;
}
</style>
