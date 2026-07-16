<template>
  <div class="page-container">
    <RuleHint>拼柜<b>一票多款</b>:每款一行、金额为该款发票金额;逐笔收汇<b>按各款发票金额占比分摊</b>;在结算单点「同步发票收汇」即按订单份额拉取收汇。</RuleHint>
    <el-card class="search-card">
      <el-form inline>
        <el-form-item label="关键词">
          <el-input v-model="keyword" placeholder="发票号 / 客户" clearable style="width:200px" @clear="load" @keyup.enter="load" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="load">搜索</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <template #header>
        <div class="card-header">
          <span>出口发票（收入侧留痕 · 拼柜一票多款按金额占比分摊收汇）</span>
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreate">登记发票</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="invoice_no" label="发票号" width="160" />
        <el-table-column prop="invoice_date" label="开票日期" width="110">
          <template #default="{ row }">{{ row.invoice_date || '—' }}</template>
        </el-table-column>
        <el-table-column prop="customer_name" label="抬头客户" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.customer_name || '—' }}</template>
        </el-table-column>
        <el-table-column label="款项行" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            {{ (row.items ?? []).map((it: any) => `${it.style_no ?? '款'}:${(+it.amount).toFixed(2)}`).join(' / ') || '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="total_amount" label="发票总额$" width="110" align="right">
          <template #default="{ row }">{{ (+row.total_amount).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="已收汇$" width="120" align="right">
          <template #default="{ row }">
            {{ (+(row.receipt_total ?? 0)).toFixed(2) }}
            <el-tag v-if="+(row.receipt_total ?? 0) + 0.01 < +row.total_amount" type="warning" size="small">待收汇</el-tag>
            <el-tag v-else type="success" size="small">已收齐</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row.id)">详情/收汇</el-button>
            <el-popconfirm v-if="isAdmin && !+(row.receipt_count ?? 0)" title="确认删除？" @confirm="doRemove(row.id)">
              <template #reference><el-button link type="danger" size="small">删除</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination v-model:current-page="page" v-model:page-size="size" :total="total"
          :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next" @change="load" />
      </div>
    </el-card>

    <!-- 登记发票 -->
    <el-dialog v-model="createVisible" title="登记出口发票" width="640px" @closed="resetForm">
      <el-form :model="form" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="发票号" required>
              <el-input v-model="form.invoice_no" placeholder="唯一" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="开票日期">
              <el-date-picker v-model="form.invoice_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="抬头客户">
              <el-input v-model="form.customer_name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注">
              <el-input v-model="form.remark" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider>款项行（拼柜一票多款：每款一行，金额为该款发票金额）</el-divider>
        <div v-for="(it, idx) in form.items" :key="idx" class="item-row">
          <el-row :gutter="8" align="middle">
            <el-col :span="10">
              <el-select v-model="it.order_id" filterable clearable placeholder="关联订单(结算据此拉收汇)" style="width:100%" @change="(v: any) => onPickOrder(it, v)">
                <el-option v-for="o in orders" :key="o.id" :label="`${o.style_no || '无款号'} · ${o.order_no}`" :value="o.id" />
              </el-select>
            </el-col>
            <el-col :span="6"><el-input v-model="it.style_no" placeholder="款号" /></el-col>
            <el-col :span="5">
              <el-input-number v-model="it.amount" :min="0.01" :precision="2" :controls="false" placeholder="金额$" style="width:100%" />
            </el-col>
            <el-col :span="3"><el-button link type="danger" @click="form.items.splice(idx, 1)">删除</el-button></el-col>
          </el-row>
        </div>
        <el-button style="width:100%;margin-top:8px" @click="form.items.push({ order_id: undefined, style_no: '', amount: undefined })">+ 加款项行</el-button>
        <div class="hint" style="margin-top:6px">发票总额 = 各行合计：<b>{{ itemsTotal.toFixed(2) }}</b></div>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 详情/收汇 -->
    <el-dialog v-model="detailVisible" title="发票详情 · 逐笔收汇" width="760px" destroy-on-close>
      <template v-if="detail">
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="发票号">{{ detail.invoice_no }}</el-descriptions-item>
          <el-descriptions-item label="总额$">{{ (+detail.total_amount).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="已收/差额$">
            {{ (+detail.receipt_total).toFixed(2) }} / <span :class="{ 'text-danger': +detail.receipt_balance > 0.01 }">{{ (+detail.receipt_balance).toFixed(2) }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <el-divider content-position="left">款项行（收汇按金额占比分摊到各款）</el-divider>
        <el-table :data="detail.items" border size="small">
          <el-table-column prop="style_no" label="款号" width="130" />
          <el-table-column prop="order_id" label="订单ID" width="90" align="center">
            <template #default="{ row }">{{ row.order_id ?? '—' }}</template>
          </el-table-column>
          <el-table-column prop="amount" label="金额$" width="110" align="right">
            <template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="占比" align="right">
            <template #default="{ row }">{{ +detail.total_amount ? ((+row.amount / +detail.total_amount) * 100).toFixed(1) + '%' : '—' }}</template>
          </el-table-column>
        </el-table>
        <el-divider content-position="left">逐笔收汇（多笔多汇率）</el-divider>
        <div class="detail-toolbar" v-if="canEdit">
          <el-button size="small" type="primary" @click="receiptVisible = true">+ 登记收汇</el-button>
        </div>
        <el-table :data="detail.receipts" border size="small">
          <el-table-column prop="receipt_date" label="日期" width="110" />
          <el-table-column prop="amount" label="金额$" width="110" align="right">
            <template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="exchange_rate" label="汇率" width="90" align="right">
            <template #default="{ row }">{{ row.exchange_rate != null ? (+row.exchange_rate).toFixed(4) : '—' }}</template>
          </el-table-column>
          <el-table-column label="水单" width="70" align="center">
            <template #default="{ row }">
              <el-link v-if="row.slip_url" type="primary" @click="openFile(row.slip_url)">查看</el-link>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" show-overflow-tooltip />
          <el-table-column v-if="canEdit" label="操作" width="70" align="center">
            <template #default="{ row }">
              <el-popconfirm title="删除该笔收汇？" @confirm="doRemoveReceipt(row.id)">
                <template #reference><el-button link type="danger" size="small">删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-dialog>

    <!-- 登记收汇 -->
    <el-dialog v-model="receiptVisible" title="登记收汇" width="440px">
      <el-form :model="receiptForm" label-width="90px">
        <el-form-item label="金额$" required>
          <el-input-number v-model="receiptForm.amount" :min="0.01" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="该笔汇率">
          <el-input-number v-model="receiptForm.exchange_rate" :min="0" :precision="4" placeholder="按银行水单" style="width:100%" />
        </el-form-item>
        <el-form-item label="收汇日期" required>
          <el-date-picker v-model="receiptForm.receipt_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="银行水单">
          <FileUpload v-model="receiptForm.slip_url" :limit="1" accept="image/*,.pdf" list-type="text" sensitive />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="receiptForm.remark" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="receiptVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doAddReceipt">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { errToast } from '@/api';
import { useRoute } from 'vue-router';
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Plus } from '@element-plus/icons-vue';
import { exportInvoiceApi } from '@/api/exportInvoice';
import { orderApi } from '@/api/order';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';
import FileUpload from '@/components/FileUpload.vue';
import { openFile } from '@/utils/secureFile';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => isAdmin.value || authStore.hasRole(UserRole.FINANCE) || authStore.hasRole(UserRole.BUSINESS));

const loading = ref(false);
const saving = ref(false);
const route = useRoute();
const list = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const keyword = ref('');

async function load() {
  loading.value = true;
  try {
    const res: any = await exportInvoiceApi.list({ page: page.value, size: size.value, keyword: keyword.value || undefined });
    list.value = res?.data ?? [];
    total.value = res?.total ?? 0;
  } finally { loading.value = false; }
}

const orders = ref<any[]>([]);
async function loadOrders() {
  try { orders.value = ((await orderApi.list({ page: 1, size: 100 })) as any).data ?? []; } catch { orders.value = []; }
}
function onPickOrder(it: any, id: number) {
  const o = orders.value.find((x: any) => x.id === id);
  if (o?.style_no && !it.style_no) it.style_no = o.style_no;
}
onMounted(async () => {
  await Promise.all([load(), loadOrders()]);
  // 别的单据跳过来(/export-invoices/:id/view):自动打开该单详情
  const rid = Number(route.params.id);
  if (rid) {
    try { await viewDetail(rid); }
    catch (e: any) { errToast(e?.response?.data?.msg ?? '出口发票不存在或已删除'); }
  }
});

// 创建
const createVisible = ref(false);
const form = reactive({
  invoice_no: '', invoice_date: '', customer_name: '', remark: '',
  items: [{ order_id: undefined as number | undefined, style_no: '', amount: undefined as number | undefined }],
});
const itemsTotal = computed(() => form.items.reduce((s, it) => s + (Number(it.amount) || 0), 0));
function openCreate() { createVisible.value = true; }
function resetForm() {
  Object.assign(form, { invoice_no: '', invoice_date: '', customer_name: '', remark: '', items: [{ order_id: undefined, style_no: '', amount: undefined }] });
}
async function doCreate() {
  if (!form.invoice_no.trim()) { ElMessage.warning('请填写发票号'); return; }
  const items = form.items.filter((it) => Number(it.amount) > 0);
  if (!items.length) { ElMessage.warning('请至少填写一行款项(金额>0)'); return; }
  saving.value = true;
  try {
    await exportInvoiceApi.create({ ...form, items });
    ElMessage.success('发票已登记');
    createVisible.value = false;
    load();
  } catch (e: any) {
    errToast(e?.response?.data?.msg ?? e?.response?.data?.msg ?? '登记失败');
  } finally { saving.value = false; }
}

// 详情/收汇
const detailVisible = ref(false);
const detail = ref<any>(null);
async function viewDetail(id: number) {
  const res: any = await exportInvoiceApi.get(id);
  detail.value = res?.data ?? res;
  detailVisible.value = true;
}
async function reloadDetail() {
  const res: any = await exportInvoiceApi.get(detail.value.id);
  detail.value = res?.data ?? res;
}
async function doRemove(id: number) {
  await exportInvoiceApi.remove(id);
  ElMessage.success('已删除');
  load();
}

const receiptVisible = ref(false);
const receiptForm = reactive({
  amount: undefined as number | undefined, exchange_rate: undefined as number | undefined,
  receipt_date: '', slip_url: '', remark: '',
});
async function doAddReceipt() {
  if (!(Number(receiptForm.amount) > 0) || !receiptForm.receipt_date) { ElMessage.warning('请填写金额与日期'); return; }
  saving.value = true;
  try {
    const dto: any = { ...receiptForm };
    if (!dto.exchange_rate) delete dto.exchange_rate;
    if (!dto.slip_url) delete dto.slip_url;
    await exportInvoiceApi.addReceipt(detail.value.id, dto);
    ElMessage.success('收汇已登记');
    receiptVisible.value = false;
    Object.assign(receiptForm, { amount: undefined, exchange_rate: undefined, receipt_date: '', slip_url: '', remark: '' });
    await reloadDetail();
    load();
  } finally { saving.value = false; }
}
async function doRemoveReceipt(rid: number) {
  await exportInvoiceApi.removeReceipt(detail.value.id, rid);
  await reloadDetail();
  load();
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
.hint { font-size: 13px; color: var(--el-text-color-secondary); }
</style>
