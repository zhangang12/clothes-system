<template>
  <div class="page-container">
    <RuleHint>一张对账单<b>只能含同一类型合同</b>(材料或加工),不可混;补料合同对账可勾「并入原合同」;含票时<b>发票金额须=对账金额</b>(±0.01);累计实发超合同量时,复核确认须由业务填超发原因放行。</RuleHint>
    <el-card class="search-card">
      <el-form :model="query" inline>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="对账单号 / 款号" clearable style="width:180px" @clear="load" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.type" clearable placeholder="全部" style="width:120px" @change="load">
            <el-option label="合同对账" value="CONTRACT" />
            <el-option label="非合同对账" value="NO_CONTRACT" />
            <el-option label="工时对账" value="LABOR" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width:110px" @change="load">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="待复核" value="PENDING" />
            <el-option label="已确认" value="CONFIRMED" />
            <el-option label="已付款" value="PAID" />
          </el-select>
        </el-form-item>
        <el-form-item label="工厂">
          <div style="width:200px"><factory-select v-model="query.factory_id" placeholder="按名称筛选工厂" @update:model-value="load" /></div>
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
          <div>
            <el-button v-if="canBusiness" :icon="Coin" @click="openLabor">生成工时对账</el-button>
            <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreate">新建对账单</el-button>
          </div>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="reconcile_no" label="对账单编号" width="180" />
        <el-table-column prop="style_no" label="款号" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.style_no || '—' }}</template>
        </el-table-column>
        <el-table-column label="发货批次" width="86" align="center">
          <template #default="{ row }">{{ row.shipment_count ? `${row.shipment_count} 批` : '—' }}</template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="typeTag(row.type)">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="工厂/版师" width="110" align="center">
          <template #default="{ row }">
            {{ row.type === 'LABOR' ? (row.patternmaker_name || '版师#' + row.patternmaker_id) : (row.factory_name || (row.factory_id ? '工厂#' + row.factory_id : '—')) }}
          </template>
        </el-table-column>
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
        <el-table-column prop="status" label="状态" width="90" fixed="right">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="150">
          <template #default="{ row }">{{ fmtDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row.id)">详情</el-button>
            <el-button
              v-if="row.status === 'DRAFT' && canEdit"
              link type="warning" size="small"
              @click="doSubmit(row)"
            >提交复核</el-button>
            <el-button
              v-if="row.status === 'PENDING' && canReview"
              link type="success" size="small"
              @click="doConfirm(row)"
            >复核确认</el-button>
            <el-button
              v-if="row.status === 'PENDING' && canReview"
              link type="danger" size="small"
              @click="doReject(row)"
            >整单退回</el-button>
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
          <el-descriptions-item label="款号">{{ detailData.style_no || '—' }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ typeLabel(detailData.type) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTagType(detailData.status)" size="small">{{ statusLabel(detailData.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="detailData.type === 'LABOR' ? '版师' : '工厂ID'">
            {{ detailData.type === 'LABOR' ? (detailData.patternmaker_name || detailData.patternmaker_id) : detailData.factory_id }}
          </el-descriptions-item>
          <el-descriptions-item label="合同ID">{{ detailData.contract_id ?? '--' }}</el-descriptions-item>
          <el-descriptions-item label="对账金额">{{ (+detailData.total_amount).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="税率">{{ detailData.tax_rate != null ? detailData.tax_rate + '%' : '--' }}</el-descriptions-item>
          <el-descriptions-item label="税额">{{ detailData.tax_amount != null ? (+detailData.tax_amount).toFixed(2) : '--' }}</el-descriptions-item>
          <el-descriptions-item label="发票号">{{ detailData.invoice_no ?? '--' }}</el-descriptions-item>
          <el-descriptions-item label="发票金额">{{ detailData.invoice_amount != null ? (+detailData.invoice_amount).toFixed(2) : '--' }}</el-descriptions-item>
          <el-descriptions-item label="发票差额">{{ detailData.invoice_diff != null ? (+detailData.invoice_diff).toFixed(2) : '--' }}</el-descriptions-item>
          <el-descriptions-item label="确认时间">{{ detailData.confirmed_at ?? '--' }}</el-descriptions-item>
          <el-descriptions-item v-if="detailData.review_remark" label="退回批注" :span="3">
            <span style="color:var(--el-color-danger)">{{ detailData.review_remark }}</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="detailData.over_reason" label="超发放行原因" :span="3">
            <span style="color:var(--el-color-warning)">⚠️ {{ detailData.over_reason }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <template v-if="detailData.type === 'LABOR'">
          <el-divider>工时明细（多款合并）</el-divider>
          <el-table :data="detailData.laborItems ?? []" border size="small">
            <el-table-column prop="sample_no" label="样衣编号" width="120" />
            <el-table-column prop="style_no" label="客户款号" />
            <el-table-column prop="piece_count" label="件数" width="80" align="right" />
            <el-table-column prop="labor_unit_price" label="工时单价" width="100" align="right">
              <template #default="{ row }">{{ row.labor_unit_price != null ? (+row.labor_unit_price).toFixed(2) : '--' }}</template>
            </el-table-column>
            <el-table-column prop="labor_amount" label="工时金额" width="110" align="right">
              <template #default="{ row }">{{ row.labor_amount != null ? (+row.labor_amount).toFixed(2) : '--' }}</template>
            </el-table-column>
          </el-table>
        </template>
        <template v-else-if="detailData.type === 'NO_CONTRACT'">
          <el-divider>费用明细（无合同空白对账单{{ detailData.sub_type ? '·' + subTypeLabel(detailData.sub_type) : '' }}）</el-divider>
          <el-table :data="detailData.expenseItems ?? []" border size="small">
            <el-table-column prop="expense_name" label="费用项目/事由" />
            <el-table-column prop="style_no" label="相关款号" width="110"><template #default="{ row }">{{ row.style_no || '—' }}</template></el-table-column>
            <el-table-column prop="amount" label="金额" width="120" align="right"><template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template></el-table-column>
            <el-table-column prop="attach_url" label="附件" width="90"><template #default="{ row }"><el-link v-if="row.attach_url" :href="row.attach_url" target="_blank" type="primary">查看</el-link><span v-else>—</span></template></el-table-column>
          </el-table>
        </template>
        <template v-else>
          <el-divider>出货明细（一单多合同·批次可跳来源合同）</el-divider>
          <el-table :data="detailData.shipments ?? []" border size="small">
            <el-table-column prop="shipment_id" label="出货单ID" width="90" />
            <el-table-column prop="contract_id" label="来源合同" width="90">
              <template #default="{ row }">
                <el-link v-if="row.contract_id" type="primary" @click="goContract(row.contract_id)">#{{ row.contract_id }}</el-link>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <el-table-column prop="style_no" label="款号" width="90">
              <template #default="{ row }">{{ row.style_no ?? '—' }}</template>
            </el-table-column>
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
      </template>
    </el-dialog>

    <!-- 生成工时对账弹窗：勾选同一版师的已对账样衣 -->
    <el-dialog v-model="laborVisible" title="生成工时对账（勾选多款样衣·同一版师）" width="820px">
      <el-alert
        type="info" :closable="false" show-icon style="margin-bottom:12px"
        title="仅显示「已对账」状态的样衣；一张工时对账单需为同一版师，勾选后合并金额生成待复核对账单。"
      />
      <el-table
        :data="laborSamples" v-loading="laborLoading" border size="small"
        max-height="420" @selection-change="onLaborSelect"
      >
        <el-table-column type="selection" width="46" />
        <el-table-column prop="sample_no" label="样衣编号" width="130" />
        <el-table-column prop="style_no" label="客户款号" width="120" />
        <el-table-column prop="patternmaker_name" label="版师" width="100">
          <template #default="{ row }">{{ row.patternmaker_name || ('#' + (row.patternmaker_id ?? '')) }}</template>
        </el-table-column>
        <el-table-column prop="piece_count" label="件数" width="70" align="right" />
        <el-table-column prop="labor_unit_price" label="工时单价" width="90" align="right">
          <template #default="{ row }">{{ row.labor_unit_price != null ? (+row.labor_unit_price).toFixed(2) : '--' }}</template>
        </el-table-column>
        <el-table-column prop="labor_amount" label="工时金额" width="100" align="right">
          <template #default="{ row }">{{ row.labor_amount != null ? (+row.labor_amount).toFixed(2) : '--' }}</template>
        </el-table-column>
      </el-table>
      <div class="labor-sum">已选 {{ laborSelection.length }} 款 · 合计工时金额 ¥{{ laborTotal.toFixed(2) }}</div>
      <template #footer>
        <el-button @click="laborVisible = false">取消</el-button>
        <el-button type="primary" :loading="laborSaving" :disabled="!laborSelection.length" @click="doGenerateLabor">生成工时对账单</el-button>
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
          <!-- 无合同:直接按名称选工厂;合同对账:搜款号→选合同,自动带出工厂(免填数字ID) -->
          <template v-if="createForm.type === 'NO_CONTRACT'">
            <el-col :span="8">
              <el-form-item label="工厂" prop="factory_id">
                <factory-select v-model="createForm.factory_id" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="费用类型">
                <el-select v-model="createForm.subType" style="width:100%">
                  <el-option label="费用" value="EXPENSE" />
                  <el-option label="现金无票" value="CASH_NO_INVOICE" />
                  <el-option label="预付款" value="PREPAY" />
                </el-select>
              </el-form-item>
            </el-col>
          </template>
          <template v-else>
            <el-col :span="8">
              <el-form-item label="款号">
                <el-input v-model="styleSearch" placeholder="输入款号回车搜合同" clearable @keyup.enter="searchContracts" @clear="onClearStyle">
                  <template #append><el-button :loading="contractLoading" @click="searchContracts">搜合同</el-button></template>
                </el-input>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="选合同" prop="contract_id">
                <el-select v-model="createForm.contract_id" filterable clearable placeholder="先搜款号,再选合同" style="width:100%" @change="onPickContract">
                  <el-option v-for="c in styleContracts" :key="c.id" :label="contractLabel(c)" :value="c.id" />
                </el-select>
              </el-form-item>
            </el-col>
          </template>
        </el-row>
        <!-- 合同对账:选中合同后展示带出的工厂 + 补料并入原合同 -->
        <el-row v-if="createForm.type !== 'NO_CONTRACT'" :gutter="16">
          <el-col :span="24">
            <div class="picked-bar">
              <span v-if="createForm.contract_id">选中合同带出工厂：<b>{{ pickedFactoryName || ('工厂#' + createForm.factory_id) }}</b></span>
              <span v-else class="muted">尚未选择合同（先在上方搜款号）</span>
              <el-checkbox v-model="createForm.merge_into_parent" style="margin-left:16px">补料对账并入原合同（仅补料合同可勾，货款归母合同名下）</el-checkbox>
            </div>
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

        <!-- 合同对账：出货明细（一单多合同：每批次可填各自来源合同/款号；仅同一类型合同） -->
        <template v-if="createForm.type !== 'NO_CONTRACT'">
          <el-divider>出货明细（一单多合同：每批次可填各自来源合同/款号；仅限同一类型合同）</el-divider>
          <div v-for="(s, idx) in createForm.shipments" :key="idx" class="item-row">
            <el-row :gutter="8" align="middle">
              <el-col :span="3"><el-input-number v-model="s.shipment_id" :min="1" :controls="false" placeholder="出货单ID" style="width:100%" /></el-col>
              <el-col :span="3">
                <el-select v-model="s.contract_id" filterable clearable placeholder="合同" style="width:100%">
                  <el-option v-for="c in styleContracts" :key="c.id" :label="c.contract_no" :value="c.id" />
                </el-select>
              </el-col>
              <el-col :span="3"><el-input v-model="s.style_no" placeholder="款号" /></el-col>
              <el-col :span="4"><el-input v-model="s.item_name" placeholder="品名" /></el-col>
              <el-col :span="4"><el-input-number v-model="s.snapshot_unit_price" :min="0" :precision="4" :controls="false" placeholder="单价" style="width:100%" /></el-col>
              <el-col :span="3"><el-input-number v-model="s.qty" :min="0" :precision="2" :controls="false" placeholder="数量" style="width:100%" /></el-col>
              <el-col :span="2"><span class="amount">{{ s.snapshot_unit_price && s.qty ? (s.snapshot_unit_price * s.qty).toFixed(2) : '--' }}</span></el-col>
              <el-col :span="2"><el-button link type="danger" @click="removeShipment(idx)">删</el-button></el-col>
            </el-row>
          </div>
          <el-button style="width:100%;margin-top:8px" @click="addShipment">+ 添加出货行</el-button>
        </template>

        <!-- 无合同空白对账单：费用明细（费用项目/事由·金额·相关款号可空·附件） -->
        <template v-else>
          <el-divider>费用明细（无合同空白对账单：费用项目/金额/相关款号/附件）</el-divider>
          <div v-for="(e, idx) in createForm.expenses" :key="idx" class="item-row">
            <el-row :gutter="8" align="middle">
              <el-col :span="8"><el-input v-model="e.expense_name" placeholder="费用项目/事由" /></el-col>
              <el-col :span="5"><el-input-number v-model="e.amount" :min="0" :precision="2" :controls="false" placeholder="金额" style="width:100%" /></el-col>
              <el-col :span="5"><el-input v-model="e.style_no" placeholder="相关款号(可空)" /></el-col>
              <el-col :span="4"><el-input v-model="e.attach_url" placeholder="附件URL(可空)" /></el-col>
              <el-col :span="2"><el-button link type="danger" @click="removeExpense(idx)">删</el-button></el-col>
            </el-row>
          </div>
          <el-button style="width:100%;margin-top:8px" @click="addExpense">+ 添加费用行</el-button>
          <div class="labor-sum">合计费用 ¥{{ expenseTotal.toFixed(2) }}</div>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { errToast } from '@/api';
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fmtDateTime } from '@/utils/format';
import { Search, Refresh, Plus, Coin } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { reconciliationApi } from '@/api/reconciliation';
import { sampleApi } from '@/api/sample';
import { contractApi } from '@/api/contract';
import FactorySelect from '@/components/FactorySelect.vue';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const router = useRouter();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));

// 发货批次合同号可点跳合同管理（对账付款串流程 B7/C12）
function goContract(contractId: number) {
  detailVisible.value = false;
  router.push({ name: 'Contracts', query: { open: String(contractId) } });
}
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.FINANCE) || authStore.hasRole(UserRole.BUSINESS));
const canReview = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.SUPERVISOR));
const canBusiness = computed(() =>
  authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.FINANCE) || authStore.hasRole(UserRole.BUSINESS));

