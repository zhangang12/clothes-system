<template>
  <div class="page-container">
    <el-card class="search-card">
      <el-form :model="query" inline>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="报价单号/款式名" clearable style="width:200px" @clear="load" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width:130px" @change="load">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="已发送" value="SENT" />
            <el-option label="已确认" value="CONFIRMED" />
            <el-option label="已转合同" value="TO_CONTRACT" />
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
          <span>报价单列表</span>
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreate">新建报价单</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="quote_no" label="报价单号" width="160" />
        <el-table-column prop="style_name" label="款式名称" min-width="140" />
        <el-table-column prop="currency" label="币种" width="70" />
        <el-table-column prop="global_loss_rate" label="损耗率%" width="90" align="right" />
        <el-table-column prop="total_qty" label="总件数" width="90" align="right" />
        <el-table-column prop="total_amount" label="总金额" width="120" align="right">
          <template #default="{ row }">
            {{ row.total_amount ? (+row.total_amount).toFixed(2) : '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row.id)">详情</el-button>
            <el-button v-if="row.status === 'DRAFT' && canEdit" link type="warning" size="small" @click="doSend(row)">发送</el-button>
            <el-button v-if="row.status === 'SENT' && canEdit" link type="success" size="small" @click="doConfirm(row)">确认</el-button>
            <el-button v-if="row.status === 'CONFIRMED' && canEdit" link type="primary" size="small" @click="doToContract(row)">转合同</el-button>
            <el-popconfirm v-if="row.status === 'DRAFT'" title="确认删除？" @confirm="remove(row.id)">
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

    <!-- 新建报价单弹窗 -->
    <el-dialog v-model="createVisible" title="新建报价单" width="680px" @closed="resetCreateForm">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="客户ID" prop="customer_id">
              <el-input-number v-model="createForm.customer_id" :min="1" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="款式名称" prop="style_name">
              <el-input v-model="createForm.style_name" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="币种" prop="currency">
              <el-select v-model="createForm.currency" style="width:100%">
                <el-option label="USD" value="USD" />
                <el-option label="EUR" value="EUR" />
                <el-option label="CNY" value="CNY" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="全局损耗率%" prop="global_loss_rate">
              <el-input-number v-model="createForm.global_loss_rate" :min="0" :max="99.99" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="总件数" prop="total_qty">
              <el-input-number v-model="createForm.total_qty" :min="0" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="createForm.remark" type="textarea" :rows="2" />
        </el-form-item>

        <!-- 费用明细 -->
        <el-divider>费用明细</el-divider>
        <div v-for="(item, idx) in createForm.items" :key="idx" class="item-row">
          <el-row :gutter="8" align="middle">
            <el-col :span="5">
              <el-input v-model="item.item_name" placeholder="项目名称" />
            </el-col>
            <el-col :span="3">
              <el-input v-model="item.unit" placeholder="单位" />
            </el-col>
            <el-col :span="4">
              <el-input-number v-model="item.usage_qty" :min="0" :precision="4" placeholder="净用量" style="width:100%" />
            </el-col>
            <el-col :span="4">
              <el-input-number v-model="item.unit_price" :min="0" :precision="4" placeholder="原单价" style="width:100%" />
            </el-col>
            <el-col :span="4">
              <el-input-number v-model="item.loss_rate" :min="0" :max="99.99" :precision="2" placeholder="损耗率%" style="width:100%" />
            </el-col>
            <el-col :span="2">
              <span class="computed-price">
                {{ calcDisplayLossPrice(item.unit_price, item.loss_rate ?? createForm.global_loss_rate) }}
              </span>
            </el-col>
            <el-col :span="2">
              <el-button link type="danger" @click="removeItem(idx)">删除</el-button>
            </el-col>
          </el-row>
        </div>
        <el-button type="dashed" style="width:100%;margin-top:8px" @click="addItem">+ 添加费用项</el-button>
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
import { quoteApi } from '@/api/quote';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));

function statusLabel(s: string) {
  const map: Record<string, string> = { DRAFT: '草稿', SENT: '已发送', CONFIRMED: '已确认', TO_CONTRACT: '已转合同' };
  return map[s] ?? s;
}
function statusTagType(s: string) {
  const map: Record<string, string> = { DRAFT: 'info', SENT: 'warning', CONFIRMED: 'success', TO_CONTRACT: 'primary' };
  return map[s] ?? 'info';
}

// 含损单价预览
function calcDisplayLossPrice(unitPrice: number | undefined, lossRate: number | undefined) {
  if (!unitPrice) return '--';
  const rate = lossRate ?? 0;
  if (rate <= 0 || rate >= 100) return unitPrice.toFixed(4);
  return (unitPrice / (1 - rate / 100)).toFixed(4);
}

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const query = reactive({ page: 1, size: 20, keyword: '', status: undefined as string | undefined });

async function load() {
  loading.value = true;
  try {
    const res = await quoteApi.list(query);
    list.value = (res as any).data?.items ?? (res as any).items ?? [];
    total.value = (res as any).data?.total ?? (res as any).total ?? 0;
  } finally {
    loading.value = false;
  }
}

function reset() { query.keyword = ''; query.status = undefined; query.page = 1; load(); }
onMounted(load);

function viewDetail(id: number) { ElMessage.info(`报价单 #${id} 详情功能待完善`); }

async function doSend(row: any) {
  await quoteApi.send(row.id);
  ElMessage.success('发送成功');
  load();
}

async function doConfirm(row: any) {
  await quoteApi.confirm(row.id);
  ElMessage.success('确认成功');
  load();
}

async function doToContract(row: any) {
  await quoteApi.toContract(row.id);
  ElMessage.success('已转合同');
  load();
}

async function remove(id: number) {
  await quoteApi.remove(id);
  ElMessage.success('删除成功');
  load();
}

// Create dialog
const createVisible = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({
  customer_id: undefined as number | undefined,
  style_name: '',
  currency: 'USD',
  global_loss_rate: 0,
  total_qty: undefined as number | undefined,
  remark: '',
  items: [] as any[],
});
const createRules: FormRules = {
  customer_id: [{ required: true, message: '请输入客户ID', trigger: 'blur' }],
};

function openCreate() { createVisible.value = true; }
function resetCreateForm() {
  Object.assign(createForm, { customer_id: undefined, style_name: '', currency: 'USD', global_loss_rate: 0, total_qty: undefined, remark: '', items: [] });
}
function addItem() {
  createForm.items.push({ item_name: '', unit: '', usage_qty: undefined, unit_price: undefined, loss_rate: undefined });
}
function removeItem(idx: number) { createForm.items.splice(idx, 1); }

async function doCreate() {
  await createFormRef.value?.validate();
  saving.value = true;
  try {
    await quoteApi.create(createForm as any);
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
.computed-price { font-size: 12px; color: #909399; }
</style>
