<template>
  <div class="page-container">
    <el-card class="search-card">
      <el-form :model="query" inline>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="合同编号" clearable style="width:180px" @clear="load" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.type" clearable placeholder="全部" style="width:110px" @change="load">
            <el-option label="面料合同" value="MATERIAL" />
            <el-option label="加工合同" value="PROCESS" />
            <el-option label="补料合同" value="SUPPLEMENT" />
          </el-select>
        </el-form-item>
        <el-form-item label="门户状态">
          <el-select v-model="query.portal_status" clearable placeholder="全部" style="width:110px" @change="load">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="已推送" value="PUSHED" />
            <el-option label="已盖章" value="STAMPED" />
            <el-option label="出货中" value="SHIPPING" />
            <el-option label="已对账" value="RECONCILED" />
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
          <span>合同列表</span>
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreate">新建合同</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="contract_no" label="合同编号" width="160" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="total_amount" label="合同金额" width="120" align="right">
          <template #default="{ row }">{{ row.currency }} {{ (+row.total_amount).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="deposit_ratio" label="定金%" width="75" align="right" />
        <el-table-column prop="account_period_days" label="账期(天)" width="80" align="right" />
        <el-table-column prop="portal_status" label="门户状态" width="100">
          <template #default="{ row }">
            <el-tag :type="portalTagType(row.portal_status)" size="small">{{ portalLabel(row.portal_status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="stamped_at" label="盖章时间" width="160" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row.id)">详情</el-button>
            <el-button
              v-if="row.portal_status === 'DRAFT' && canEdit"
              link type="warning" size="small"
              @click="doPush(row)"
            >推送门户</el-button>
            <el-popconfirm v-if="row.portal_status === 'DRAFT' && isAdmin" title="确认删除？" @confirm="remove(row.id)">
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

    <!-- 新建合同弹窗 -->
    <el-dialog v-model="createVisible" title="新建合同" width="700px" @closed="resetCreateForm">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="合同类型" prop="type">
              <el-select v-model="createForm.type" style="width:100%">
                <el-option label="面料合同" value="MATERIAL" />
                <el-option label="加工合同" value="PROCESS" />
                <el-option label="补料合同" value="SUPPLEMENT" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="工厂ID" prop="factory_id">
              <el-input-number v-model="createForm.factory_id" :min="1" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="订单ID" prop="order_id">
              <el-input-number v-model="createForm.order_id" :min="1" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="6">
            <el-form-item label="币种">
              <el-select v-model="createForm.currency" style="width:100%">
                <el-option label="CNY" value="CNY" />
                <el-option label="USD" value="USD" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="定金%">
              <el-input-number v-model="createForm.deposit_ratio" :min="0" :max="100" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="中期款%">
              <el-input-number v-model="createForm.mid_ratio" :min="0" :max="100" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="账期(天)">
              <el-input-number v-model="createForm.account_period_days" :min="0" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="createForm.remark" type="textarea" :rows="2" />
        </el-form-item>

        <el-divider>材料明细</el-divider>
        <div v-for="(m, idx) in createForm.materials" :key="idx" class="item-row">
          <el-row :gutter="8" align="middle">
            <el-col :span="5"><el-input v-model="m.item_name" placeholder="材料名称" /></el-col>
            <el-col :span="4"><el-input v-model="m.spec" placeholder="规格" /></el-col>
            <el-col :span="3"><el-input v-model="m.unit" placeholder="单位" /></el-col>
            <el-col :span="4"><el-input-number v-model="m.unit_price" :min="0" :precision="4" placeholder="单价" style="width:100%" /></el-col>
            <el-col :span="4"><el-input-number v-model="m.qty" :min="0" :precision="4" placeholder="数量" style="width:100%" /></el-col>
            <el-col :span="2"><span class="amount">{{ m.unit_price && m.qty ? (m.unit_price * m.qty).toFixed(2) : '--' }}</span></el-col>
            <el-col :span="2"><el-button link type="danger" @click="removeMaterial(idx)">删除</el-button></el-col>
          </el-row>
        </div>
        <el-button type="dashed" style="width:100%;margin-top:8px" @click="addMaterial">+ 添加材料行</el-button>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Refresh, Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { contractApi } from '@/api/contract';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));

function typeLabel(t: string) {
  return { MATERIAL: '面料合同', PROCESS: '加工合同', SUPPLEMENT: '补料合同' }[t] ?? t;
}
function portalLabel(s: string) {
  return { DRAFT: '草稿', PUSHED: '已推送', STAMPED: '已盖章', SHIPPING: '出货中', RECONCILED: '已对账' }[s] ?? s;
}
function portalTagType(s: string): any {
  return { DRAFT: 'info', PUSHED: 'warning', STAMPED: 'primary', SHIPPING: 'success', RECONCILED: '' }[s] ?? 'info';
}

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const query = reactive({ page: 1, size: 20, keyword: '', type: undefined as string | undefined, portal_status: undefined as string | undefined });

async function load() {
  loading.value = true;
  try {
    const res = await contractApi.list(query);
    list.value = (res as any).data?.items ?? (res as any).items ?? [];
    total.value = (res as any).data?.total ?? (res as any).total ?? 0;
  } finally { loading.value = false; }
}
function reset() { query.keyword = ''; query.type = undefined; query.portal_status = undefined; query.page = 1; load(); }
onMounted(load);

function viewDetail(id: number) { ElMessage.info(`合同 #${id} 详情待完善`); }

async function doPush(row: any) {
  await contractApi.push(row.id);
  ElMessage.success('已推送至供应商门户');
  load();
}

async function remove(id: number) {
  await contractApi.remove(id);
  ElMessage.success('删除成功');
  load();
}

// Create
const createVisible = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({
  type: 'MATERIAL', factory_id: undefined as number | undefined, order_id: undefined as number | undefined,
  currency: 'CNY', deposit_ratio: 30, mid_ratio: 40, account_period_days: 45, remark: '',
  materials: [] as any[],
});
const createRules: FormRules = {
  type: [{ required: true, message: '请选择合同类型', trigger: 'change' }],
  factory_id: [{ required: true, message: '请输入工厂ID', trigger: 'blur' }],
  order_id: [{ required: true, message: '请输入订单ID', trigger: 'blur' }],
};
function openCreate() { createVisible.value = true; }
function resetCreateForm() {
  Object.assign(createForm, { type: 'MATERIAL', factory_id: undefined, order_id: undefined, currency: 'CNY', deposit_ratio: 30, mid_ratio: 40, account_period_days: 45, remark: '', materials: [] });
}
function addMaterial() { createForm.materials.push({ item_name: '', spec: '', unit: '', unit_price: undefined, qty: undefined }); }
function removeMaterial(idx: number) { createForm.materials.splice(idx, 1); }
async function doCreate() {
  await createFormRef.value?.validate();
  if (!createForm.materials.length) { ElMessage.warning('请至少添加一条材料明细'); return; }
  saving.value = true;
  try {
    await contractApi.create(createForm as any);
    ElMessage.success('创建成功');
    createVisible.value = false;
    load();
  } finally { saving.value = false; }
}
</script>

<style scoped>
.page-container { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.search-card :deep(.el-card__body) { padding: 16px 16px 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
.item-row { margin-bottom: 8px; }
.amount { font-size: 12px; color: #909399; }
</style>