function statusLabel(s: string) {
  return { DRAFT: '草稿', PENDING: '待复核', CONFIRMED: '已确认', PAID: '已付款' }[s] ?? s;
}
function statusTagType(s: string): any {
  return { DRAFT: 'info', PENDING: 'warning', CONFIRMED: 'primary', PAID: 'success' }[s] ?? 'info';
}
function typeLabel(t: string) {
  return { CONTRACT: '合同对账', NO_CONTRACT: '非合同对账', LABOR: '工时对账' }[t] ?? t;
}
function subTypeLabel(s: string) {
  return { EXPENSE: '费用', CASH_NO_INVOICE: '现金无票', PREPAY: '预付款' }[s] ?? s;
}
function typeTag(t: string): any {
  return { CONTRACT: '', NO_CONTRACT: 'warning', LABOR: 'success' }[t] ?? 'info';
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
    list.value = res?.data ?? [];
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

async function doSubmit(row: any) {
  await reconciliationApi.submit(row.id);
  ElMessage.success('已提交主管复核');
  load();
}

async function doConfirm(row: any) {
  try {
    await reconciliationApi.confirm(row.id);
    ElMessage.success('主管复核已确认');
    load();
  } catch (e: any) {
    const msg = String(e?.response?.data?.msg ?? e?.response?.data?.msg ?? '');
    // 超发闸门(P2#28):累计实发超合同量→业务填写放行原因留痕后确认
    if (msg.startsWith('OVER_SHIP:')) {
      try {
        const { value } = await ElMessageBox.prompt(
          `${msg.slice('OVER_SHIP:'.length)}`, '超发确认放行',
          { inputPlaceholder: '请填写超发放行原因（留痕）', inputPattern: /\S+/, inputErrorMessage: '原因必填', type: 'warning' },
        );
        await reconciliationApi.confirm(row.id, value);
        ElMessage.success('已确认（超发原因已留痕）');
        load();
      } catch { /* 取消 */ }
      return;
    }
    ElMessage.error(msg || '复核确认失败');
  }
}

async function doReject(row: any) {
  try {
    const { value } = await ElMessageBox.prompt('请填写退回原因（批注）', '整单退回', {
      confirmButtonText: '确认退回', cancelButtonText: '取消', inputType: 'textarea',
    });
    await reconciliationApi.reject(row.id, value);
    ElMessage.success('已整单退回，业务员可修改后重新提交');
    load();
  } catch (e: any) {
    if (e !== 'cancel') errToast(e?.response?.data?.msg ?? '退回失败');
  }
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
  subType: 'EXPENSE',
  factory_id: undefined as number | undefined,
  contract_id: undefined as number | undefined,
  merge_into_parent: false,
  tax_rate: undefined as number | undefined,
  invoice_no: '',
  invoice_amount: undefined as number | undefined,
  description: '',
  shipments: [] as any[],
  expenses: [] as any[],
});
const expenseTotal = computed(() => createForm.expenses.reduce((s: number, e: any) => s + (+e.amount || 0), 0));
const createRules: FormRules = {
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
};

