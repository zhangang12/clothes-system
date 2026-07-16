<template>
  <div>
    <el-tabs v-model="tab">
      <!-- ================= 内部用户 ================= -->
      <el-tab-pane label="内部用户" name="users">
        <div class="toolbar">
          <el-button type="primary" :icon="Plus" @click="openCreate">新建用户</el-button>
        </div>
        <el-table :data="users" v-loading="loadingU" border stripe>
          <el-table-column prop="id" label="ID" width="60" align="center" />
          <el-table-column prop="username" label="用户名" width="150" />
          <el-table-column prop="real_name" label="姓名" width="120" />
          <el-table-column label="角色" width="120">
            <template #default="{ row }"><el-tag size="small" type="primary">{{ roleCn(row.role) }}</el-tag></template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="+row.status ? 'success' : 'info'">{{ +row.status ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="160">
            <template #default="{ row }">{{ fmt(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="{ row }">
              <div class="table-ops">
                <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
                <el-button link type="primary" size="small" @click="openReset('user', row)">重置密码</el-button>
                <el-button v-if="+row.status" link type="danger" size="small" @click="toggleUser(row, 0)">停用</el-button>
                <el-button v-else link type="success" size="small" @click="toggleUser(row, 1)">启用</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- ================= 供应商门户账号 ================= -->
      <el-tab-pane label="供应商门户账号" name="suppliers">
        <p class="muted tip">供应商账号在首次推送合同给工厂时自动开通（账号=工厂编号，初始密码 Factory@123）。此处可重置密码或启停。</p>
        <el-table :data="suppliers" v-loading="loadingS" border stripe>
          <el-table-column prop="id" label="ID" width="60" align="center" />
          <el-table-column prop="account" label="账号" width="140" />
          <el-table-column label="所属工厂" min-width="200">
            <template #default="{ row }">{{ row.factory_name || (row.factory_id ? '工厂#' + row.factory_id : '—') }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="+row.status ? 'success' : 'info'">{{ +row.status ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="最后登录" width="160">
            <template #default="{ row }">{{ row.last_login_at ? fmt(row.last_login_at) : '从未登录' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <div class="table-ops">
                <el-button link type="primary" size="small" @click="openReset('supplier', row)">重置密码</el-button>
                <el-button v-if="+row.status" link type="danger" size="small" @click="toggleSupplier(row, 0)">停用</el-button>
                <el-button v-else link type="success" size="small" @click="toggleSupplier(row, 1)">启用</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 新建 / 编辑用户 -->
    <el-dialog v-model="editOpen" :title="editRow ? '编辑用户' : '新建用户'" width="460px" @closed="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="88px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" :disabled="!!editRow" placeholder="字母/数字/下划线，3-50 位" />
        </el-form-item>
        <el-form-item label="姓名" prop="real_name"><el-input v-model="form.real_name" /></el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" style="width:100%">
            <el-option v-for="r in roleOptions" :key="r.value" :label="r.label" :value="r.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!editRow" label="初始密码" prop="password">
          <el-input v-model="form.password" type="password" show-password placeholder="≥8 位，含字母和数字" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="resetOpen" title="重置密码" width="420px" @closed="resetPwd = ''">
      <el-form label-width="88px">
        <el-form-item label="账号">{{ resetTarget?.username || resetTarget?.account }}</el-form-item>
        <el-form-item label="新密码" required>
          <el-input v-model="resetPwd" type="password" show-password placeholder="≥8 位，含字母和数字" @keyup.enter="submitReset" />
        </el-form-item>
        <p class="muted" style="margin-left:88px">重置后请把新密码告知对方，并提醒其登录后自行修改。</p>
      </el-form>
      <template #footer>
        <el-button @click="resetOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!STRONG.test(resetPwd)" @click="submitReset">确定重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage, ElMessageBox } from 'element-plus';
import { authApi } from '../../api/auth';

const STRONG = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;
const tab = ref('users');
const users = ref<any[]>([]);
const suppliers = ref<any[]>([]);
const loadingU = ref(false);
const loadingS = ref(false);

