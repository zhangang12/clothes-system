<template>
  <div class="list-page">
    <RuleHint>报价可从样衣一键建单并导入材料;金额<b>超审批阈值需主管审批</b>后才能发出;报价发出后可被订单引用,<b>已成单不可再改</b>;非授权用户看不到机密客户的报价。</RuleHint>
    <div class="toolbar-card">
      <div class="toolbar">
        <div class="tools-left">
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="goCreate">新建</el-button>
          <el-button v-if="isAdmin" plain @click="importDialog = true">历史导入</el-button>
          <el-button v-if="canEdit" plain :icon="DocumentAdd" @click="openFromSample">从样衣建报价</el-button>
          <el-button plain :icon="Download" @click="exportCsv">导出</el-button>
          <el-button plain :icon="Printer" :disabled="!selected.length" @click="batchPrint">
            批量打印{{ selected.length ? `(${selected.length})` : '' }}
          </el-button>
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
            <el-form-item label="报价单号">
              <el-input v-model="query.quote_no" clearable placeholder="模糊匹配" style="width:150px" @keyup.enter="load" @clear="load" />
            </el-form-item>
            <el-form-item label="客户款号">
              <el-input v-model="query.style_no" clearable placeholder="模糊匹配" style="width:140px" @keyup.enter="load" @clear="load" />
            </el-form-item>
            <el-form-item label="中间商">
              <el-input v-model="query.middleman_name" clearable placeholder="名称" style="width:140px" @keyup.enter="load" @clear="load" />
            </el-form-item>
            <el-form-item label="最终买家">
              <el-input v-model="query.buyer_name" clearable placeholder="名称" style="width:140px" @keyup.enter="load" @clear="load" />
            </el-form-item>
            <el-form-item label="业务员">
              <el-input v-model="query.salesperson" clearable placeholder="姓名" style="width:110px" @keyup.enter="load" @clear="load" />
            </el-form-item>
            <el-form-item label="询价日期">
              <el-date-picker v-model="inquiryRange" type="daterange" value-format="YYYY-MM-DD"
                start-placeholder="起" end-placeholder="止" style="width:240px" @change="load" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="load">筛选</el-button>
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
            <el-button link size="small" @click="goView(row)">查看</el-button>
            <el-button v-if="canEdit && ['DRAFT', 'ADJUSTING'].includes(row.status)" link type="warning" size="small" @click="doSubmit(row)">发出</el-button>
            <el-button v-if="canEdit && ['QUOTED', 'ORDERED'].includes(row.status)" link type="warning" size="small" @click="doRevert(row)">撤回调整</el-button>
            <el-button link size="small" @click="copyRow(row)">复制</el-button>
            <el-button link size="small" :icon="Printer" @click="printRow(row)">打印/PDF</el-button>
            <el-button link size="small" @click="exportRow(row)">导出Excel</el-button>
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

    <!-- 从样衣建报价：选样衣 → 新建报价并导入样衣材料 → 跳编辑页 -->
    <el-dialog v-model="fromSampleDialog" title="从样衣建报价" width="480px">
      <el-select v-model="fromSampleId" filterable placeholder="选择样衣单" style="width:100%">
        <el-option v-for="s in sampleOptions" :key="s.id" :label="`${s.sample_no} · ${s.style_no}`" :value="s.id" />
      </el-select>
      <p class="tip" style="margin-top:8px">将以该样衣的中间商/买家/款号新建报价（草稿），并自动导入样衣材料明细。</p>
      <template #footer>
        <el-button @click="fromSampleDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!fromSampleId" :loading="fromSampleLoading" @click="createFromSample">创建</el-button>
      </template>
    </el-dialog>

    <!-- 报价历史迁移导入(P3#43/TRI J2) -->
    <el-dialog v-model="importDialog" title="报价历史迁移导入" width="640px">
      <div class="hint" style="margin-bottom:8px">
        每行一条,列序(Tab/逗号分隔):<b>客户名称,款号,询价日期(YYYY-MM-DD),币种,汇率,数量,人民币合计,美金合计,业务员,备注</b>。客户须先建档,导入后状态=已报价。
      </div>
      <el-input v-model="importText" type="textarea" :rows="10" placeholder="从 Excel 复制粘贴到此处" />
      <div v-if="importResult" style="margin-top:8px">
        <el-alert :type="importResult.fail ? 'warning' : 'success'" :closable="false"
          :title="`成功 ${importResult.ok} 条,失败 ${importResult.fail} 条`" />
        <div v-for="f in importResult.failures" :key="f.row" class="hint">第{{ f.row }}行:{{ f.reason }}</div>
      </div>
      <template #footer>
        <el-button @click="importDialog = false">关闭</el-button>
        <el-button type="primary" :loading="importing" :disabled="!importText.trim()" @click="doImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { errToast } from '@/api';
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Download, Delete, CopyDocument, ArrowDown, Printer, DocumentAdd } from '@element-plus/icons-vue';
import { printQuote, printQuoteBatch } from '@/utils/quotePrint';
import { exportQuoteExcel } from '@/utils/quoteExcel';
import { companyApi } from '@/api/company';
import { quoteApi } from '@/api/quote';
import { sampleApi } from '@/api/sample';
import { useAuthStore } from '@/stores/auth';
import { UserRole, QUOTE_STATUS_LABEL } from '@i9/types';