// 款号→合同(合同对账):搜款号列出该款所有合同,选中即带出工厂/合同ID(免手填数字ID)
const styleSearch = ref('');
const styleContracts = ref<any[]>([]);
const contractLoading = ref(false);
const pickedFactoryName = ref('');
const contractLabel = (c: any) =>
  `${c.contract_no} · ${c.factory_name || ('工厂#' + c.factory_id)} · ${typeLabel(c.type)}`
  + (c.total_amount != null ? ` · ¥${Number(c.total_amount).toFixed(2)}` : '');
async function searchContracts() {
  const s = styleSearch.value.trim();
  if (!s) { ElMessage.warning('请输入款号'); return; }
  contractLoading.value = true;
  try {
    const res: any = await contractApi.byStyle(s);
    styleContracts.value = (res.data ?? res) ?? [];
    if (!styleContracts.value.length) ElMessage.info('该款号下未找到合同');
  } catch (e: any) {
    errToast(e?.response?.data?.msg ?? '查询合同失败');
  } finally { contractLoading.value = false; }
}
function onPickContract(id?: number) {
  const c = styleContracts.value.find((x) => x.id === id);
  createForm.factory_id = c ? Number(c.factory_id) : undefined;
  pickedFactoryName.value = c?.factory_name ?? '';
}
function onClearStyle() { styleContracts.value = []; }

