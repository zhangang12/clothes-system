<template>
  <div class="list-page">
    <div class="toolbar-card">
      <div class="toolbar">
        <div class="tools-left">
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="goCreate">新建</el-button>
          <el-button plain :icon="Download" @click="exportCsv">导出</el-button>
          <el-button v-if="canEdit" plain :icon="CopyDocument" :disabled="selected.length !== 1" @click="copyOne">复制</el-button>
          <el-button v-if="canEdit" type="danger" plain :icon="Delete" :disabled="!selected.length" @click="batchRemove">
            删除{{ selected.length ? `(${selected.length})` : '' }}
          </el-button>
        </div>
        <div class="tools-right">
          <el-input v-model="query.keyword" placeholder="报价单号/中间商/最终买家/客户款号/业务员" clearable style="width:300px"
            @keyup.enter="load" @clear="load">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button type="primary" @click="load">搜索</el-button>
          <el-button @click="reset">清空</el-button>
          <el-button text @click="showAdvanced = !showAdvanced">高级筛选 <el-icon><ArrowDown /></el-icon></el-button>
        </div>
      </div>
      <el-collapse-transition>
        <div v-show="showAdvanced" class="advanced">
          <el-form inline>
            <el-form-item label="状态">
              <el-select v-model="query.status" clearable placeholder="全部" style="width:130px" @change="load">
                <el-option v-for="s in statuses" :key="s.value" :label="s.label" :value="s.value" />
              </el-select>
            </el-form-item>
          </el-form>
        </div>
      </el-collapse-transition>
    </div>

    <div class="table-card">
      <el-table :data="list" v-loading="loading" border stripe @selection-change="(v: any[]) => selected = v" @row-dblclick="goEdit">
        <el-table-column type="selection" width="42" />
        <el-table-column prop="quote_no" label="报价单号" width="150" sortable />
        <el-table-column label="中间商" min-width="140" show-overflow-tooltip><template #default="{ row }">{{ row.middleman_name || '-' }}</template></el-table-column>
        <el-table-column label="最终买家" min-width="130" show-overflow-tooltip><template #default="{ row }">{{ row.buyer_name || '—' }}</template></el-table-column>
        <el-table-column prop="style_no" label="客户款号" min-width="120"><template #default="{ row }">{{ row.style_no || '-' }}</template></el-table-column>
        <el-table-column prop="inquiry_date" label="询价日期" width="110"><template #default="{ row }">{{ row.inquiry_date || '-' }}</template></el-table-column>
        <el-table-column label="数量" width="80" align="right"><template #default="{ row }">{{ row.quote_qty ?? '-' }}</template></el-table-column>
        <el-table-column label="美金总计" width="120" align="right">
          <template #default="{ row }">{{ row.usd_total != null ? `$ ${Number(row.usd_total).toLocaleString()}` : '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <span v-if="row.status === 'ORDERED'" class="ordered">{{ statusLabel(row.status) }}</span>
            <el-tag v-else :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
            <el-tag v-if="row.approval_status === 'PENDING'" type="warning" size="small" style="margin-left:4px">待审批</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="salesperson" label="业务员" width="90"><template #default="{ row }">{{ row.salesperson || '-' }}</template></el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="goEdit(row)">编辑</el-button>
            <el-button link size="small" @click="copyRow(row)">复制</el-button>
            <el-button link size="small" :icon="Printer" @click="printRow(row)">打印/PDF</el-button>
            <el-button v-if="row.approval_status === 'PENDING' && canReview" link type="success" size="small" @click="doApprove(row)">审批</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="footer">
        <span class="sel-info">已选 {{ selected.length }} 条 · 共 {{ total }} 条</span>
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.size" :total="total"
          :page-sizes="[10, 20, 50, 100]" layout="sizes, prev, pager, next" @change="load" />
      </div>
      <div class="tip">🟢「已成单」= 已转销售合同（绿色加粗）；美金总计含利润率并按汇率换算。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search, Plus, Download, Delete, CopyDocument, ArrowDown, Printer } from '@element-plus/icons-vue';
import { printQuote } from '@/utils/quotePrint';
import { companyApi } from '@/api/company';
import { quoteApi } from '@/api/quote';
import { useAuthStore } from '@/stores/auth';
import { UserRole, QUOTE_STATUS_LABEL } from '@i9/types';

const router = useRouter();
const authStore = useAuthStore();
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));
const canReview = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.SUPERVISOR));
const statuses = Object.entries(QUOTE_STATUS_LABEL).map(([value, label]) => ({ value, label }));
const statusLabel = (s: string) => (QUOTE_STATUS_LABEL as any)[s] ?? s;
const statusTag = (s: string) => ({ DRAFT: 'info', QUOTED: 'primary', ADJUSTING: 'warning' } as any)[s] ?? 'info';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const selected = ref<any[]>([]);
const showAdvanced = ref(false);
const query = reactive({ page: 1, size: 20, keyword: '', status: undefined as string | undefined });

async function load() {
  loading.value = true;
  try {
    const res: any = await quoteApi.list(query);
    list.value = res.data?.items ?? res.items ?? [];
    total.value = res.data?.total ?? res.total ?? 0;
  } finally {
    loading.value = false;
  }
}
function reset() { query.keyword = ''; query.status = undefined; query.page = 1; load(); }
function goCreate() { router.push({ name: 'QuoteCreate' }); }
function goEdit(row: any) { router.push({ name: 'QuoteEdit', params: { id: row.id } }); }
async function copyRow(row: any) {
  try { await quoteApi.copy(row.id); ElMessage.success('已复制为新报价（草稿）'); load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '复制失败'); }
}
async function doApprove(row: any) {
  try { await quoteApi.approve(row.id); ElMessage.success('已审批，报价可发出'); load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '审批失败'); }
}
let cachedCompany: any = null;
async function printRow(row: any) {
  try {
    const res: any = await quoteApi.get(row.id);
    if (cachedCompany === null) {
      try { cachedCompany = (await companyApi.getDefault() as any)?.data ?? null; } catch { cachedCompany = undefined; }
    }
    printQuote(res.data ?? res, cachedCompany || undefined);
  } catch (e: any) { ElMessage.error(e?.message ?? e?.response?.data?.message ?? '打印失败'); }
}
function copyOne() { copyRow(selected.value[0]); }
async function batchRemove() {
  let ok = 0, fail = 0;
  for (const row of selected.value) { try { await quoteApi.remove(row.id); ok++; } catch { fail++; } }
  ElMessage[fail ? 'warning' : 'success'](`删除完成：成功 ${ok} 条${fail ? `，拦截 ${fail} 条(仅草稿可删)` : ''}`);
  load();
}
function exportCsv() {
  const cols = ['quote_no', 'middleman_name', 'buyer_name', 'style_no', 'inquiry_date', 'quote_qty', 'usd_total', 'status'];
  const head = ['报价单号', '中间商', '最终买家', '客户款号', '询价日期', '数量', '美金总计', '状态'];
  const rows = list.value.map((r) => cols.map((c) => `"${r[c] ?? ''}"`).join(','));
  const csv = '﻿' + [head.join(','), ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = '客户报价.csv'; a.click();
  URL.revokeObjectURL(url);
}
onMounted(load);
</script>

<style scoped>
.list-page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.toolbar-card, .table-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 6px; padding: 12px 14px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.tools-left, .tools-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.advanced { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--el-border-color); }
.footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
.sel-info { font-size: 13px; color: var(--el-text-color-secondary); }
.tip { margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary); }
.ordered { color: #3E8E7E; font-weight: 700; }
</style>
