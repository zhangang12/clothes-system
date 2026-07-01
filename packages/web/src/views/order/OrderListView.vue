<template>
  <div class="page-container">
    <el-card class="search-card">
      <el-form :model="query" inline>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="订单号/PO/款式" clearable style="width:200px" @clear="load" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width:120px" @change="load">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="已确认" value="CONFIRMED" />
            <el-option label="生产中" value="PRODUCING" />
            <el-option label="已出货" value="SHIPPED" />
            <el-option label="已完成" value="DONE" />
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
          <span>订单列表</span>
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreate">新建订单</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="order_no" label="订单号" width="150" />
        <el-table-column prop="customer_po" label="客户PO" width="120" />
        <el-table-column prop="style_name" label="款式名称" min-width="130" />
        <el-table-column prop="qty_total" label="总件数" width="90" align="right" />
        <el-table-column prop="currency" label="币种" width="70" />
        <el-table-column prop="total_amount" label="总金额" width="120" align="right">
          <template #default="{ row }">
            {{ row.total_amount ? (+row.total_amount).toFixed(2) : '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="delivery_date" label="交货期" width="110" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row.id)">详情</el-button>
            <el-button
              v-if="row.status !== 'DONE' && canEdit"
              link type="warning" size="small"
              @click="doAdvance(row)"
            >{{ nextStatusLabel(row.status) }}</el-button>
            <el-button
              v-if="['PRODUCING','SHIPPED'].includes(row.status) && canEdit"
              link type="success" size="small"
              @click="openShipment(row)"
            >出货</el-button>
            <el-popconfirm v-if="row.status === 'DRAFT' && isAdmin" title="确认删除？" @confirm="remove(row.id)">
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

    <!-- 新建订单弹窗 -->
    <el-dialog v-model="createVisible" title="新建订单" width="600px" @closed="resetCreateForm">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="客户ID" prop="customer_id">
              <el-input-number v-model="createForm.customer_id" :min="1" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户PO">
              <el-input v-model="createForm.customer_po" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="16">
            <el-form-item label="款式名称">
              <el-input v-model="createForm.style_name" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="币种">
              <el-select v-model="createForm.currency" style="width:100%">
                <el-option label="USD" value="USD" />
                <el-option label="EUR" value="EUR" />
                <el-option label="CNY" value="CNY" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="总件数" prop="qty_total">
              <el-input-number v-model="createForm.qty_total" :min="0" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="客户单价">
              <el-input-number v-model="createForm.unit_price" :min="0" :precision="4" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="交货期">
              <el-date-picker v-model="createForm.delivery_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="createForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 出货记录弹窗 -->
    <el-dialog v-model="shipmentVisible" title="添加出货记录" width="460px">
      <el-form :model="shipmentForm" label-width="90px">
        <el-form-item label="发货日期">
          <el-date-picker v-model="shipmentForm.shipment_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="发货件数">
          <el-input-number v-model="shipmentForm.qty" :min="1" style="width:100%" />
        </el-form-item>
        <el-form-item label="箱数">
          <el-input-number v-model="shipmentForm.cartons" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="运单号">
          <el-input v-model="shipmentForm.tracking_no" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="shipmentForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shipmentVisible = false">取消</el-button>
        <el-button type="primary" @click="doAddShipment">确认出货</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Refresh, Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { orderApi } from '@/api/order';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));

function statusLabel(s: string) {
  const map: Record<string, string> = { DRAFT: '草稿', CONFIRMED: '已确认', PRODUCING: '生产中', SHIPPED: '已出货', DONE: '已完成' };
  return map[s] ?? s;
}
function statusTagType(s: string) {
  const map: Record<string, string> = { DRAFT: 'info', CONFIRMED: 'warning', PRODUCING: 'primary', SHIPPED: 'success', DONE: '' };
  return (map[s] ?? 'info') as any;
}
function nextStatusLabel(s: string) {
  const map: Record<string, string> = { DRAFT: '确认', CONFIRMED: '开始生产', PRODUCING: '出货', SHIPPED: '完成' };
  return map[s] ?? '推进';
}

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const query = reactive({ page: 1, size: 20, keyword: '', status: undefined as string | undefined });

async function load() {
  loading.value = true;
  try {
    const res = await orderApi.list(query);
    list.value = (res as any).data?.items ?? (res as any).items ?? [];
    total.value = (res as any).data?.total ?? (res as any).total ?? 0;
  } finally { loading.value = false; }
}
function reset() { query.keyword = ''; query.status = undefined; query.page = 1; load(); }
onMounted(load);

function viewDetail(id: number) { ElMessage.info(`订单 #${id} 详情待完善`); }

async function doAdvance(row: any) {
  await orderApi.advance(row.id);
  ElMessage.success('状态已推进');
  load();
}

async function remove(id: number) {
  await orderApi.remove(id);
  ElMessage.success('删除成功');
  load();
}

// Create
const createVisible = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({
  customer_id: undefined as number | undefined, customer_po: '', style_name: '',
  currency: 'USD', qty_total: 0, unit_price: undefined as number | undefined,
  delivery_date: '', remark: '',
});
const createRules: FormRules = {
  customer_id: [{ required: true, message: '请输入客户ID', trigger: 'blur' }],
  qty_total: [{ required: true, message: '请输入总件数', trigger: 'blur' }],
};
function openCreate() { createVisible.value = true; }
function resetCreateForm() {
  Object.assign(createForm, { customer_id: undefined, customer_po: '', style_name: '', currency: 'USD', qty_total: 0, unit_price: undefined, delivery_date: '', remark: '' });
}
async function doCreate() {
  await createFormRef.value?.validate();
  saving.value = true;
  try {
    await orderApi.create(createForm as any);
    ElMessage.success('创建成功');
    createVisible.value = false;
    load();
  } finally { saving.value = false; }
}

// Shipment
const shipmentVisible = ref(false);
const shipmentForm = reactive({ shipment_date: '', qty: 1, cartons: undefined as number | undefined, tracking_no: '', remark: '' });
let currentOrderId = 0;
function openShipment(row: any) { currentOrderId = row.id; Object.assign(shipmentForm, { shipment_date: '', qty: 1, cartons: undefined, tracking_no: '', remark: '' }); shipmentVisible.value = true; }
async function doAddShipment() {
  if (!shipmentForm.shipment_date || !shipmentForm.qty) { ElMessage.warning('请填写发货日期和件数'); return; }
  await orderApi.addShipment(currentOrderId, shipmentForm as any);
  ElMessage.success('出货记录已添加');
  shipmentVisible.value = false;
  load();
}
</script>

<style scoped>
.page-container { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.search-card :deep(.el-card__body) { padding: 16px 16px 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