function openCreate() { createVisible.value = true; }
function resetCreateForm() {
  Object.assign(createForm, {
    type: 'CONTRACT', subType: 'EXPENSE', factory_id: undefined, contract_id: undefined,
    tax_rate: undefined, invoice_no: '', invoice_amount: undefined, description: '', shipments: [], expenses: [], merge_into_parent: false,
  });
  styleSearch.value = '';
  styleContracts.value = [];
  pickedFactoryName.value = '';
}
function addShipment() {
  // 默认带上已选合同 + 搜索款号,便于「一单多合同」逐行填
  createForm.shipments.push({ shipment_id: undefined, contract_id: createForm.contract_id, style_no: styleSearch.value.trim(), item_name: '', snapshot_unit_price: undefined, qty: undefined });
}
function removeShipment(idx: number) { createForm.shipments.splice(idx, 1); }
function addExpense() {
  createForm.expenses.push({ expense_name: '', amount: undefined, style_no: '', attach_url: '' });
}
function removeExpense(idx: number) { createForm.expenses.splice(idx, 1); }

async function doCreate() {
  await createFormRef.value?.validate();
  const isNoContract = createForm.type === 'NO_CONTRACT';
  if (isNoContract) {
    if (!createForm.factory_id) { ElMessage.warning('请选择工厂'); return; }
    if (!createForm.expenses.length) { ElMessage.warning('请至少添加一条费用明细'); return; }
  } else {
    if (!createForm.contract_id) { ElMessage.warning('请先搜款号并选择合同'); return; }
    if (!createForm.shipments.length) { ElMessage.warning('请至少添加一条出货明细'); return; }
  }
  saving.value = true;
  try {
    await reconciliationApi.create(createForm as any);
    ElMessage.success('创建成功');
    createVisible.value = false;
    load();
  } finally { saving.value = false; }
}