const router = useRouter();

// 报价历史迁移导入(P3#43)
const importDialog = ref(false);
const importText = ref('');
const importing = ref(false);
const importResult = ref<any>(null);
async function doImport() {
  const rows = importText.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const c = l.split(/\t|,/).map((x) => x.trim());
    return {
      customer_name: c[0], style_no: c[1], inquiry_date: c[2], currency: c[3], exchange_rate: c[4],
      quote_qty: c[5], rmb_total: c[6], usd_total: c[7], salesperson: c[8], remark: c[9],
    };
  });
  importing.value = true;
  try {
    const res: any = await quoteApi.importBatch(rows);
    importResult.value = res?.data ?? res;
    if (importResult.value?.ok) load();
  } finally { importing.value = false; }
}
const authStore = useAuthStore();
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canReview = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.SUPERVISOR));
const statuses = Object.entries(QUOTE_STATUS_LABEL).map(([value, label]) => ({ value, label }));
const statusLabel = (s: string) => (QUOTE_STATUS_LABEL as any)[s] ?? s;
const statusTag = (s: string) => ({ DRAFT: 'info', QUOTED: 'primary', ADJUSTING: 'warning' } as any)[s] ?? 'info';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const selected = ref<any[]>([]);
const showAdvanced = ref(false);
const query = reactive({
  page: 1, size: 20, keyword: '', status: undefined as string | undefined,
  quote_no: '', style_no: '', middleman_name: '', buyer_name: '', salesperson: '',
});
const inquiryRange = ref<[string, string] | null>(null);

async function load() {
  loading.value = true;
  try {
    // 空串不传（后端 IsDateString/精确筛不吃空值）
    const params: Record<string, unknown> = { page: query.page, size: query.size };
    for (const k of ['keyword', 'status', 'quote_no', 'style_no', 'middleman_name', 'buyer_name', 'salesperson'] as const) {
      if (query[k]) params[k] = query[k];
    }
    if (inquiryRange.value?.[0]) params.inquiry_start = inquiryRange.value[0];
    if (inquiryRange.value?.[1]) params.inquiry_end = inquiryRange.value[1];
    const res: any = await quoteApi.list(params);
    list.value = res.data ?? [];
    total.value = res.data?.total ?? res.total ?? 0;
  } finally {
    loading.value = false;
  }
}
function reset() {
  query.keyword = ''; query.status = undefined; query.page = 1;
  query.quote_no = ''; query.style_no = ''; query.middleman_name = ''; query.buyer_name = ''; query.salesperson = '';
  inquiryRange.value = null;
  load();
}
function goCreate() { router.push({ name: 'QuoteCreate' }); }
function goEdit(row: any) { router.push({ name: 'QuoteEdit', params: { id: row.id } }); }
function goView(row: any) { router.push({ name: 'QuoteView', params: { id: row.id } }); }
async function copyRow(row: any) {
  // 复制方式三选：确认=含明细/取消按钮=仅基本信息/右上关闭=不复制
  let withItems: boolean;
  try {
    await ElMessageBox.confirm('复制为新报价（草稿）：是否同时复制报价明细与费用明细?', '复制报价单', {
      distinguishCancelAndClose: true, confirmButtonText: '含明细复制', cancelButtonText: '仅基本信息', type: 'info',
    });
    withItems = true;
  } catch (action) {
    if (action !== 'cancel') return;
    withItems = false;
  }
  try { await quoteApi.copy(row.id, withItems); ElMessage.success('已复制为新报价（草稿）'); load(); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '复制失败'); }
}
// 发出报价 / 客户调整（此前 UI 缺状态流转入口，草稿无法走到已报价）
async function doSubmit(row: any) {
  try { await quoteApi.submit(row.id); ElMessage.success('已发出报价'); load(); }
  catch (e: any) {
    const msg = e?.response?.data?.msg ?? '发出失败';
    if (String(msg).includes('审批')) { ElMessage.warning(msg); load(); } else ElMessage.error(msg);
  }
}
// 撤回调整（用户反馈）：已报价直接回客户调整；已成单须关联订单全为草稿，草稿单随报价一并删除（后端拦截非草稿并报出单号）
async function doRevert(row: any) {
  if (row.status === 'ORDERED') {
    try {
      await ElMessageBox.confirm(
        `报价「${row.quote_no}」已成单。撤回报价将一并删除其关联的草稿订单（已下单/已生成合同的订单会被后端拦截并报出单号），确认撤回？`,
        '撤回调整', { type: 'warning' },
      );
    } catch { return; }
  } else {
    try {
      await ElMessageBox.confirm(`确认把报价「${row.quote_no}」撤回为可调整状态？撤回后可修改并重新发出。`, '撤回调整', { type: 'warning' });
    } catch { return; }
  }
  try { await quoteApi.revert(row.id); ElMessage.success('已撤回为可调整状态'); load(); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '撤回失败'); }
}
async function doApprove(row: any) {
  try { await quoteApi.approve(row.id); ElMessage.success('已审批，报价可发出'); load(); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '审批失败'); }
}
let cachedCompany: any = null;
async function printRow(row: any) {
  try {
    const res: any = await quoteApi.get(row.id);
    if (cachedCompany === null) {
      try { cachedCompany = (await companyApi.getDefault() as any)?.data ?? null; } catch { cachedCompany = undefined; }
    }
    printQuote(res.data ?? res, cachedCompany || undefined);
  } catch (e: any) { errToast(e?.message ?? e?.response?.data?.msg ?? '打印失败'); }
}
// 导出 Excel(取详情含报价/费用明细;.xls)。与打印不同,导出按业务要求全量不脱敏
async function exportRow(row: any) {
  try { const res: any = await quoteApi.get(row.id); exportQuoteExcel(res.data ?? res); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? e?.message ?? '导出失败'); }
}
function copyOne() { copyRow(selected.value[0]); }
// 批量打印：逐个取详情，一个窗口多页（页间分页符），一次打印/导出 PDF
async function batchPrint() {
  if (!selected.value.length) return;
  try {
    if (cachedCompany === null) {
      try { cachedCompany = (await companyApi.getDefault() as any)?.data ?? null; } catch { cachedCompany = undefined; }
    }
    const details: any[] = [];
    for (const row of selected.value) {
      const res: any = await quoteApi.get(row.id);
      details.push(res.data ?? res);
    }
    printQuoteBatch(details, cachedCompany || undefined);
  } catch (e: any) { errToast(e?.message ?? e?.response?.data?.msg ?? '批量打印失败'); }
}

