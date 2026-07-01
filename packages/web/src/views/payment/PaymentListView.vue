<template>
  <div class="page-container">
    <el-tabs v-model="activeTab" type="border-card">
      <!-- ====== 预付款 Tab ====== -->
      <el-tab-pane label="预付款管理" name="prepayment">
        <el-card class="search-card" shadow="never">
          <el-form :model="prepayQuery" inline>
            <el-form-item label="工厂ID">
              <el-input-number v-model="prepayQuery.factory_id" :min="1" :controls="false" placeholder="工厂ID" style="width:100px" @change="loadPrepay" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :icon="Search" @click="loadPrepay">搜索</el-button>
              <el-button :icon="Refresh" @click="resetPrepay">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <div class="table-toolbar">
          <div class="balance-info" v-if="prepayQuery.factory_id">
            工厂可用预付款余额：<strong class="balance-num">{{ prepayBalance.toFixed(2) }}</strong>
            <el-button link type="primary" size="small" style="margin-left:8px" @click="loadBalance">刷新余额</el-button>
          </div>
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreatePrepay">创建预付款</el-button>
        </div>

        <el-table :data="prepayList" v-loading="prepayLoading" border stripe>
          <el-table-column prop="id" label="ID" width="70" align="center" />
          <el-table-column prop="factory_id" label="工厂ID" width="80" align="center" />
          <el-table-column prop="contract_id" label="合同ID" width="80" align="center">
            <template #default="{ row }">{{ row.contract_id ?? '--' }}</template>
          </el-table-column>
          <el-table-column prop="amount" label="预付金额" width="120" align="right">
            <template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="used_amount" label="已用金额" width="110" align="right">
            <template #default="{ row }">{{ (+row.used_amount).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="balance" label="剩余余额" width="110" align="right">
            <template #default="{ row }">
              <span :class="{ 'text-danger': +row.balance <= 0 }">{{ (+row.balance).toFixed(2) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="pay_date" label="付款日期" width="120" />
          <el-table-column prop="remark" label="备注" />
          <el-table-column prop="created_at" label="创建时间" width="160" />
        </el-table>

        <div class="pagination">
          <el-pagination
            v-model:current-page="prepayQuery.page"
            v-model:page-size="prepayQuery.size"
            :total="prepayTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @change="loadPrepay"
          />
        </div>
      </el-tab-pane>

      <!-- ====== 付款申请 Tab ====== -->
      <el-tab-pane label="付款申请" name="request">
        <el-card class="search-card" shadow="never">
          <el-form :model="prQuery" inline>
            <el-form-item label="工厂ID">
              <el-input-number v-model="prQuery.factory_id" :min="1" :controls="false" placeholder="工厂ID" style="width:100px" @change="loadPR" />
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="prQuery.approval_status" clearable placeholder="全部" style="width:110px" @change="loadPR">
                <el-option label="草稿" value="DRAFT" />
                <el-option label="待审批" value="PENDING" />
                <el-option label="已批准" value="APPROVED" />
                <el-option label="已驳回" value="REJECTED" />
                <el-option label="已付款" value="PAID" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :icon="Search" @click="loadPR">搜索</el-button>
              <el-button :icon="Refresh" @click="resetPR">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <div class="table-toolbar">
          <span></span>
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreatePR">新建付款申请</el-button>
        </div>

        <el-table :data="prList" v-loading="prLoading" border stripe>
          <el-table-column prop="pr_no" label="申请编号" width="180" />
          <el-table-column prop="type" label="类型" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="row.type === 'CONTRACT' ? '' : 'warning'">
                {{ row.type === 'CONTRACT' ? '合同付款' : '非合同付款' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="factory_id" label="工厂ID" width="80" align="center" />
          <el-table-column prop="amount" label="申请金额" width="110" align="right">
            <template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="prepay_offset" label="冲抵预付" width="100" align="right">
            <template #default="{ row }">{{ (+row.prepay_offset).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="actual_pay" label="实付金额" width="110" align="right">
            <template #default="{ row }">
              <strong>{{ row.actual_pay != null ? (+row.actual_pay).toFixed(2) : '--' }}</strong>
            </template>
          </el-table-column>
          <el-table-column prop="approval_status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="prTagType(row.approval_status)" size="small">{{ prStatusLabel(row.approval_status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.approval_status === 'DRAFT' && canEdit"
                link type="primary" size="small"
                @click="doSubmit(row)"
              >提交</el-button>
              <el-button
                v-if="row.approval_status === 'PENDING' && isAdmin"
                link type="success" size="small"
                @click="doApprove(row)"
              >批准</el-button>
              <el-button
                v-if="row.approval_status === 'PENDING' && isAdmin"
                link type="warning" size="small"
                @click="openReject(row)"
              >驳回</el-button>
              <el-button
                v-if="row.approval_status === 'APPROVED' && canEdit"
                link type="primary" size="small"
                @click="openMarkPaid(row)"
              >标记付款</el-button>
              <el-popconfirm v-if="row.approval_status === 'DRAFT' && isAdmin" title="确认删除？" @confirm="doPRRemove(row.id)">
                <template #reference>
                  <el-button link type="danger" size="small">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination">
          <el-pagination
            v-model:current-page="prQuery.page"
            v-model:page-size="prQuery.size"
            :total="prTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @change="loadPR"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 创建预付款弹窗 -->
    <el-dialog v-model="createPrepayVisible" title="创建预付款" width="480px" @closed="resetPrepayForm">
      <el-form ref="prepayFormRef" :model="prepayForm" :rules="prepayRules" label-width="90px">
        <el-form-item label="工厂ID" prop="factory_id">
          <el-input-number v-model="prepayForm.factory_id" :min="1" style="width:100%" />
        </el-form-item>
        <el-form-item label="合同ID">
          <el-input-number v-model="prepayForm.contract_id" :min="1" style="width:100%" />
        </el-form-item>
        <el-form-item label="预付金额" prop="amount">
          <el-input-number v-model="prepayForm.amount" :min="0.01" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="付款日期" prop="pay_date">
          <el-date-picker v-model="prepayForm.pay_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="prepayForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createPrepayVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreatePrepay">保存</el-button>
      </template>
    </el-dialog>

    <!-- 创建付款申请弹窗 -->
    <el-dialog v-model="createPRVisible" title="新建付款申请" width="560px" @closed="resetPRForm">
      <el-form ref="prFormRef" :model="prForm" :rules="prRules" label-width="100px">
        <el-form-item label="类型" prop="type">
          <el-select v-model="prForm.type" style="width:100%">
            <el-option label="合同付款" value="CONTRACT" />
            <el-option label="非合同付款" value="NO_CONTRACT" />
          </el-select>
        </el-form-item>
        <el-form-item label="工厂ID" prop="factory_id">
          <el-input-number v-model="prForm.factory_id" :min="1" style="width:100%" />
        </el-form-item>
        <el-form-item label="对账单ID">
          <el-input-number v-model="prForm.reconcile_id" :min="1" style="width:100%" />
        </el-form-item>
        <el-form-item label="申请金额" prop="amount">
          <el-input-number v-model="prForm.amount" :min="0.01" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="冲抵预付款">
          <el-input-number v-model="prForm.prepay_offset" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="prForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createPRVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreatePR">保存</el-button>
      </template>
    </el-dialog>

    <!-- 驳回弹窗 -->
    <el-dialog v-model="rejectVisible" title="驳回原因" width="400px">
      <el-input v-model="rejectReason" type="textarea" :rows="3" placeholder="请填写驳回原因" />
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="doReject">确认驳回</el-button>
      </template>
    </el-dialog>

    <!-- 标记付款弹窗 -->
    <el-dialog v-model="markPaidVisible" title="上传付款水单" width="400px">
      <el-form label-width="80px">
        <el-form-item label="水单URL">
          <el-input v-model="slipUrl" placeholder="请输入付款水单图片地址" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="markPaidVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doMarkPaid">确认付款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Refresh, Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { prepaymentApi, paymentRequestApi } from '@/api/payment';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.FINANCE));

const activeTab = ref('prepayment');

function prStatusLabel(s: string) {
  return { DRAFT: '草稿', PENDING: '待审批', APPROVED: '已批准', REJECTED: '已驳回', PAID: '已付款' }[s] ?? s;
}
function prTagType(s: string): any {
  return { DRAFT: 'info', PENDING: 'warning', APPROVED: 'primary', REJECTED: 'danger', PAID: 'success' }[s] ?? 'info';
}

// ====== Prepayment ======
const prepayLoading = ref(false);
const saving = ref(false);
const prepayList = ref<any[]>([]);
const prepayTotal = ref(0);
const prepayBalance = ref(0);
const prepayQuery = reactive({ page: 1, size: 20, factory_id: undefined as number | undefined });

async function loadPrepay() {
  prepayLoading.value = true;
  try {
    const res = await prepaymentApi.list(prepayQuery);
    prepayList.value = res?.data?.items ?? res?.items ?? [];
    prepayTotal.value = res?.data?.total ?? res?.total ?? 0;
  } finally { prepayLoading.value = false; }
}

async function loadBalance() {
  if (!prepayQuery.factory_id) return;
  const res = await prepaymentApi.getBalance(prepayQuery.factory_id);
  prepayBalance.value = res?.data ?? res ?? 0;
}

watch(() => prepayQuery.factory_id, (v) => { if (v) loadBalance(); else prepayBalance.value = 0; });

function resetPrepay() {
  prepayQuery.factory_id = undefined;
  prepayQuery.page = 1;
  prepayBalance.value = 0;
  loadPrepay();
}

const createPrepayVisible = ref(false);
const prepayFormRef = ref<FormInstance>();
const prepayForm = reactive({
  factory_id: undefined as number | undefined,
  contract_id: undefined as number | undefined,
  amount: undefined as number | undefined,
  pay_date: '',
  remark: '',
});
const prepayRules: FormRules = {
  factory_id: [{ required: true, message: '请输入工厂ID', trigger: 'blur' }],
  amount: [{ required: true, message: '请输入预付金额', trigger: 'blur' }],
  pay_date: [{ required: true, message: '请选择付款日期', trigger: 'change' }],
};
function openCreatePrepay() { createPrepayVisible.value = true; }
function resetPrepayForm() {
  Object.assign(prepayForm, { factory_id: undefined, contract_id: undefined, amount: undefined, pay_date: '', remark: '' });
}
async function doCreatePrepay() {
  await prepayFormRef.value?.validate();
  saving.value = true;
  try {
    await prepaymentApi.create(prepayForm as any);
    ElMessage.success('创建成功');
    createPrepayVisible.value = false;
    loadPrepay();
    if (prepayQuery.factory_id) loadBalance();
  } finally { saving.value = false; }
}

// ====== Payment Request ======
const prLoading = ref(false);
const prList = ref<any[]>([]);
const prTotal = ref(0);
const prQuery = reactive({
  page: 1, size: 20,
  factory_id: undefined as number | undefined,
  approval_status: undefined as string | undefined,
});

async function loadPR() {
  prLoading.value = true;
  try {
    const res = await paymentRequestApi.list(prQuery);
    prList.value = res?.data?.items ?? res?.items ?? [];
    prTotal.value = res?.data?.total ?? res?.total ?? 0;
  } finally { prLoading.value = false; }
}

function resetPR() {
  Object.assign(prQuery, { factory_id: undefined, approval_status: undefined, page: 1 });
  loadPR();
}

async function doSubmit(row: any) {
  await paymentRequestApi.submit(row.id);
  ElMessage.success('已提交审批');
  loadPR();
}

async function doApprove(row: any) {
  await paymentRequestApi.approve(row.id);
  ElMessage.success('审批通过');
  loadPR();
}

const rejectVisible = ref(false);
const rejectReason = ref('');
let rejectTarget: any = null;
function openReject(row: any) { rejectTarget = row; rejectReason.value = ''; rejectVisible.value = true; }
async function doReject() {
  if (!rejectReason.value.trim()) { ElMessage.warning('请填写驳回原因'); return; }
  saving.value = true;
  try {
    await paymentRequestApi.reject(rejectTarget.id, rejectReason.value);
    ElMessage.success('已驳回');
    rejectVisible.value = false;
    loadPR();
  } finally { saving.value = false; }
}

const markPaidVisible = ref(false);
const slipUrl = ref('');
let markPaidTarget: any = null;
function openMarkPaid(row: any) { markPaidTarget = row; slipUrl.value = ''; markPaidVisible.value = true; }
async function doMarkPaid() {
  if (!slipUrl.value.trim()) { ElMessage.warning('请填写水单地址'); return; }
  saving.value = true;
  try {
    await paymentRequestApi.markPaid(markPaidTarget.id, slipUrl.value);
    ElMessage.success('已标记付款');
    markPaidVisible.value = false;
    loadPR();
  } finally { saving.value = false; }
}

async function doPRRemove(id: number) {
  await paymentRequestApi.remove(id);
  ElMessage.success('删除成功');
  loadPR();
}

const createPRVisible = ref(false);
const prFormRef = ref<FormInstance>();
const prForm = reactive({
  type: 'CONTRACT',
  factory_id: undefined as number | undefined,
  reconcile_id: undefined as number | undefined,
  amount: undefined as number | undefined,
  prepay_offset: 0,
  description: '',
});
const prRules: FormRules = {
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  factory_id: [{ required: true, message: '请输入工厂ID', trigger: 'blur' }],
  amount: [{ required: true, message: '请输入申请金额', trigger: 'blur' }],
};
function openCreatePR() { createPRVisible.value = true; }
function resetPRForm() {
  Object.assign(prForm, { type: 'CONTRACT', factory_id: undefined, reconcile_id: undefined, amount: undefined, prepay_offset: 0, description: '' });
}
async function doCreatePR() {
  await prFormRef.value?.validate();
  saving.value = true;
  try {
    await paymentRequestApi.create(prForm as any);
    ElMessage.success('创建成功');
    createPRVisible.value = false;
    loadPR();
  } finally { saving.value = false; }
}

onMounted(() => { loadPrepay(); loadPR(); });
</script>

<style scoped>
.page-container { padding: 16px; }
.search-card { border: none; }
.search-card :deep(.el-card__body) { padding: 12px 12px 0; }
.table-toolbar { display: flex; justify-content: space-between; align-items: center; margin: 12px 0 8px; }
.balance-info { font-size: 14px; color: #606266; }
.balance-num { color: #409eff; font-size: 16px; }
.text-danger { color: #f56c6c; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