// 生成工时对账：勾选已对账样衣（同一版师）合并
const laborVisible = ref(false);
const laborLoading = ref(false);
const laborSaving = ref(false);
const laborSamples = ref<any[]>([]);
const laborSelection = ref<any[]>([]);
const laborTotal = computed(() =>
  laborSelection.value.reduce((s, x) => s + (+x.labor_amount || 0), 0));

async function openLabor() {
  laborVisible.value = true;
  laborSelection.value = [];
  laborLoading.value = true;
  try {
    // 仅拉「已对账」样衣（版师已填件数+单价、工时金额生成）
    const res = await sampleApi.list({ status: 'RECONCILED', page: 1, size: 100 });
    const items = res?.data ?? [];
    laborSamples.value = items.filter((s: any) => +s.labor_amount > 0);
  } finally { laborLoading.value = false; }
}
function onLaborSelect(rows: any[]) { laborSelection.value = rows; }

async function doGenerateLabor() {
  if (!laborSelection.value.length) return;
  const makerIds = Array.from(new Set(laborSelection.value.map((s) => s.patternmaker_id)));
  if (makerIds.length > 1) {
    ElMessage.warning('一张工时对账单需为同一版师，请勿跨版师勾选');
    return;
  }
  laborSaving.value = true;
  try {
    await reconciliationApi.generateLabor(laborSelection.value.map((s) => s.id));
    ElMessage.success('工时对账单已生成（草稿·待提交复核）');
    laborVisible.value = false;
    query.type = 'LABOR';
    load();
  } finally { laborSaving.value = false; }
}
</script>

<style scoped>
.page-container { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.search-card :deep(.el-card__body) { padding: 16px 16px 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
.item-row { margin-bottom: 8px; }
.amount { font-size: 12px; color: #909399; }
.labor-sum { margin-top: 10px; text-align: right; font-weight: 600; color: var(--el-color-primary); }
.picked-bar { display: flex; align-items: center; margin-bottom: 12px; font-size: 13px; color: var(--el-text-color-regular); }
.picked-bar .muted { color: var(--el-text-color-placeholder); }
</style>