// ── 从样衣建报价 ──
const fromSampleDialog = ref(false);
const fromSampleId = ref<number>();
const fromSampleLoading = ref(false);
const sampleOptions = ref<any[]>([]);
async function openFromSample() {
  fromSampleId.value = undefined;
  fromSampleDialog.value = true;
  try {
    const res: any = await sampleApi.list({ page: 1, size: 100 });
    sampleOptions.value = res.data ?? [];
  } catch { sampleOptions.value = []; }
}
async function createFromSample() {
  const sample = sampleOptions.value.find((s) => s.id === fromSampleId.value);
  if (!sample) return;
  fromSampleLoading.value = true;
  try {
    // create DTO 是 camelCase；middlemanId 必填（= 样衣的 customer_id）
    const r: any = await quoteApi.create({
      middlemanId: sample.customer_id,
      buyerId: sample.buyer_id || undefined,
      styleNo: sample.style_no,
      sampleId: sample.id,
    });
    const newId = (r.data ?? r).id;
    await quoteApi.importFromSample(newId, sample.id);
    ElMessage.success('已从样衣创建报价并导入材料明细');
    fromSampleDialog.value = false;
    router.push(`/quotes/${newId}/edit`);
  } catch (e: any) {
    errToast(e?.response?.data?.msg ?? '创建失败');
  } finally { fromSampleLoading.value = false; }
}
async function batchRemove() {
  try { await ElMessageBox.confirm(`确认删除选中的 ${selected.value.length} 条记录?此操作不可恢复。`, "批量删除", { type: "warning" }); } catch { return; }
  let ok = 0, fail = 0;
  for (const row of selected.value) { try { await quoteApi.remove(row.id); ok++; } catch { fail++; } }
  ElMessage[fail ? 'warning' : 'success'](`删除完成：成功 ${ok} 条${fail ? `，拦截 ${fail} 条(仅草稿可删)` : ''}`);
  load();
}
function exportCsv() {
  const cols = ['quote_no', 'middleman_name', 'buyer_name', 'style_no', 'inquiry_date', 'quote_qty', 'usd_total', 'status'];
  const head = ['报价单号', '中间商', '最终买家', '客户款号', '询价日期', '数量', '美金总计', '状态'];
  // 转义同 utils/exportAll.ts：内嵌双引号翻倍，否则名称含 " 即破列
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = list.value.map((r) => cols.map((c) => esc(r[c])).join(','));
  const csv = '﻿' + [head.map(esc).join(','), ...rows].join('\n');
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
.sel-info { font-size: 14px; color: var(--el-text-color-secondary); }
.tip { margin-top: 8px; font-size: 13px; color: var(--el-text-color-secondary); }
.ordered { color: #3E8E7E; font-weight: 700; }
</style>
