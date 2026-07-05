<template>
  <div class="page-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>本司主体（PDF 抬头 / 合同甲方 / 收款信息取数；可维护多个，标一个默认）</span>
          <el-button v-if="isAdmin" type="primary" :icon="Plus" @click="openCreate">新增主体</el-button>
        </div>
      </template>
      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column label="默认" width="70" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.is_default" type="success" size="small">默认</el-tag>
            <el-button v-else-if="isAdmin" link size="small" @click="doSetDefault(row)">设默认</el-button>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="公司全称" min-width="200" />
        <el-table-column prop="tax_no" label="税号" width="160"><template #default="{ row }">{{ row.tax_no || '—' }}</template></el-table-column>
        <el-table-column prop="bank_name" label="开户行" width="160"><template #default="{ row }">{{ row.bank_name || '—' }}</template></el-table-column>
        <el-table-column prop="bank_account" label="账号" width="180"><template #default="{ row }">{{ row.bank_account || '—' }}</template></el-table-column>
        <el-table-column v-if="isAdmin" label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-popconfirm title="确认删除？" @confirm="doRemove(row.id)">
              <template #reference><el-button link type="danger" size="small">删除</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlgVisible" :title="form.id ? '编辑本司主体' : '新增本司主体'" width="640px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
        <el-form-item label="公司全称" prop="name"><el-input v-model="form.name" /></el-form-item>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="简称"><el-input v-model="form.shortName" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="法定代表人"><el-input v-model="form.legalRep" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="地址"><el-input v-model="form.address" /></el-form-item>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="税号"><el-input v-model="form.taxNo" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="开户行"><el-input v-model="form.bankName" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="银行账号"><el-input v-model="form.bankAccount" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="设为默认"><el-switch v-model="form.isDefault" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { companyApi } from '@/api/company';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const unwrap = (res: any) => res?.data ?? res;

async function load() {
  loading.value = true;
  try { list.value = unwrap(await companyApi.list()) ?? []; } finally { loading.value = false; }
}
onMounted(load);

const dlgVisible = ref(false);
const formRef = ref<FormInstance>();
const emptyForm = () => ({
  id: 0, name: '', shortName: '', legalRep: '', address: '', phone: '',
  taxNo: '', bankName: '', bankAccount: '', remark: '', isDefault: false,
});
const form = reactive<any>(emptyForm());
const rules: FormRules = { name: [{ required: true, message: '请输入公司全称', trigger: 'blur' }] };

function openCreate() { Object.assign(form, emptyForm()); dlgVisible.value = true; }
function openEdit(row: any) {
  Object.assign(form, {
    id: row.id, name: row.name, shortName: row.short_name, legalRep: row.legal_rep,
    address: row.address, phone: row.phone, taxNo: row.tax_no, bankName: row.bank_name,
    bankAccount: row.bank_account, remark: row.remark, isDefault: row.is_default === 1,
  });
  dlgVisible.value = true;
}
async function doSave() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const dto = {
      name: form.name, shortName: form.shortName, legalRep: form.legalRep, address: form.address,
      phone: form.phone, taxNo: form.taxNo, bankName: form.bankName, bankAccount: form.bankAccount,
      remark: form.remark, isDefault: form.isDefault,
    };
    if (form.id) await companyApi.update(form.id, dto);
    else await companyApi.create(dto);
    ElMessage.success('保存成功');
    dlgVisible.value = false;
    load();
  } finally { saving.value = false; }
}
async function doSetDefault(row: any) {
  await companyApi.setDefault(row.id);
  ElMessage.success('已设为默认主体');
  load();
}
async function doRemove(id: number) {
  await companyApi.remove(id);
  ElMessage.success('删除成功');
  load();
}
</script>

<style scoped>
.page-container { padding: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
