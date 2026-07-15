<template>
  <div class="list-page">
    <RuleHint>样衣是全流程第一环;<b>已被客户报价引用的样衣不可删除</b>,可改为「废弃」(下游保留快照);行内「生成采购」为该材料行生成打样对账单;填材料寄出单号即自动推送版师。</RuleHint>
    <div class="toolbar-card">
      <div class="toolbar">
        <div class="tools-left">
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="goCreate">新建</el-button>
          <el-button v-if="canEdit" plain :icon="Upload" @click="showImport = true">导入</el-button>
          <el-button plain :icon="Download" @click="exportCsv">导出</el-button>
          <el-button v-if="canEdit" plain :icon="CopyDocument" :disabled="selected.length !== 1" @click="copyOne">复制</el-button>
          <el-button v-if="isAdmin" type="danger" plain :icon="Delete" :disabled="!selected.length" @click="batchRemove">
            删除{{ selected.length ? `(${selected.length})` : '' }}
          </el-button>
        </div>
        <div class="tools-right">
          <el-input v-model="query.keyword" placeholder="样衣编号/款号/中间商/买家/制版师/制单人" clearable style="width:300px"
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
            <el-form-item label="客户款号">
              <el-input v-model="query.style_no" clearable style="width:140px" @keyup.enter="load" @clear="load" />
            </el-form-item>
            <el-form-item label="中间商">
              <el-input v-model="query.middleman_name" clearable style="width:140px" @keyup.enter="load" @clear="load" />
            </el-form-item>
            <el-form-item label="类别">
              <el-select v-model="query.categories" clearable placeholder="全部" style="width:120px" @change="load">
                <el-option v-for="c in sampleCategories" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
            <el-form-item label="制版师">
              <el-input v-model="query.patternmaker_name" clearable style="width:120px" @keyup.enter="load" @clear="load" />
            </el-form-item>
            <el-form-item label="制单人">
              <el-input v-model="query.maker" clearable style="width:120px" @keyup.enter="load" @clear="load" />
            </el-form-item>
            <el-form-item label="制单日期">
              <el-date-picker v-model="makeRange" type="daterange" value-format="YYYY-MM-DD"
                range-separator="~" start-placeholder="起" end-placeholder="止" style="width:240px" @change="load" />
            </el-form-item>
            <el-form-item label="寄出日期">
              <el-date-picker v-model="shipRange" type="daterange" value-format="YYYY-MM-DD"
                range-separator="~" start-placeholder="起" end-placeholder="止" style="width:240px" @change="load" />
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
        <el-table-column prop="sample_no" label="样衣编号" width="150" sortable />
        <el-table-column prop="style_no" label="客户款号" min-width="130" show-overflow-tooltip sortable />
        <el-table-column prop="categories" label="样衣类别" width="120" sortable>
          <template #default="{ row }">{{ (row.categories || '').split(',').filter(Boolean).join('·') || '-' }}</template>
        </el-table-column>
        <el-table-column prop="middleman_name" label="中间商" min-width="120" show-overflow-tooltip sortable>
          <template #default="{ row }">{{ row.middleman_name || '-' }}</template>
        </el-table-column>
        <el-table-column prop="patternmaker_name" label="制版师" width="100" sortable>
          <template #default="{ row }">{{ row.patternmaker_name || '—' }}</template>
        </el-table-column>
        <el-table-column prop="maker" label="制单人" width="100" sortable>
          <template #default="{ row }">{{ row.maker || '—' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" sortable fixed="right">
          <template #default="{ row }">
            <span v-if="row.status === 'ORDERED'" class="ordered">{{ statusLabel(row.status) }}</span>
            <el-tag v-else :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="make_date" label="制单日期" width="110" sortable><template #default="{ row }">{{ row.make_date || '-' }}</template></el-table-column>
        <el-table-column prop="ship_sample_date" label="寄出日期" width="110" sortable><template #default="{ row }">{{ row.ship_sample_date || '—' }}</template></el-table-column>
        <el-table-column prop="return_date" label="寄回日期" width="110" sortable><template #default="{ row }">{{ row.return_date || '—' }}</template></el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="goEdit(row)">编辑</el-button>
            <el-button link size="small" @click="goView(row)">查看</el-button>
            <el-button link size="small" @click="printRow(row)">打印</el-button>
            <el-button link size="small" @click="exportRow(row)">导出Excel</el-button>
            <el-button v-if="isPatternmaker" link type="warning" size="small" @click="goPatternmaker(row)">版师</el-button>
            <el-popconfirm
              v-if="canEdit && !['ORDERED', 'ABANDONED'].includes(row.status)"
              title="废弃后不可编辑，下游引用保留快照。确认废弃？" width="240"
              @confirm="doAbandon(row)"
            >
              <template #reference><el-button link type="danger" size="small">废弃</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <div class="footer">
        <span class="sel-info">已选 {{ selected.length }} 条 · 共 {{ total }} 条</span>
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.size" :total="total"
          :page-sizes="[10, 20, 50, 100]" layout="sizes, prev, pager, next" @change="load" />
      </div>
      <div class="tip">🟢「已成单」= 被客户报价转销售合同后自动置，绿色加粗显示（B1）。</div>
    </div>

    <csv-import-dialog v-model="showImport" title="历史样衣"
      :template-headers="importHeaders" :parse-row="parseSampleRow" :submit="submitImport" @done="load" />
  </div>
