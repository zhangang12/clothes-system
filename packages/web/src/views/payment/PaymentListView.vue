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
            <el-form-item label="申请日期">
              <el-date-picker
                v-model="prDateRange"
                type="daterange"
                value-format="YYYY-MM-DD"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                style="width:240px"
                @change="loadPR"
              />
            </el-form-item>
          <el-form-item label="到期日">
            <el-date-picker v-model="prQuery.due_start" type="date" value-format="YYYY-MM-DD" placeholder="起" style="width:130px" @change="loadPR" />
            <span style="margin:0 4px">—</span>
            <el-date-picker v-model="prQuery.due_end" type="date" value-format="YYYY-MM-DD" placeholder="止" style="width:130px" @change="loadPR" />
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
          <el-table-column prop="actual_pay" label="应付总额" width="110" align="right">
            <template #default="{ row }">
              <strong>{{ row.actual_pay != null ? (+row.actual_pay).toFixed(2) : '--' }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="账期" width="76" align="center">
            <template #default="{ row }">{{ row.account_period_days != null ? row.account_period_days + '天' : '—' }}</template>
          </el-table-column>
          <el-table-column label="到期日" width="112">
            <template #default="{ row }">
              <span :class="{ 'text-danger': isOverdue(row) }">{{ row.due_date ? String(row.due_date).slice(0, 10) : '—' }}</span>
              <el-tag v-if="isOverdue(row)" type="danger" size="small" style="margin-left:2px">逾期</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="已付/余额" width="130" align="right">
            <template #default="{ row }">
              {{ (+(row.paid_total ?? 0)).toFixed(2) }} / <b :class="{ 'text-danger': prBalance(row) > 0 && row.approval_status === 'APPROVED' }">{{ prBalance(row).toFixed(2) }}</b>
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
              >付款</el-button>
              <el-button
                v-if="row.approval_status === 'PAID' || +(row.paid_total ?? 0) > 0"
                link size="small"
                @click="openMarkPaid(row)"
              >付款记录</el-button>
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
        <el-alert
          v-if="prPrepayBalance > 0"
          type="warning"
          :closable="false"
          show-icon
          style="margin: 0 0 12px;"
        >
          <template #title>
            该工厂存在可用预付款余额 ¥{{ prPrepayBalance.toFixed(2) }}
            <el-button link type="primary" size="small" style="margin-left:8px" @click="applyPrepayOffset">一键冲抵</el-button>
          </template>
        </el-alert>
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

    <!-- 财务付款（分批 v1.1：多次付款累计已付/未付，余额=0 整单转已付清；水单支持上传/拖拽/Ctrl+V 粘贴） -->
    <el-dialog v-model="markPaidVisible" title="💰 财务付款（可分批）" width="560px" @closed="resetSlip">
      <el-descriptions :column="3" border size="small" style="margin-bottom:12px">
        <el-descriptions-item label="应付总额">{{ payTarget ? (+(payTarget.actual_pay ?? payTarget.amount)).toFixed(2) : '—' }}</el-descriptions-item>
        <el-descriptions-item label="已付总额">{{ payTarget ? (+(payTarget.paid_total ?? 0)).toFixed(2) : '—' }}</el-descriptions-item>
        <el-descriptions-item label="未付余额"><b class="text-danger">{{ payTarget ? prBalance(payTarget).toFixed(2) : '—' }}</b></el-descriptions-item>
      </el-descriptions>
      <template v-if="payRecords.length">
        <el-table :data="payRecords" size="small" border style="margin-bottom:12px">
          <el-table-column type="index" label="批次" width="56" align="center" />
          <el-table-column label="方式" width="90"><template #default="{ row }">{{ payMethodLabel(row.pay_method) }}</template></el-table-column>
          <el-table-column prop="pay_date" label="付款日期" width="104" />
          <el-table-column prop="amount" label="金额" width="100" align="right"><template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template></el-table-column>
          <el-table-column label="水单" width="70" align="center"><template #default="{ row }"><el-link v-if="row.slip_url" type="primary" :href="row.slip_url" target="_blank">查看</el-link><span v-else>—</span></template></el-table-column>
          <el-table-column prop="remark" label="备注" min-width="90" />
        </el-table>
      </template>
      <el-form v-if="payTarget?.approval_status === 'APPROVED'" label-width="96px">
        <el-form-item label="付款方式" required>
          <el-radio-group v-model="payForm.pay_method">
            <el-radio value="BANK">银行转账</el-radio>
            <el-radio value="ACCEPTANCE">承兑汇票</el-radio>
            <el-radio value="OTHER">其他</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="付款日期" required>
          <el-date-picker v-model="payForm.pay_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="本次付款金额" required>
          <el-input-number v-model="payForm.amount" :min="0.01" :precision="2" :controls="false" style="width:100%" placeholder="默认=未付余额，可改小分批付" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="payForm.remark" placeholder="选填" />
        </el-form-item>
        <el-form-item label="付款水单">
          <div class="slip-uploader" @paste="onSlipPaste" tabindex="0">
            <el-upload
              :show-file-list="false"
              :before-upload="onSlipBeforeUpload"
              accept="image/*,application/pdf"
              drag
            >
              <div v-if="slipUrl" class="slip-preview">
                <img :src="slipUrl" alt="付款水单" />
              </div>
              <div v-else class="slip-empty">
                <el-icon :size="34"><UploadFilled /></el-icon>
                <div class="slip-tip">点击上传 / 拖拽文件，或聚焦此处按 <b>Ctrl+V</b> 粘贴截图</div>
              </div>
            </el-upload>
            <div v-if="slipUploading" class="slip-loading">上传中…</div>
          </div>
        </el-form-item>
        <el-form-item label="水单URL">
          <el-input v-model="slipUrl" placeholder="上传后自动填入，也可手动粘贴地址" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="markPaidVisible = false">关闭</el-button>
        <el-button v-if="payTarget?.approval_status === 'APPROVED'" type="primary" :loading="saving" :disabled="slipUploading" @click="doAddRecord">💰 确认付款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Refresh, Plus, UploadFilled } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { prepaymentApi, paymentRequestApi } from '@/api/payment';