const roleOptions = [
  { value: 'ADMIN', label: '管理员' }, { value: 'BUSINESS', label: '业务员' },
  { value: 'FINANCE', label: '财务' }, { value: 'PATTERNMAKER', label: '制版师' },
  { value: 'SUPERVISOR', label: '主管' }, { value: 'SAMPLE_MAKER', label: '打样' },
];
const roleCn = (r: string) => roleOptions.find((x) => x.value === r)?.label ?? r;
const fmt = (d: string) => (d ? new Date(d).toLocaleString('zh-CN') : '');

async function loadUsers() {
  loadingU.value = true;
  try { const r: any = await authApi.adminListUsers(); users.value = r.data ?? r ?? []; }
  finally { loadingU.value = false; }
}
async function loadSuppliers() {
  loadingS.value = true;
  try { const r: any = await authApi.adminListSuppliers(); suppliers.value = r.data ?? r ?? []; }
  finally { loadingS.value = false; }
}

// 新建 / 编辑
const editOpen = ref(false);
const editRow = ref<any>(null);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = reactive({ username: '', real_name: '', role: 'BUSINESS', password: '' });
const rules: FormRules = {
  username: [{ required: true, pattern: /^[A-Za-z0-9_]{3,50}$/, message: '3-50 位，字母/数字/下划线', trigger: 'blur' }],
  real_name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  password: [{ required: true, pattern: STRONG, message: '≥8 位且含字母和数字', trigger: 'blur' }],
};
function openCreate() { editRow.value = null; editOpen.value = true; }
function openEdit(row: any) {
  editRow.value = row;
  Object.assign(form, { username: row.username, real_name: row.real_name, role: row.role, password: '' });
  editOpen.value = true;
}
function resetForm() { Object.assign(form, { username: '', real_name: '', role: 'BUSINESS', password: '' }); formRef.value?.clearValidate(); }
async function submitForm() {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  saving.value = true;
  try {
    if (editRow.value) {
      await authApi.updateUser(editRow.value.id, { real_name: form.real_name, role: form.role });
      ElMessage.success('已保存');
    } else {
      await authApi.createUser({ username: form.username, real_name: form.real_name, role: form.role, password: form.password });
      ElMessage.success('用户已创建');
    }
    editOpen.value = false; loadUsers();
  } catch { /* 拦截器已提示 */ } finally { saving.value = false; }
}

// 重置密码（内部用户 / 供应商共用）
const resetOpen = ref(false);
const resetKind = ref<'user' | 'supplier'>('user');
const resetTarget = ref<any>(null);
const resetPwd = ref('');
function openReset(kind: 'user' | 'supplier', row: any) { resetKind.value = kind; resetTarget.value = row; resetPwd.value = ''; resetOpen.value = true; }
async function submitReset() {
  if (!STRONG.test(resetPwd.value)) return;
  saving.value = true;
  try {
    if (resetKind.value === 'user') await authApi.resetUserPassword(resetTarget.value.id, resetPwd.value);
    else await authApi.resetSupplierPassword(resetTarget.value.id, resetPwd.value);
    ElMessage.success('密码已重置');
    resetOpen.value = false;
  } catch { /* 拦截器已提示 */ } finally { saving.value = false; }
}

async function toggleUser(row: any, status: number) {
  try {
    await ElMessageBox.confirm(`确定${status ? '启用' : '停用'}用户「${row.real_name}」？`, '提示', { type: 'warning' });
  } catch { return; }
  try { await authApi.updateUser(row.id, { status }); ElMessage.success(status ? '已启用' : '已停用'); loadUsers(); }
  catch { /* 拦截器已提示 */ }
}
async function toggleSupplier(row: any, status: number) {
  try {
    await ElMessageBox.confirm(`确定${status ? '启用' : '停用'}供应商账号「${row.account}」？停用后对方无法登录门户。`, '提示', { type: 'warning' });
  } catch { return; }
  try { await authApi.updateSupplier(row.id, status); ElMessage.success(status ? '已启用' : '已停用'); loadSuppliers(); }
  catch { /* 拦截器已提示 */ }
}

onMounted(() => { loadUsers(); loadSuppliers(); });
</script>

<style scoped>
.toolbar { margin-bottom: 12px; }
.muted { color: var(--gray-5, #6F7178); font-size: 13px; }
.tip { margin: 0 0 12px; }
</style>
