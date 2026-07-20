<template>
  <div>
    <el-tabs v-model="tab">
      <!-- ================= 内部用户 ================= -->
      <el-tab-pane label="内部用户" name="users">
        <div class="toolbar">
          <el-button type="primary" :icon="Plus" @click="openCreate">新建用户</el-button>
          <span v-if="!isAdminActor" class="muted">主管可管理账号，但只能指派 业务员/版师/船务/财务/打样间 角色</span>
        </div>
        <el-table :data="users" v-loading="loadingU" border stripe>
          <el-table-column prop="id" label="ID" width="60" align="center" />
          <el-table-column prop="username" label="用户名" width="140" />
          <el-table-column prop="real_name" label="姓名" width="110" />
          <el-table-column label="角色" width="100">
            <template #default="{ row }"><el-tag size="small" type="primary">{{ roleCn(row.role) }}</el-tag></template>
          </el-table-column>
          <el-table-column label="菜单权限" min-width="130">
            <template #default="{ row }">
              <span v-if="row.role === 'ADMIN'" class="muted">全部菜单</span>
              <el-tag v-else-if="row.menu_keys" size="small" type="warning">自定义 {{ row.menu_keys.length }} 项</el-tag>
              <span v-else class="muted">角色默认</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="+row.status ? 'success' : 'info'">{{ +row.status ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="160">
            <template #default="{ row }">{{ fmt(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="230" fixed="right">
            <template #default="{ row }">
              <div class="table-ops">
                <template v-if="canTouchRow(row)">
                  <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
                  <el-button link type="primary" size="small" @click="openReset('user', row)">重置密码</el-button>
                  <el-button v-if="+row.status" link type="danger" size="small" @click="toggleUser(row, 0)">停用</el-button>
                  <el-button v-else link type="success" size="small" @click="toggleUser(row, 1)">启用</el-button>
                </template>
                <span v-else class="muted">仅管理员可管</span>
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
    <el-dialog v-model="editOpen" :title="editRow ? '编辑用户' : '新建用户'" width="560px" @closed="resetForm">
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

        <!-- 账号级菜单权限：ADMIN 恒全菜单无需配置；其余角色默认按岗位，可自定义收敛 -->
        <el-form-item v-if="form.role === 'ADMIN'" label="菜单权限">
          <span class="muted">管理员可见全部菜单，无需配置</span>
        </el-form-item>
        <el-form-item v-else label="菜单权限">
          <div class="menu-conf">
            <el-radio-group v-model="menuMode">
              <el-radio value="default">按角色默认（{{ defaultMenuCount }} 项）</el-radio>
              <el-radio value="custom">自定义</el-radio>
            </el-radio-group>
            <div v-if="menuMode === 'custom'" class="menu-grid">
              <el-checkbox
                v-for="m in selectableMenus" :key="m.key"
                :model-value="checkedMenus.includes(m.key)"
                @change="toggleMenu(m.key)"
              >{{ m.label }}</el-checkbox>
            </div>
            <p class="muted" style="margin:4px 0 0">下次登录生效；工作台始终可见</p>
          </div>
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
import { computed, reactive, ref, onMounted } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage, ElMessageBox } from 'element-plus';
import { UserRole, MENU_REGISTRY, ROLE_DEFAULT_MENUS } from '@i9/types';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../stores/auth';

const STRONG = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;
const auth = useAuthStore();
// 本页仅 ADMIN/SUPERVISOR 可达（路由 meta.menu=accounts + 后端 @Roles 双保险）
const isAdminActor = computed(() => auth.hasRole(UserRole.ADMIN));
// 主管防线（与服务端一致）：不能碰 ADMIN/SUPERVISOR 账号
const canTouchRow = (row: any) => isAdminActor.value || !['ADMIN', 'SUPERVISOR'].includes(row.role);

const tab = ref('users');
const users = ref<any[]>([]);
const suppliers = ref<any[]>([]);
const loadingU = ref(false);
const loadingS = ref(false);

const ALL_ROLES = [
  { value: 'ADMIN', label: '管理员' }, { value: 'BUSINESS', label: '业务员' },
  { value: 'FINANCE', label: '财务' }, { value: 'PATTERNMAKER', label: '版师' },
  { value: 'SUPERVISOR', label: '主管' }, { value: 'SAMPLE_MAKER', label: '打样间' },
  { value: 'SHIPPING', label: '船务' },
];
// 主管只能指派 5 种非管理角色（服务端同样拦截，这里是第一道 UX 防线）
const SUPERVISOR_ASSIGNABLE = ['BUSINESS', 'FINANCE', 'PATTERNMAKER', 'SAMPLE_MAKER', 'SHIPPING'];
const roleOptions = computed(() =>
  isAdminActor.value ? ALL_ROLES : ALL_ROLES.filter((r) => SUPERVISOR_ASSIGNABLE.includes(r.value)));
const roleCn = (r: string) => ALL_ROLES.find((x) => x.value === r)?.label ?? r;
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

// ── 菜单权限配置 ──
const menuMode = ref<'default' | 'custom'>('default');
const checkedMenus = ref<string[]>([]);
// 可分配的菜单：adminOnly 项不开放给普通角色；「账号管理」仅目标为主管时可配（与后端口径一致）
const selectableMenus = computed(() =>
  MENU_REGISTRY.filter((m) => !m.adminOnly || (m.key === 'accounts' && form.role === 'SUPERVISOR')));
const defaultMenuCount = computed(() =>
  (ROLE_DEFAULT_MENUS[form.role as UserRole] ?? ['dashboard']).length);
function toggleMenu(key: string) {
  const i = checkedMenus.value.indexOf(key);
  if (i >= 0) checkedMenus.value.splice(i, 1);
  else checkedMenus.value.push(key);
}

function openCreate() { editRow.value = null; editOpen.value = true; }
function openEdit(row: any) {
  editRow.value = row;
  Object.assign(form, { username: row.username, real_name: row.real_name, role: row.role, password: '' });
  menuMode.value = row.menu_keys ? 'custom' : 'default';
  checkedMenus.value = Array.isArray(row.menu_keys) ? [...row.menu_keys] : [];
  editOpen.value = true;
}
function resetForm() {
  Object.assign(form, { username: '', real_name: '', role: 'BUSINESS', password: '' });
  menuMode.value = 'default'; checkedMenus.value = [];
  formRef.value?.clearValidate();
}
async function submitForm() {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  // ADMIN 恒全菜单（服务端强制存 NULL）；其余按配置：默认=null / 自定义=勾选的 key
  const menuKeys = form.role === 'ADMIN' ? null : (menuMode.value === 'custom' ? [...checkedMenus.value] : null);
  saving.value = true;
  try {
    if (editRow.value) {
      await authApi.updateUser(editRow.value.id, { real_name: form.real_name, role: form.role, menuKeys });
      ElMessage.success('已保存（菜单权限下次登录生效）');
    } else {
      await authApi.createUser({ username: form.username, real_name: form.real_name, role: form.role, password: form.password, menuKeys });
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
.toolbar { margin-bottom: 12px; display: flex; align-items: center; gap: 12px; }
.muted { color: var(--gray-5, #6F7178); font-size: 13px; }
.tip { margin: 0 0 12px; }
.menu-conf { width: 100%; }
.menu-grid { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 6px; padding: 8px 10px; background: var(--el-fill-color-light); border-radius: 8px; }
</style>