</template>

<script setup lang="ts">
import { errToast } from '@/api';
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Upload, Download, Delete, CopyDocument, ArrowDown } from '@element-plus/icons-vue';
import { sampleApi } from '@/api/sample';
import { useAuthStore } from '@/stores/auth';
import { printSample } from '@/utils/samplePrint';
import { exportSampleExcel } from '@/utils/sampleExcel';
import CsvImportDialog from '@/components/CsvImportDialog.vue';
import { UserRole, SAMPLE_STATUS_LABEL, SAMPLE_CATEGORIES } from '@i9/types';

const router = useRouter();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));
const isPatternmaker = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.PATTERNMAKER));
const statuses = Object.entries(SAMPLE_STATUS_LABEL).map(([value, label]) => ({ value, label }));
const sampleCategories = SAMPLE_CATEGORIES;
const statusLabel = (s: string) => (SAMPLE_STATUS_LABEL as any)[s] ?? s;
const statusTag = (s: string) => ({ PENDING: 'info', SAMPLING: 'warning', SHIPPED: 'primary', RETURNED: 'primary', RECONCILED: 'success', DONE: 'success', ABANDONED: 'danger' } as any)[s] ?? 'info';

async function doAbandon(row: any) {
  try {
    await sampleApi.abandon(row.id);
    ElMessage.success('已废弃（下游引用保留快照）');
    load();
  } catch (e: any) { errToast(e?.response?.data?.msg ?? e?.response?.data?.msg ?? '废弃失败'); }
}

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const selected = ref<any[]>([]);
const showAdvanced = ref(false);
const query = reactive({
  page: 1, size: 20, keyword: '', status: undefined as string | undefined,
  style_no: '', middleman_name: '', categories: undefined as string | undefined,
  patternmaker_name: '', maker: '',
});
const makeRange = ref<[string, string] | null>(null); // 制单日期范围
const shipRange = ref<[string, string] | null>(null); // 寄出日期范围

function buildParams() {
  const params: Record<string, unknown> = { page: query.page, size: query.size };
  (['keyword', 'status', 'style_no', 'middleman_name', 'categories', 'patternmaker_name', 'maker'] as const)
    .forEach((k) => { if (query[k]) params[k] = query[k]; });
  if (makeRange.value?.[0]) { params.make_start = makeRange.value[0]; params.make_end = makeRange.value[1]; }
  if (shipRange.value?.[0]) { params.ship_start = shipRange.value[0]; params.ship_end = shipRange.value[1]; }
  return params;
}

