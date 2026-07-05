<template>
  <div class="page-container">
    <el-card class="search-card">
      <el-form :model="query" inline>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="结算单号 / 款号" clearable style="width:180px" @clear="load" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width:110px" @change="load">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="已确认" value="CONFIRMED" />
          </el-select>
        </el-form-item>
        <el-form-item label="订单ID">
          <el-input-number v-model="query.order_id" :min="1" :controls="false" placeholder="订单ID" style="width:100px" @change="load" />
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
          <span>结算单列表</span>
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreate">新建结算单</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="settlement_no" label="结算单编号" width="180" />
        <el-table-column prop="order_id" label="订单ID" width="80" align="center" />
        <el-table-column prop="style_no" label="款号" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.style_no || '—' }}</template>
        </el-table-column>
        <el-table-column prop="settle_amount" label="结算金额" width="120" align="right">
          <template #default="{ row }">{{ (+(row.settle_amount ?? row.revenue ?? 0)).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="goods_amount_tax" label="总货款(含税)" width="120" align="right">
          <template #default="{ row }">{{ (+(row.goods_amount_tax ?? row.total_cost ?? 0)).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="gross_margin" label="毛利率" width="90" align="right">
          <template #default="{ row }">{{ row.gross_margin != null ? (+row.gross_margin).toFixed(2) + '%' : '—' }}</template>
        </el-table-column>
        <el-table-column prop="net_profit" label="含退税净利" width="120" align="right">
          <template #default="{ row }">
            <span :class="{ 'text-danger': +row.net_profit < 0, 'text-success': +row.net_profit > 0 }">
              {{ (+row.net_profit).toFixed(2) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'CONFIRMED' ? 'success' : 'info'" size="small">
              {{ row.status === 'CONFIRMED' ? '已确认' : '草稿' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="confirmed_at" label="确认时间" width="160">
          <template #default="{ row }">{{ row.confirmed_at ?? '--' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
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
    <el-dialog v-model="detailVisible" title="结算单详情" width="900px" destroy-on-close>
      <template v-if="detailData">
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="结算单编号">{{ detailData.settlement_no }}</el-descriptions-item>
          <el-descriptions-item label="订单ID">{{ detailData.order_id }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="detailData.status === 'CONFIRMED' ? 'success' : 'info'" size="small">
              {{ detailData.status === 'CONFIRMED' ? '已确认' : '草稿' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="款号">{{ detailData.style_no || '—' }}</el-descriptions-item>
          <el-descriptions-item label="出货件数">{{ detailData.shipped_qty ?? 0 }}</el-descriptions-item>
          <el-descriptions-item label="结算汇率">{{ detailData.exchange_rate != null ? (+detailData.exchange_rate).toFixed(4) : '—' }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">成本明细（对账付款汇总）</el-divider>
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="总货款(含税)">{{ money(detailData.goods_amount_tax ?? detailData.total_cost) }}</el-descriptions-item>
          <el-descriptions-item label="总货款(不含税)">{{ money(detailData.goods_amount_extax) }}</el-descriptions-item>
          <el-descriptions-item label="—"><span style="color:#999">含税÷1.13（无票行按含税全额）</span></el-descriptions-item>
          <el-descriptions-item label="成本单价(含税)">{{ num4(detailData.cost_per_unit_tax) }}</el-descriptions-item>
          <el-descriptions-item label="成本单价(不含税)">{{ num4(detailData.cost_per_unit_extax ?? detailData.cost_per_unit) }}</el-descriptions-item>
          <el-descriptions-item label="美金单价">{{ num4(detailData.usd_unit_price) }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">财务收汇 · 毛利对比</el-divider>
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="发票金额$">{{ money(detailData.invoice_amount_usd) }}</el-descriptions-item>
          <el-descriptions-item label="实际收汇$">{{ money(detailData.receipt_usd) }}</el-descriptions-item>
          <el-descriptions-item label="结算金额¥">{{ money(detailData.settle_amount ?? detailData.revenue) }}</el-descriptions-item>
          <el-descriptions-item label="毛利">{{ money(detailData.gross_profit) }}</el-descriptions-item>
          <el-descriptions-item label="毛利率">{{ detailData.gross_margin != null ? `${(+detailData.gross_margin).toFixed(2)}%` : '—' }}</el-descriptions-item>
          <el-descriptions-item label="财务及管理费(7%)">{{ money(detailData.finance_fee) }}</el-descriptions-item>
          <el-descriptions-item label="期间费用合计">{{ money(periodFeeTotal(detailData)) }}</el-descriptions-item>
          <el-descriptions-item label="出口退税">{{ money(detailData.tax_refund) }}</el-descriptions-item>
          <el-descriptions-item label="保本汇率(含税/不含税)">
            {{ num4(detailData.breakeven_rate_tax) }} / {{ num4(detailData.breakeven_rate_extax) }}
          </el-descriptions-item>
          <el-descriptions-item label="含退税净利">
            <span :class="{ 'text-danger': +detailData.net_profit < 0, 'text-success': +detailData.net_profit > 0 }">
              {{ (+detailData.net_profit).toFixed(2) }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="不含退税净利">
            <span :class="{ 'text-danger': +detailData.net_profit_ex_refund < 0, 'text-success': +detailData.net_profit_ex_refund > 0 }">
              {{ (+detailData.net_profit_ex_refund).toFixed(2) }}
            </span>
          </el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">成本明细行（对账付款汇总·含税）</el-divider>
        <div class="detail-toolbar" v-if="detailData.status === 'DRAFT' && canEdit">
          <el-button size="small" type="primary" @click="openAddCost">+ 添加成本行</el-button>
        </div>
        <el-table :data="detailData.costs ?? []" border size="small">
          <el-table-column prop="cost_name" label="费用名称" />
          <el-table-column prop="amount" label="金额" width="120" align="right">
            <template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="has_invoice" label="是否有票" width="90" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="row.has_invoice ? 'success' : 'info'">{{ row.has_invoice ? '有票' : '无票' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>

        <el-divider content-position="left">回款记录</el-divider>
        <div class="detail-toolbar" v-if="canEdit">
          <el-button size="small" type="primary" @click="openAddReceipt">+ 登记回款</el-button>
        </div>
        <el-table :data="detailData.receipts ?? []" border size="small">
          <el-table-column prop="receipt_date" label="回款日期" width="120" />
          <el-table-column prop="amount" label="回款金额" width="120" align="right">
            <template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" />
        </el-table>
      </template>
    </el-dialog>

    <!-- 新建结算单弹窗 -->
    <el-dialog v-model="createVisible" title="新建结算单" width="700px" @closed="resetCreateForm">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="订单ID" prop="order_id">
              <el-input-number v-model="createForm.order_id" :min="1" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结算汇率" prop="exchange_rate">
              <el-input-number v-model="createForm.exchange_rate" :min="0" :precision="4" placeholder="收汇后填" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="发票金额$">
              <el-input-number v-model="createForm.invoice_amount_usd" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="实际收汇$">
              <el-input-number v-model="createForm.receipt_usd" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider>期间费用（进净利扣减）</el-divider>
        <el-row :gutter="12">
          <el-col :span="6"><el-form-item label="运杂费" label-width="56px"><el-input-number v-model="createForm.freight_fee" :min="0" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="快邮费" label-width="56px"><el-input-number v-model="createForm.express_fee" :min="0" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="打样费" label-width="56px"><el-input-number v-model="createForm.sample_fee" :min="0" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="其它" label-width="56px"><el-input-number v-model="createForm.other_fee" :min="0" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="出口退税">
              <el-input-number v-model="createForm.tax_refund" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="createForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-divider>成本明细（对账付款汇总·含税）</el-divider>
        <div v-for="(c, idx) in createForm.costs" :key="idx" class="item-row">
          <el-row :gutter="8" align="middle">
            <el-col :span="7"><el-input v-model="c.cost_name" placeholder="费用名称" /></el-col>
            <el-col :span="6">
              <el-input-number v-model="c.amount" :min="0" :precision="2" placeholder="金额" style="width:100%" />
            </el-col>
            <el-col :span="5">
              <el-select v-model="c.has_invoice" style="width:100%">
                <el-option :value="1" label="有发票" />
                <el-option :value="0" label="无发票" />
              </el-select>
            </el-col>
            <el-col :span="3">
              <el-button link type="danger" @click="removeCostLine(idx)">删除</el-button>
            </el-col>
          </el-row>
        </div>
        <el-button style="width:100%;margin-top:8px" @click="addCostLine">+ 添加费用行</el-button>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加费用弹窗 -->
    <el-dialog v-model="addCostVisible" title="添加费用" width="420px">
      <el-form ref="addCostFormRef" :model="costForm" :rules="costRules" label-width="90px">
        <el-form-item label="费用名称" prop="cost_name">
          <el-input v-model="costForm.cost_name" />
        </el-form-item>
        <el-form-item label="金额" prop="amount">
          <el-input-number v-model="costForm.amount" :min="0.01" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="发票">
          <el-select v-model="costForm.has_invoice" style="width:100%">
            <el-option :value="1" label="有发票" />
            <el-option :value="0" label="无发票" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addCostVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doAddCost">确认</el-button>
      </template>
    </el-dialog>

    <!-- 登记回款弹窗 -->
    <el-dialog v-model="addReceiptVisible" title="登记回款" width="420px">
      <el-form ref="addReceiptFormRef" :model="receiptForm" :rules="receiptRules" label-width="90px">
        <el-form-item label="回款金额" prop="amount">
          <el-input-number v-model="receiptForm.amount" :min="0.01" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="回款日期" prop="receipt_date">
          <el-date-picker v-model="receiptForm.receipt_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="receiptForm.remark" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addReceiptVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doAddReceipt">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Refresh, Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { settlementApi } from '@/api/settlement';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.FINANCE));

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const query = reactive({
  page: 1, size: 20, keyword: '',
  status: undefined as string | undefined,
  order_id: undefined as number | undefined,
});

async function load() {
  loading.value = true;
  try {
    const res = await settlementApi.list(query);
    list.value = res?.data?.items ?? res?.items ?? [];
    total.value = res?.data?.total ?? res?.total ?? 0;
  } finally { loading.value = false; }
}

function reset() {
  Object.assign(query, { keyword: '', status: undefined, order_id: undefined, page: 1 });
  load();
}

onMounted(load);

// Detail
const detailVisible = ref(false);
const detailData = ref<any>(null);
async function viewDetail(id: number) {
  const res = await settlementApi.get(id);
  detailData.value = res?.data ?? res;
  detailVisible.value = true;
}

async function doConfirm(row: any) {
  await settlementApi.confirm(row.id);
  ElMessage.success('已确认结算单');
  load();
}

async function doRemove(id: number) {
  await settlementApi.remove(id);
  ElMessage.success('删除成功');
  load();
}

// Create
const createVisible = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({
  order_id: undefined as number | undefined,
  exchange_rate: undefined as number | undefined,
  invoice_amount_usd: undefined as number | undefined,
  receipt_usd: undefined as number | undefined,
  freight_fee: undefined as number | undefined,
  express_fee: undefined as number | undefined,
  sample_fee: undefined as number | undefined,
  other_fee: undefined as number | undefined,
  tax_refund: undefined as number | undefined,
  description: '',
  costs: [] as any[],
});
const createRules: FormRules = {
  order_id: [{ required: true, message: '请输入订单ID', trigger: 'blur' }],
};
function openCreate() { createVisible.value = true; }
function resetCreateForm() {
  Object.assign(createForm, {
    order_id: undefined, exchange_rate: undefined, invoice_amount_usd: undefined, receipt_usd: undefined,
    freight_fee: undefined, express_fee: undefined, sample_fee: undefined, other_fee: undefined,
    tax_refund: undefined, description: '', costs: [],
  });
}
// 展示辅助
const money = (v: any) => (v == null ? '—' : (+v).toFixed(2));
const num4 = (v: any) => (v == null ? '—' : (+v).toFixed(4));
const periodFeeTotal = (d: any) =>
  (+(d?.freight_fee ?? 0)) + (+(d?.express_fee ?? 0)) + (+(d?.sample_fee ?? 0)) + (+(d?.other_fee ?? 0));
function addCostLine() { createForm.costs.push({ cost_name: '', amount: undefined, has_invoice: 1 }); }
function removeCostLine(idx: number) { createForm.costs.splice(idx, 1); }
async function doCreate() {
  await createFormRef.value?.validate();
  saving.value = true;
  try {
    await settlementApi.create(createForm as any);
    ElMessage.success('创建成功');
    createVisible.value = false;
    load();
  } finally { saving.value = false; }
}

// Add Cost (in detail)
const addCostVisible = ref(false);
const addCostFormRef = ref<FormInstance>();
const costForm = reactive({ cost_name: '', amount: undefined as number | undefined, has_invoice: 1 });
const costRules: FormRules = {
  cost_name: [{ required: true, message: '请填写费用名称', trigger: 'blur' }],
  amount: [{ required: true, message: '请填写金额', trigger: 'blur' }],
};
function openAddCost() {
  Object.assign(costForm, { cost_name: '', amount: undefined, has_invoice: 1 });
  addCostVisible.value = true;
}
async function doAddCost() {
  await addCostFormRef.value?.validate();
  saving.value = true;
  try {
    await settlementApi.addCost(detailData.value.id, costForm as any);
    const full = await settlementApi.get(detailData.value.id);
    detailData.value = full?.data ?? full;
    ElMessage.success('费用已添加');
    addCostVisible.value = false;
    load();
  } finally { saving.value = false; }
}

// Add Receipt (in detail)
const addReceiptVisible = ref(false);
const addReceiptFormRef = ref<FormInstance>();
const receiptForm = reactive({ amount: undefined as number | undefined, receipt_date: '', remark: '' });
const receiptRules: FormRules = {
  amount: [{ required: true, message: '请填写回款金额', trigger: 'blur' }],
  receipt_date: [{ required: true, message: '请选择回款日期', trigger: 'change' }],
};
function openAddReceipt() {
  Object.assign(receiptForm, { amount: undefined, receipt_date: '', remark: '' });
  addReceiptVisible.value = true;
}
async function doAddReceipt() {
  await addReceiptFormRef.value?.validate();
  saving.value = true;
  try {
    await settlementApi.addReceipt(detailData.value.id, receiptForm as any);
    const full = await settlementApi.get(detailData.value.id);
    detailData.value = full?.data ?? full;
    ElMessage.success('回款已登记');
    addReceiptVisible.value = false;
  } finally { saving.value = false; }
}
</script>

<style scoped>
.page-container { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.search-card :deep(.el-card__body) { padding: 16px 16px 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
.item-row { margin-bottom: 8px; }
.detail-toolbar { margin-bottom: 8px; }
.text-danger { color: #f56c6c; }
.text-success { color: #67c23a; }
</style>