import { uploadApi } from '@/api/upload';
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
    prepayList.value = res?.data ?? [];
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
  approval_status: undefined as string | undefined, due_start: '', due_end: '' });
// 申请日期范围（工厂+日期组合检索，付款申请设计稿 检索区）
const prDateRange = ref<[string, string] | null>(null);

async function loadPR() {
  prLoading.value = true;
  try {
    const params: Record<string, unknown> = { ...prQuery };
    if (prDateRange.value?.length === 2) {
      params.start_date = prDateRange.value[0];
      params.end_date = prDateRange.value[1];
    }
    const res = await paymentRequestApi.list(params);
    prList.value = res?.data ?? [];
    prTotal.value = res?.data?.total ?? res?.total ?? 0;
  } finally { prLoading.value = false; }
}

function resetPR() {
  Object.assign(prQuery, { factory_id: undefined, approval_status: undefined, page: 1 });
  prDateRange.value = null;
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
const slipUploading = ref(false);
const payTarget = ref<any>(null);
const payRecords = ref<any[]>([]);
const payForm = reactive<any>({ pay_method: 'BANK', pay_date: new Date().toISOString().slice(0, 10), amount: undefined, remark: '' });
const prBalance = (row: any) => +((+(row.actual_pay ?? row.amount ?? 0)) - (+(row.paid_total ?? 0))).toFixed(2);
const isOverdue = (row: any) => {
  if (!row?.due_date || row.approval_status === 'PAID') return false;
  const d = new Date(String(row.due_date).slice(0, 10));
  return !isNaN(d.getTime()) && d < new Date();
};
const payMethodLabel = (m: string) => ({ BANK: '银行转账', ACCEPTANCE: '承兑汇票', OTHER: '其他' } as any)[m] ?? m;
async function openMarkPaid(row: any) {
  payTarget.value = row;
  slipUrl.value = '';
  Object.assign(payForm, { pay_method: 'BANK', pay_date: new Date().toISOString().slice(0, 10), amount: prBalance(row) > 0 ? prBalance(row) : undefined, remark: '' });
  try { payRecords.value = ((await paymentRequestApi.getRecords(row.id)) as any).data ?? []; } catch { payRecords.value = []; }
  markPaidVisible.value = true;
}
// 分批付款登记（设计稿 06 v1.1）：余额=0 后端自动整单转已付清并联动对账单
async function doAddRecord() {
  if (!payForm.pay_date) { ElMessage.warning('请选择付款日期'); return; }
  if (!(+payForm.amount > 0)) { ElMessage.warning('请填写本次付款金额'); return; }
  saving.value = true;
  try {
    const res: any = await paymentRequestApi.addRecord(payTarget.value.id, {
      pay_method: payForm.pay_method, pay_date: payForm.pay_date,
      amount: +payForm.amount, slip_url: slipUrl.value || undefined, remark: payForm.remark || undefined,
    });
    const d = res.data ?? res;
    ElMessage.success(d.balance <= 0.01 ? '已付清，整单转「已付款」' : `已登记本次付款，剩余未付 ${(+d.balance).toFixed(2)}`);
    markPaidVisible.value = false;
    loadPR();
  } catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '付款登记失败'); }
  finally { saving.value = false; }
}
function resetSlip() { slipUrl.value = ''; slipUploading.value = false; }