async function load() {
  loading.value = true;
  try {
    const res: any = await sampleApi.list(buildParams());
    list.value = res.data ?? [];
    total.value = res.data?.total ?? res.total ?? 0;
  } finally {
    loading.value = false;
  }
}
function reset() {
  query.keyword = ''; query.status = undefined; query.page = 1;
  query.style_no = ''; query.middleman_name = ''; query.categories = undefined;
  query.patternmaker_name = ''; query.maker = '';
  makeRange.value = null; shipRange.value = null;
  load();
}
function goCreate() { router.push({ name: 'SampleCreate' }); }
function goEdit(row: any) { router.push({ name: 'SampleEdit', params: { id: row.id } }); }
function goView(row: any) { router.push({ name: 'SampleView', params: { id: row.id } }); }
function goPatternmaker(row: any) { router.push({ name: 'SamplePatternmaker', params: { id: row.id } }); }

async function copyOne() {
  try { await sampleApi.copy(selected.value[0].id); ElMessage.success('已复制为新样衣（待派单）'); load(); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '复制失败'); }
}
async function batchRemove() {
  try { await ElMessageBox.confirm(`确认删除选中的 ${selected.value.length} 条记录?此操作不可恢复。`, "批量删除", { type: "warning" }); } catch { return; }
  let ok = 0, fail = 0;
  for (const row of selected.value) { try { await sampleApi.remove(row.id); ok++; } catch { fail++; } }
  ElMessage[fail ? 'warning' : 'success'](`删除完成：成功 ${ok} 条${fail ? `，拦截 ${fail} 条(仅待派单/未被引用可删)` : ''}`);
  load();
}
// 打印/PDF(取详情含材料明细;对外脱敏,不含参考价格)
async function printRow(row: any) {
  try { const res: any = await sampleApi.get(row.id); printSample(res.data ?? res); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? e?.message ?? '打印失败'); }
}
// 导出 Excel(取详情含材料明细;.xls)
async function exportRow(row: any) {
  try { const res: any = await sampleApi.get(row.id); exportSampleExcel(res.data ?? res); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? e?.message ?? '导出失败'); }
}

// ── 历史样衣 CSV 批量导入 ──
const showImport = ref(false);
const importHeaders = ['客户款号', '样衣类别', '中间商名称', '制版师', '制单人', '材料品名(分号分隔)'];
function parseSampleRow(c: Record<string, string>) {
  if (!c['客户款号']) return { row: null, error: '客户款号必填' };
  if (!c['样衣类别']) return { row: null, error: '样衣类别必填' };
  if (!c['中间商名称']) return { row: null, error: '中间商名称必填' };
  if (!c['材料品名(分号分隔)']) return { row: null, error: '材料品名必填' };
  return {
    row: {
      styleNo: c['客户款号'], categories: c['样衣类别'], middlemanName: c['中间商名称'],
      patternmakerName: c['制版师'] || undefined, maker: c['制单人'] || undefined,
      materials: c['材料品名(分号分隔)'],
    },
  };
}
async function submitImport(rows: any[]) {
  const res: any = await sampleApi.importBatch(rows);
  const d = res.data ?? res;
  // 适配 CsvImportDialog 结果面板 {created, failedCount, failed:[{index,name,error}]}
  return {
    created: d.ok ?? 0,
    failedCount: d.fail ?? 0,
    failed: (d.failures ?? []).map((f: any) => ({ index: f.row, name: rows[f.row - 1]?.styleNo ?? '', error: f.reason })),
  };
}

function exportCsv() {
  const cols = ['sample_no', 'style_no', 'categories', 'middleman_name', 'patternmaker_name', 'status', 'make_date'];
  const head = ['样衣编号', '客户款号', '样衣类别', '中间商', '制版师', '状态', '制单日期'];
  const rows = list.value.map((r) => cols.map((c) => `"${r[c] ?? ''}"`).join(','));
  const csv = '﻿' + [head.join(','), ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = '样衣管理.csv'; a.click();
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
