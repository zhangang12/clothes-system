<template>
  <el-dialog :model-value="modelValue" title="修改密码" width="440px" append-to-body
    @update:model-value="(v: boolean) => emit('update:modelValue', v)" @closed="reset">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="88px" @submit.prevent>
      <el-form-item label="原密码" prop="old_password">
        <el-input v-model="form.old_password" type="password" show-password autocomplete="current-password" />
      </el-form-item>
      <el-form-item label="新密码" prop="new_password">
        <el-input v-model="form.new_password" type="password" show-password autocomplete="new-password" />
      </el-form-item>
      <el-form-item label="确认新密码" prop="confirm">
        <el-input v-model="form.confirm" type="password" show-password autocomplete="new-password" @keyup.enter="submit" />
      </el-form-item>
      <p class="pw-hint">密码至少 8 位，且须同时包含字母和数字。</p>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">确定修改</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { authApi } from '../api/auth';
import { useAuthStore } from '../stores/auth';
import { useTabsStore } from '../stores/tabs';
import { useRouter } from 'vue-router';

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const formRef = ref<FormInstance>();
const form = reactive({ old_password: '', new_password: '', confirm: '' });
const saving = ref(false);
const auth = useAuthStore();
const router = useRouter();

const STRONG = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;
const rules: FormRules = {
  old_password: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { validator: (_r, v, cb) => (STRONG.test(v) ? cb() : cb(new Error('至少 8 位且含字母和数字'))), trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    { validator: (_r, v, cb) => (v === form.new_password ? cb() : cb(new Error('两次输入不一致'))), trigger: 'blur' },
  ],
};

function reset() {
  form.old_password = ''; form.new_password = ''; form.confirm = '';
  formRef.value?.clearValidate();
}

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  saving.value = true;
  try {
    await authApi.changePassword({ old_password: form.old_password, new_password: form.new_password });
    emit('update:modelValue', false);
    ElMessage.success('密码已修改，请用新密码重新登录');
    // 改密后强制重登，旧 token 作废观感更安全；页签一并清空，重登后不该看到旧页签
    // （reset 幂等，与 MainLayout 的 logout 不冲突）
    setTimeout(() => { useTabsStore().reset(); auth.clearAuth(); router.push('/login'); }, 800);
  } catch { /* 拦截器已提示 */ } finally { saving.value = false; }
}
</script>

<style scoped>
.pw-hint { margin: 0 0 0 88px; font-size: 12px; color: var(--gray-5, #6F7178); }
</style>
