<template>
  <div class="page-container">
    <!-- 搜索栏 -->
    <el-card class="search-card">
      <el-form :model="query" inline>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="客户编号/名称" clearable style="width:200px" @clear="load" />
        </el-form-item>
        <el-form-item label="级别">
          <el-select v-model="query.grade" clearable placeholder="全部" style="width:100px" @change="load">
            <el-option label="A级" value="A" />
            <el-option label="B级" value="B" />
            <el-option label="C级" value="C" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width:100px" @change="load">
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="load">搜索</el-button>
          <el-button :icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 操作栏 -->
    <el-card class="table-card">
      <template #header>
        <div class="card-header">
          <span>客户列表</span>
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreate">新建客户</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="customer_no" label="客户编号" width="110" />
        <el-table-column prop="name" label="客户名称" min-width="180" />
        <el-table-column prop="short_name" label="简称" width="100" />
        <el-table-column prop="grade" label="级别" width="80">
          <template #default="{ row }">
            <el-tag :type="gradeTagType(row.grade)" size="small">{{ row.grade }}级</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="currency" label="结算币种" width="90" />
        <el-table-column prop="country" label="国家" width="100" />
        <el-table-column prop="contact_name" label="联系人" width="100" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="isAdmin" link :type="row.status === 1 ? 'warning' : 'success'" size="small" @click="toggleStatus(row)">
              {{ row.status === 1 ? '停用' : '启用' }}
            </el-button>
            <el-popconfirm v-if="isAdmin" title="确认删除？" @confirm="remove(row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @change="load"
        />
      </div>
    </el-card>

    <!-- 新建/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editId ? '编辑客户' : '新建客户'"
      width="600px"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="16">
            <el-form-item label="客户名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入客户全称" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="简称" prop="short_name">
              <el-input v-model="form.short_name" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="客户级别" prop="grade">
              <el-select v-model="form.grade" style="width:100%">
                <el-option label="A级" value="A" />
                <el-option label="B级" value="B" />
                <el-option label="C级" value="C" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="结算币种" prop="currency">
              <el-select v-model="form.currency" style="width:100%">
                <el-option label="USD" value="USD" />
                <el-option label="EUR" value="EUR" />
                <el-option label="CNY" value="CNY" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="国家" prop="country">
              <el-input v-model="form.country" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="付款方式" prop="payment_method">
              <el-input v-model="form.payment_method" placeholder="如：T/T 30天" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系人" prop="contact_name">
              <el-input v-model="form.contact_name" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="联系邮箱" prop="contact_email">
          <el-input v-model="form.contact_email" type="email" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Refresh, Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { customerApi } from '@/api/customer';
import { useAuthStore } from '@/stores/auth';
import { UserRole, CustomerGrade } from '@i9/types';
import type { Customer } from '@i9/types';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));

const loading = ref(false);
const saving = ref(false);
const list = ref<Customer[]>([]);
const total = ref(0);
const query = reactive({ page: 1, size: 20, keyword: '', grade: undefined as string | undefined, status: undefined as number | undefined });

function gradeTagType(grade: string) {
  return grade === 'A' ? 'danger' : grade === 'B' ? 'warning' : 'info';
}

async function load() {
  loading.value = true;
  try {
    const res = await customerApi.list(query);
    list.value = (res as any).data?.items ?? (res as any).items ?? [];
    total.value = (res as any).data?.total ?? (res as any).total ?? 0;
  } finally {
    loading.value = false;
  }
}

function reset() {
  query.keyword = '';
  query.grade = undefined;
  query.status = undefined;
  query.page = 1;
  load();
}

onMounted(load);

// Dialog
const dialogVisible = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const form = reactive({
  name: '', short_name: '', grade: CustomerGrade.B as string,
  currency: 'USD', payment_method: '', country: '',
  contact_name: '', contact_email: '', remark: '',
});
const rules: FormRules = {
  name: [{ required: true, message: '请输入客户名称', trigger: 'blur' }],
  grade: [{ required: true, message: '请选择客户级别', trigger: 'change' }],
  currency: [{ required: true, message: '请选择结算币种', trigger: 'change' }],
  contact_email: [{ type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' }],
};

function openCreate() {
  editId.value = null;
  dialogVisible.value = true;
}

function openEdit(row: Customer) {
  editId.value = row.id;
  Object.assign(form, {
    name: row.name,
    short_name: row.short_name ?? '',
    grade: row.grade,
    currency: row.currency ?? 'USD',
    payment_method: row.payment_method ?? '',
    country: row.country ?? '',
    contact_name: row.contact_name ?? '',
    contact_email: row.contact_email ?? '',
    remark: (row as any).remark ?? '',
  });
  dialogVisible.value = true;
}

function resetForm() {
  editId.value = null;
  formRef.value?.resetFields();
  Object.assign(form, {
    name: '', short_name: '', grade: CustomerGrade.B, currency: 'USD',
    payment_method: '', country: '', contact_name: '', contact_email: '', remark: '',
  });
}

async function save() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    if (editId.value) {
      await customerApi.update(editId.value, form as any);
      ElMessage.success('更新成功');
    } else {
      await customerApi.create(form as any);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row: Customer) {
  await customerApi.toggleStatus(row.id);
  ElMessage.success(row.status === 1 ? '已停用' : '已启用');
  load();
}

async function remove(id: number) {
  await customerApi.remove(id);
  ElMessage.success('删除成功');
  load();
}
</script>

<style scoped>
.page-container { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.search-card :deep(.el-card__body) { padding: 16px 16px 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
