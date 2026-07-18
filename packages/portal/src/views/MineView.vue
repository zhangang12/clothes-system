<template>
  <div class="mine-page">
    <!-- 账号卡 -->
    <div class="mine-card">
      <div class="mine-avatar">{{ (auth.account || 'S').charAt(0).toUpperCase() }}</div>
      <div class="mine-info">
        <div class="mine-account">{{ auth.account || '供应商账号' }}</div>
        <div class="mine-role">DATEX 合作供应商</div>
      </div>
    </div>

    <van-cell-group inset class="mine-menu">
      <van-cell title="修改密码" icon="lock" is-link @click="pwdShow = true" />
    </van-cell-group>

    <div class="logout-wrap">
      <van-button block round plain type="danger" @click="doLogout">退出登录</van-button>
    </div>

    <!-- 修改密码：走通用 /auth/change-password(后端按 token 分流到供应商账号) -->
    <van-dialog
      v-model:show="pwdShow"
      title="修改密码"
      show-cancel-button
      confirm-button-text="确定修改"
      :before-close="handlePwdClose"
    >
      <div class="pwd-form">
        <van-field
          v-model="pwd.old_password" label="原密码" type="password"
          placeholder="请输入原密码" autocomplete="current-password"
        />
        <van-field
          v-model="pwd.new_password" label="新密码" type="password"
          placeholder="≥8 位，含字母和数字" autocomplete="new-password"
        />
        <van-field
          v-model="pwd.confirm" label="确认新密码" type="password"
          placeholder="再次输入新密码" autocomplete="new-password"
        />
        <div class="pwd-hint">密码至少 8 位，且须同时包含字母和数字；修改后需重新登录。</div>
      </div>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showSuccessToast, showToast } from 'vant';
import { usePortalAuthStore } from '../stores/auth';
import { http } from '../api/index';

const auth = usePortalAuthStore();
const router = useRouter();
const pwdShow = ref(false);
const pwd = ref({ old_password: '', new_password: '', confirm: '' });
const STRONG = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;

async function handlePwdClose(action: string) {
  if (action === 'cancel') { pwd.value = { old_password: '', new_password: '', confirm: '' }; return true; }
  if (!pwd.value.old_password) { showToast('请输入原密码'); return false; }
  if (!STRONG.test(pwd.value.new_password)) { showToast('新密码须 ≥8 位且含字母和数字'); return false; }
  if (pwd.value.new_password !== pwd.value.confirm) { showToast('两次输入的新密码不一致'); return false; }
  try {
    await http.patch('/auth/change-password', {
      old_password: pwd.value.old_password,
      new_password: pwd.value.new_password,
    });
    showSuccessToast('密码已修改，请重新登录');
    pwd.value = { old_password: '', new_password: '', confirm: '' };
    setTimeout(() => { auth.clearAuth(); router.push('/portal/login'); }, 800);
    return true;
  } catch {
    return false; // 拦截器已按后端 msg 提示(如「原密码不正确」)
  }
}

async function doLogout() {
  try {
    await showConfirmDialog({ title: '退出登录', message: '确认退出当前账号？' });
  } catch { return; }
  auth.clearAuth();
  router.push('/portal/login');
}
</script>

<style scoped>
.mine-page {
  min-height: calc(100vh - 46px);
  background: var(--dx-canvas, #FBF8F2);
  padding-bottom: calc(70px + env(safe-area-inset-bottom, 0px));
}
.mine-card {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 12px;
  padding: 20px 18px;
  border-radius: 14px;
  color: #fff;
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.03) 0 2px, transparent 2px 6px),
    linear-gradient(135deg, #2E8B78, #23343A);
  box-shadow: 0 4px 14px rgba(35, 52, 58, 0.18);
}
.mine-avatar {
  width: 52px; height: 52px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.92); color: #2E8B78;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: 700; flex: none;
}
.mine-account { font-size: 18px; font-weight: 600; letter-spacing: 0.5px; }
.mine-role { margin-top: 4px; font-size: 12px; color: rgba(255, 255, 255, 0.7); letter-spacing: 1px; }
.mine-menu { margin-top: 4px; }
.logout-wrap { margin: 24px 16px; }
.pwd-form { padding: 12px 0 4px; }
.pwd-hint { padding: 8px 16px 10px; font-size: 12px; color: #969799; line-height: 1.6; }
</style>