// 上传水单文件（点击/拖拽/粘贴共用）：走后端 /uploads，成功后写入 slip_url
async function uploadSlipFile(file: File) {
  slipUploading.value = true;
  try {
    const res: any = await uploadApi.upload(file);
    slipUrl.value = (res?.data ?? res)?.url ?? '';
    if (slipUrl.value) ElMessage.success('水单上传成功');
  } catch {
    ElMessage.error('水单上传失败');
  } finally { slipUploading.value = false; }
}
// el-upload 拦截默认上传，改走自定义上传
function onSlipBeforeUpload(file: File) {
  uploadSlipFile(file);
  return false;
}
// 截图 Ctrl+V 粘贴：从剪贴板取图片直接上传
function onSlipPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const it of items) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) { e.preventDefault(); uploadSlipFile(f); return; }
    }
  }
}

async function doPRRemove(id: number) {
  await paymentRequestApi.remove(id);
  ElMessage.success('删除成功');
  loadPR();
}

const createPRVisible = ref(false);
const prFormRef = ref<FormInstance>();
const prPrepayBalance = ref(0);
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
  prPrepayBalance.value = 0;
}
// 选择工厂后自动提示是否存在可用预付款余额（付款申请设计稿：存在预付时提示冲抵）
watch(() => prForm.factory_id, async (fid) => {
  prPrepayBalance.value = 0;
  if (!createPRVisible.value || !fid) return;
  try {
    const res: any = await prepaymentApi.getBalance(fid);
    prPrepayBalance.value = +(res?.data ?? res ?? 0) || 0;
  } catch { prPrepayBalance.value = 0; }
});
// 一键把可用预付款余额（不超过申请金额）填入冲抵栏
function applyPrepayOffset() {
  const bal = prPrepayBalance.value;
  const amt = prForm.amount ?? bal;
  prForm.prepay_offset = +Math.min(bal, amt).toFixed(2);
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
.slip-uploader { width: 100%; outline: none; }
.slip-uploader :deep(.el-upload-dragger) { padding: 12px; }
.slip-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #909399; padding: 8px 0; }
.slip-tip { font-size: 12px; line-height: 1.5; }
.slip-preview img { max-width: 100%; max-height: 200px; object-fit: contain; }
.slip-loading { margin-top: 6px; font-size: 12px; color: #409eff; text-align: center; }
</style>
