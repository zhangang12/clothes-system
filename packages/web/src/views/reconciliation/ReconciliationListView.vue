<template>
  <div class="page-container">
    <el-card class="search-card">
      <el-form :model="query" inline>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="对账单编号" clearable style="width:180px" @clear="load" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.type" clearable placeholder="全部" style="width:120px" @change="load">
            <el-option label="合同对账" value="CONTRACT" />
            <el-option label="非合同对账" value="NO_CONTRACT" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width:110px" @change="load">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="已确认" value="CONFIRMED" />
            <el-option label="已付款" value="PAID" />
          </el-select>
        </el-form-item>
        <el-form-item label="工厂ID">
          <el-input-number v-model="query.factory_id" :min="1" :controls="false" placeholder="工厂ID" style="width:100px" @change="load" />
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
          <span>对账单列表</span>
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreate">新建对账单</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="reconcile_no" label="对账单编号" width="180" />
        <el-table-column prop="type" label="类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === 'CONTRACT' ? '' : 'warning'">
              {{ row.type === 'CONTRACT' ? '合同对账' : '非合同对账' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="factory_id" label="工厂ID" width="80" align="center" />
        <el-table-column prop="total_amount" label="对账金额" width="120" align="right">
          <template #default="{ row }">{{ (+row.total_amount).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="tax_rate" label="税率%" width="75" align="right">
          <template #default="{ row }">{{ row.tax_rate != null ? row.tax_rate + '%' : '--' }}</template>
        </el-table-column>
        <el-table-column prop="tax_amount" label="税额" width="100" align="right">
          <template #default="{ row }">{{ row.tax_amount != null ? (+row.tax_amount).toFixed(2) : '--' }}</template>
        </el-table-column>
        <el-table-column prop="has_invoice" label="含发票" width="75" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.has_invoice ? 'success' : 'info'">
              {{ row.has_invoice ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row.id)">详情</el-button>
            <el-button
              v-if="row.status === 'DRAFT' && canEdit"
              link type="success" size="small"
              @click="doConfirm(row)"
            >确认</el-button>
            <el-popconfirm v-if="row.status === 'DRAFT' && isAdmin" title="确认删除？" @confirm="doRemove(row.id)">
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

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="对账单详情" width="800px">
      <template v-if="detailData">
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="对账单编号">{{ detailData.reconcile_no }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ detailData.type === 'CONTRACT' ? '合同对账' : '非合同对账' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTagType(detailData.status)" size="small">{{ statusLabel(detailData.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="工厂ID">{{ detailData.factory_id }}</el-descriptions-item>
          <el-descriptions-item label="合同ID">{{ detailData.contract_id ?? '--' }}</el-descriptions-item>
          <el-descriptions-item label="对账金额">{{ (+detailData.total_amount).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="税率">{{ detailData.tax_rate != null ? detailData.tax_rate + '%' : '--' }}</el-descriptions-item>
          <el-descriptions-item label="税额">{{ detailData.tax_amount != null ? (+detailData.tax_amount).toFixed(2) : '--' }}</el-descriptions-item>
          <el-descriptions-item label="发票号">{{ detailData.invoice_no ?? '--' }}</el-descriptions-item>
          <el-descriptions-item label="发票金额">{{ detailData.invoice_amount != null ? (+detailData.invoice_amount).toFixed(2) : '--' }}</el-descriptions-item>
          <el-descriptions-item label="发票差额">{{ detailData.invoice_diff != null ? (+detailData.invoice_diff).toFixed(2) : '--' }}</el-descriptions-item>
          <el-descriptions-item label="确认时间">{{ detailData.confirmed_at ?? '--' }}</el-descriptions-item>
        </el-descriptions>
        <el-divider>出货明细</el-divider>
        <el-table :data="detailData.shipments ?? []" border size="small">
          <el-table-column prop="shipment_id" label="出货单ID" width="100" />
          <el-table-column prop="item_name" label="品名" />
          <el-table-column prop="snapshot_unit_price" label="单价" width="100" align="right">
            <template #default="{ row }">{{ (+row.snapshot_unit_price).toFixed(4) }}</template>
          </el-table-column>
          <el-table-column prop="qty" label="数量" width="80" align="right" />
          <el-table-column prop="amount" label="金额" width="110" align="right">
            <template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-dialog>

    <!-- 新建对账单弹窗 -->
    <el-dialog v-model="createVisible" title="新建对账单" width="800px" @closed="resetCreateForm">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="类型" prop="type">
              <el-select v-model="createForm.type" style="width:100%">
                <el-option label="合同对账" value="CONTRACT" />
                <el-option label="非合同对账" value="NO_CONTRACT" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="工厂ID" prop="factory_id">
              <el-input-number v-model="createForm.factory_id" :min="1" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="合同ID">
              <el-input-number v-model="createForm.contract_id" :min="1" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="税率%">
              <el-input-number v-model="createForm.tax_rate" :min="0" :max="100" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="发票号">
              <el-input v-model="createForm.invoice_no" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="发票金额">
              <el-input-number v-model="createForm.invoice_amount" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="createForm.description" type="textarea" :rows="2" />
        </el-form-item>

        <el-divider>出货明细</el-divider>
        <div v-for="(s, idx) in createForm.shipments" :key="idx" class="item-row">
          <el-row :gutter="8" align="middle">
            <el-col :span="4"><el-input-number v-model="s.shipment_id" :min="1" placeholder="出货单ID" style="width:100%" /></el-col>
            <el-col :span="6"><el-input v-model="s.item_name" placeholder="品名" /></el-col>
            <el-col :span="5"><el-input-number v-model="s.snapshot_unit_price" :min="0" :precision="4" placeholder="单价" style="width:100%" /></el-col>
            <el-col :span="4"><el-input-number v-model="s.qty" :min="0" :precision="2" placeholder="数量" style="width:100%" /></el-col>
            <el-col :span="3">
              <span class="amount">{{ s.snapshot_unit_price && s.qty ? (s.snapshot_unit_price * s.qty).toFixed(2) : '--' }}</span>
            </el-col>
            <el-col :span="2">
              <el-button link type="danger" @click="removeShipment(idx)">删除</el-button>
            </el-col>
          </el-row>
        </div>
        <el-button style="width:100%;margin-top:8px" @click="addShipment">+ 添加出货行</el-button>
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
import { reconciliationApi } from '@/api/reconciliation';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.FINANCE));

function statusLabel(s: string) {
  return { DRAFT: '草稿', CONFIRMED: '已确认', PAID: '已付款' }[s] ?? s;
}
function statusTagType(s: string): any {
  return { DRAFT: 'info', CONFIRMED: 'primary', PAID: 'success' }[s] ?? 'info';
}

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const query = reactive({
  page: 1, size: 20, keyword: '',
  type: undefined as string | undefined,
  status: undefined as string | undefined,
  factory_id: undefined as number | undefined,
});

async function load() {
  loading.value = true;
  try {
    const res = await reconciliationApi.list(query);
    list.value = res?.data?.items ?? res?.items ?? [];
    total.value = res?.data?.total ?? res?.total ?? 0;
  } finally { loading.value = false; }
}

function reset() {
  Object.assign(query, { keyword: '', type: undefined, status: undefined, factory_id: undefined, page: 1 });
  load();
}

onMounted(load);

// Detail
const detailVisible = ref(false);
const detailData = ref<any>(null);
async function viewDetail(id: number) {
  const res = await reconciliationApi.get(id);
  detailData.value = res?.data ?? res;
  detailVisible.value = true;
}

async function doConfirm(row: any) {
  await reconciliationApi.confirm(row.id);
  ElMessage.success('已确认对账单');
  load();
}

async function doRemove(id: number) {
  await reconciliationApi.remove(id);
  ElMessage.success('删除成功');
  load();
}

// Create
const createVisible = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({
  type: 'CONTRACT',
  factory_id: undefined as number | undefined,
  contract_id: undefined as number | undefined,
  tax_rate: undefined as number | undefined,
  invoice_no: '',
  invoice_amount: undefined as number | undefined,
  description: '',
  shipments: [] as any[],
});
const createRules: FormRules = {
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  factory_id: [{ required: true, message: '请输入工厂ID', trigger: 'blur' }],
};

function openCreate() { createVisible.value = true; }
function resetCreateForm() {
  Object.assign(createForm, {
    type: 'CONTRACT', factory_id: undefined, contract_id: undefined,
    tax_rate: undefined, invoice_no: '', invoice_amount: undefined, description: '', shipments: [],
  });
}
function addShipment() {
  createForm.shipments.push({ shipment_id: undefined, item_name: '', snapshot_unit_price: undefined, qty: undefined });
}
function removeShipment(idx: number) { createForm.shipments.splice(idx, 1); }

async function doCreate() {
  await createFormRef.value?.validate();
  if (!createForm.shipments.length) { ElMessage.warning('请至少添加一条出货明细'); return; }
  saving.value = true;
  try {
    await reconciliationApi.create(createForm as any);
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
