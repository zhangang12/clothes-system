<template>
  <div class="page-container">
    <!-- 搜索栏 -->
    <el-card class="search-card">
      <el-form :model="query" inline>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="工厂编号/名称" clearable style="width:200px" @clear="load" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.type" clearable placeholder="全部" style="width:130px" @change="load">
            <el-option label="面料厂" value="MATERIAL" />
            <el-option label="加工厂" value="PROCESS" />
            <el-option label="两者" value="BOTH" />
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
          <span>工厂列表</span>
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreate">新建工厂</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="factory_no" label="工厂编号" width="110" />
        <el-table-column prop="name" label="工厂名称" min-width="160" />
        <el-table-column prop="short_name" label="简称" width="100" />
        <el-table-column prop="type" label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="row.type === 'MATERIAL' ? 'primary' : row.type === 'BOTH' ? 'success' : 'warning'" size="small">
              {{ factoryTypeLabel(row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="contact_name" label="联系人" width="100" />
        <el-table-column prop="contact_phone" label="电话" width="130" />
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
      :title="editId ? '编辑工厂' : '新建工厂'"
      width="560px"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="工厂名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入工厂全称" />
        </el-form-item>
        <el-form-item label="简称" prop="short_name">
          <el-input v-model="form.short_name" placeholder="可选" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择" style="width:100%">
            <el-option label="面料厂" value="MATERIAL" />
            <el-option label="加工厂" value="PROCESS" />
            <el-option label="两者" value="BOTH" />
          </el-select>
        </el-form-item>
        <el-form-item label="联系人" prop="contact_name">
          <el-input v-model="form.contact_name" />
        </el-form-item>
        <el-form-item label="电话" prop="contact_phone">
          <el-input v-model="form.contact_phone" />
        </el-form-item>
        <el-form-item label="地址" prop="address">
          <el-input v-model="form.address" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="税号" prop="tax_no">
          <el-input v-model="form.tax_no" placeholder="可选" />
        </el-form-item>
        <el-form-item label="银行账户" prop="bank_account">
          <el-input v-model="form.bank_account" placeholder="可选" />
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
import { factoryApi } from '@/api/factory';
import { useAuthStore } from '@/stores/auth';
import { UserRole, FactoryType } from '@i9/types';
import type { Factory } from '@i9/types';

function factoryTypeLabel(type: string) {
  return type === 'MATERIAL' ? '面料厂' : type === 'PROCESS' ? '加工厂' : '两者';
}

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));

const loading = ref(false);
const saving = ref(false);
const list = ref<Factory[]>([]);
const total = ref(0);
const query = reactive({ page: 1, size: 20, keyword: '', type: undefined as string | undefined, status: undefined as number | undefined });

async function load() {
  loading.value = true;
  try {
    const res = await factoryApi.list(query);
    list.value = (res as any).data?.items ?? (res as any).items ?? [];
    total.value = (res as any).data?.total ?? (res as any).total ?? 0;
  } finally {
    loading.value = false;
  }
}

function reset() {
  query.keyword = '';
  query.type = undefined;
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
  name: '', short_name: '', type: '' as string, contact_name: '', contact_phone: '',
  address: '', tax_no: '', bank_name: '', bank_account: '', remark: '',
});
const rules: FormRules = {
  name: [{ required: true, message: '请输入工厂名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
};

function openCreate() {
  editId.value = null;
  dialogVisible.value = true;
}

function openEdit(row: Factory) {
  editId.value = row.id;
  Object.assign(form, {
    name: row.name, short_name: row.shortName ?? '', type: row.type,
    contact_name: (row as any).contact_name ?? '', contact_phone: (row as any).contact_phone ?? '',
    address: (row as any).address ?? '', tax_no: (row as any).tax_no ?? '',
    bank_name: (row as any).bank_name ?? '', bank_account: (row as any).bank_account ?? '',
    remark: (row as any).remark ?? '',
  });
  dialogVisible.value = true;
}

function resetForm() {
  editId.value = null;
  formRef.value?.resetFields();
  Object.assign(form, { name: '', short_name: '', type: '', contact_name: '', contact_phone: '', address: '', tax_no: '', bank_name: '', bank_account: '', remark: '' });
}

async function save() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    if (editId.value) {
      await factoryApi.update(editId.value, form as any);
      ElMessage.success('更新成功');
    } else {
      await factoryApi.create(form as any);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row: Factory) {
  await factoryApi.toggleStatus(row.id);
  ElMessage.success(row.status === 1 ? '已停用' : '已启用');
  load();
}

async function remove(id: number) {
  await factoryApi.remove(id);
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
