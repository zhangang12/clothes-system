<template>
  <div class="page-container">
    <el-card class="search-card">
      <el-form :model="query" inline>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="样衣编号/款式名" clearable style="width:200px" @clear="load" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width:130px" @change="load">
            <el-option label="待打版" value="PENDING" />
            <el-option label="打版中" value="PATTERN" />
            <el-option label="打版完成" value="DONE" />
            <el-option label="已确认" value="CONFIRMED" />
            <el-option label="已驳回" value="REJECTED" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="load">搜索</el-button>
          <el-button :icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <template #header>
        <div class="card-header">
          <span>样衣列表</span>
          <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate">新建样衣</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="sample_no" label="样衣编号" width="160" />
        <el-table-column prop="style_name" label="款式名称" min-width="150" />
        <el-table-column prop="season" label="季节" width="80" />
        <el-table-column prop="category" label="品类" width="100" />
        <el-table-column prop="version" label="版次" width="70" align="center" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
            <el-button
              v-if="row.status === 'PENDING' && canEdit"
              link type="warning" size="small"
              @click="openAssign(row)"
            >指派版师</el-button>
            <el-button
              v-if="row.status === 'PATTERN' && isPatternmaker"
              link type="success" size="small"
              @click="openSubmit(row)"
            >提交版次</el-button>
            <el-button
              v-if="row.status === 'DONE' && canEdit"
              link type="success" size="small"
              @click="doConfirm(row)"
            >确认</el-button>
            <el-button
              v-if="row.status === 'DONE' && canEdit"
              link type="danger" size="small"
              @click="openReject(row)"
            >驳回</el-button>
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

    <!-- 新建弹窗 -->
    <el-dialog v-model="createVisible" title="新建样衣" width="500px" @closed="resetCreateForm">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="90px">
        <el-form-item label="客户ID" prop="customer_id">
          <el-input-number v-model="createForm.customer_id" :min="1" style="width:100%" />
        </el-form-item>
        <el-form-item label="款式名称" prop="style_name">
          <el-input v-model="createForm.style_name" />
        </el-form-item>
        <el-form-item label="季节" prop="season">
          <el-input v-model="createForm.season" placeholder="如：2024春夏" />
        </el-form-item>
        <el-form-item label="品类" prop="category">
          <el-input v-model="createForm.category" placeholder="如：外套" />
        </el-form-item>
        <el-form-item label="工艺要求" prop="process_req">
          <el-input v-model="createForm.process_req" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 指派版师弹窗 -->
    <el-dialog v-model="assignVisible" title="指派版师" width="360px">
      <el-form label-width="90px">
        <el-form-item label="版师ID">
          <el-input-number v-model="assignForm.patternmaker_id" :min="1" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" @click="doAssign">确认</el-button>
      </template>
    </el-dialog>

    <!-- 提交版次弹窗 -->
    <el-dialog v-model="submitVisible" title="提交版次" width="400px">
      <el-form label-width="90px">
        <el-form-item label="备注">
          <el-input v-model="submitForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="submitVisible = false">取消</el-button>
        <el-button type="primary" @click="doSubmit">提交</el-button>
      </template>
    </el-dialog>

    <!-- 驳回弹窗 -->
    <el-dialog v-model="rejectVisible" title="驳回样衣" width="400px">
      <el-form label-width="90px">
        <el-form-item label="驳回原因">
          <el-input v-model="rejectReason" type="textarea" :rows="3" placeholder="请输入驳回原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" @click="doReject">确认驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Refresh, Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { sampleApi } from '@/api/sample';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canCreate = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));
const isPatternmaker = computed(() => authStore.hasRole(UserRole.PATTERNMAKER) || authStore.hasRole(UserRole.ADMIN));

function statusLabel(s: string) {
  const map: Record<string, string> = { PENDING: '待打版', PATTERN: '打版中', DONE: '打版完成', CONFIRMED: '已确认', REJECTED: '已驳回' };
  return map[s] ?? s;
}
function statusTagType(s: string) {
  const map: Record<string, string> = { PENDING: 'info', PATTERN: 'warning', DONE: 'primary', CONFIRMED: 'success', REJECTED: 'danger' };
  return map[s] ?? 'info';
}

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const query = reactive({ page: 1, size: 20, keyword: '', status: undefined as string | undefined });

async function load() {
  loading.value = true;
  try {
    const res = await sampleApi.list(query);
    list.value = (res as any).data?.items ?? (res as any).items ?? [];
    total.value = (res as any).data?.total ?? (res as any).total ?? 0;
  } finally {
    loading.value = false;
  }
}

function reset() {
  query.keyword = '';
  query.status = undefined;
  query.page = 1;
  load();
}

onMounted(load);

// Create
const createVisible = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({ customer_id: undefined as number | undefined, style_name: '', season: '', category: '', process_req: '' });
const createRules: FormRules = {
  customer_id: [{ required: true, message: '请输入客户ID', trigger: 'blur' }],
  style_name: [{ required: true, message: '请输入款式名称', trigger: 'blur' }],
};
function openCreate() { createVisible.value = true; }
function resetCreateForm() { Object.assign(createForm, { customer_id: undefined, style_name: '', season: '', category: '', process_req: '' }); }
async function doCreate() {
  await createFormRef.value?.validate();
  saving.value = true;
  try {
    await sampleApi.create(createForm as any);
    ElMessage.success('创建成功');
    createVisible.value = false;
    load();
  } finally { saving.value = false; }
}

// Detail
function openDetail(row: any) { ElMessage.info(`样衣 ${row.sample_no} 详情功能待完善`); }

// Assign
const assignVisible = ref(false);
const assignForm = reactive({ patternmaker_id: undefined as number | undefined });
let currentId = 0;
function openAssign(row: any) { currentId = row.id; assignForm.patternmaker_id = undefined; assignVisible.value = true; }
async function doAssign() {
  if (!assignForm.patternmaker_id) { ElMessage.warning('请输入版师ID'); return; }
  await sampleApi.assign(currentId, assignForm.patternmaker_id);
  ElMessage.success('指派成功');
  assignVisible.value = false;
  load();
}

// Submit
const submitVisible = ref(false);
const submitForm = reactive({ remark: '' });
function openSubmit(row: any) { currentId = row.id; submitForm.remark = ''; submitVisible.value = true; }
async function doSubmit() {
  await sampleApi.submit(currentId, { remark: submitForm.remark });
  ElMessage.success('提交成功');
  submitVisible.value = false;
  load();
}

// Confirm
async function doConfirm(row: any) {
  await sampleApi.confirm(row.id);
  ElMessage.success('确认成功');
  load();
}

// Reject
const rejectVisible = ref(false);
const rejectReason = ref('');
function openReject(row: any) { currentId = row.id; rejectReason.value = ''; rejectVisible.value = true; }
async function doReject() {
  if (!rejectReason.value) { ElMessage.warning('请输入驳回原因'); return; }
  await sampleApi.reject(currentId, rejectReason.value);
  ElMessage.success('驳回成功');
  rejectVisible.value = false;
  load();
}

async function remove(id: number) {
  await sampleApi.remove(id);
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
