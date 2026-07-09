<template>
  <div class="list-page">
    <div class="toolbar-card">
      <div class="toolbar">
        <div class="tools-left">
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="goCreate">新建</el-button>
          <el-button type="warning" plain :icon="Upload" @click="showImport = true">导入客户资料</el-button>
          <el-button v-if="isAdmin" type="warning" plain :icon="Key" :disabled="!selected.length" @click="grantTip">批量授权机密权限</el-button>
          <el-button plain :icon="Download" @click="exportCsv">导出</el-button>
          <el-button v-if="isAdmin" type="danger" plain :icon="Delete" :disabled="!selected.length" @click="batchRemove">
            删除{{ selected.length ? `(${selected.length})` : '' }}
          </el-button>
        </div>
        <div class="tools-right">
          <el-input v-model="query.keyword" placeholder="编号/国别/区域/城市/主页/地址" clearable style="width:260px"
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
              <el-select v-model="query.status" clearable placeholder="全部" style="width:110px" @change="load">
                <el-option label="启用" :value="1" /><el-option label="停用" :value="0" />
              </el-select>
            </el-form-item>
            <el-form-item label="客户类型">
              <el-select v-model="query.type" clearable placeholder="全部" style="width:130px" @change="load">
                <el-option label="中间商" value="MIDDLEMAN" /><el-option label="最终买家" value="BUYER" />
              </el-select>
            </el-form-item>
            <el-form-item label="信用等级">
              <el-select v-model="query.grade" clearable placeholder="全部" style="width:110px" @change="load">
                <el-option label="A级" value="A" /><el-option label="B级" value="B" /><el-option label="C级" value="C" />
              </el-select>
            </el-form-item>
          </el-form>
        </div>
      </el-collapse-transition>
    </div>

    <div class="table-card">
      <el-table :data="list" v-loading="loading" border stripe @selection-change="(v: any[]) => selected = v" @row-dblclick="goEdit">
        <el-table-column type="selection" width="42" />
        <el-table-column prop="customer_no" label="编号" width="100" sortable />
        <el-table-column prop="name" label="客户名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === 'BUYER' ? 'warning' : 'primary'" effect="light">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="trade_country" label="国别" width="90"><template #default="{ row }">{{ row.trade_country || '-' }}</template></el-table-column>
        <el-table-column prop="price_terms" label="价格条款" width="120"><template #default="{ row }">{{ row.price_terms || '-' }}</template></el-table-column>
        <el-table-column prop="settlement_method" label="结汇方式" width="120"><template #default="{ row }">{{ row.settlement_method || '-' }}</template></el-table-column>
        <el-table-column label="信用" width="80" align="center">
          <template #default="{ row }"><span v-if="row.grade">信用 {{ row.grade }}</span><span v-else>-</span></template>
        </el-table-column>
        <el-table-column label="加密" width="80" align="center"><template #default>🔒 机密</template></el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small"
              :style="{ cursor: isAdmin ? 'pointer' : 'default' }" @click="isAdmin && toggleStatus(row)">
              {{ row.status === 1 ? '活跃' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="goEdit(row)">编辑</el-button>
            <el-button link size="small" @click="goView(row)">查看</el-button>
            <el-popconfirm v-if="isAdmin" title="确认删除？被引用将被拦截" @confirm="remove(row.id)">
              <template #reference><el-button link type="danger" size="small">删除</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <div class="footer">
        <span class="sel-info">已选 {{ selected.length }} 条 · 共 {{ total }} 条</span>
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.size" :total="total"
          :page-sizes="[10, 20, 50, 100]" layout="sizes, prev, pager, next" @change="load" />
      </div>
      <div class="tip">🔒 客户资料属机密单据：未授权用户看不到该客户行，且不会在报价/合同的客户下拉中列出。</div>
    </div>

    <csv-import-dialog v-model="showImport" title="客户资料"
      :template-headers="importHeaders" :parse-row="parseCustomerRow" :submit="submitImport" @done="load" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Upload, Download, Delete, Key, ArrowDown } from '@element-plus/icons-vue';
import { customerApi } from '@/api/customer';
import { useAuthStore } from '@/stores/auth';
import { UserRole, CUSTOMER_TYPE_LABEL } from '@i9/types';
import type { Customer } from '@i9/types';
import CsvImportDialog from '@/components/CsvImportDialog.vue';

const router = useRouter();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));
const typeLabel = (t: string) => (CUSTOMER_TYPE_LABEL as any)[t] ?? t;

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const selected = ref<any[]>([]);
const showAdvanced = ref(false);
const query = reactive({ page: 1, size: 20, keyword: '', type: undefined as string | undefined, grade: undefined as string | undefined, status: undefined as number | undefined });

async function load() {
  loading.value = true;
  try {
    const res: any = await customerApi.list(query);
    list.value = res.data ?? [];
    total.value = res.data?.total ?? res.total ?? 0;
  } finally {
    loading.value = false;
  }
}
function reset() { query.keyword = ''; query.type = undefined; query.grade = undefined; query.status = undefined; query.page = 1; load(); }
function goCreate() { router.push({ name: 'CustomerCreate' }); }
function goEdit(row: Customer) { router.push({ name: 'CustomerEdit', params: { id: row.id } }); }
function goView(row: Customer) { router.push({ name: 'CustomerView', params: { id: row.id } }); }

async function toggleStatus(row: any) {
  try { await customerApi.toggleStatus(row.id); ElMessage.success(row.status === 1 ? '已停用' : '已启用'); load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '操作失败'); }
}
async function remove(id: number) {
  try { await customerApi.remove(id); ElMessage.success('删除成功'); load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '删除失败'); }
}
async function batchRemove() {
  try { await ElMessageBox.confirm(`确认删除选中的 ${selected.value.length} 条记录?此操作不可恢复。`, "批量删除", { type: "warning" }); } catch { return; }
  let ok = 0, fail = 0;
  for (const row of selected.value) { try { await customerApi.remove(row.id); ok++; } catch { fail++; } }
  ElMessage[fail ? 'warning' : 'success'](`删除完成：成功 ${ok} 条${fail ? `，被引用拦截 ${fail} 条` : ''}`);
  load();
}
// ── Excel/CSV 批量导入 ──
const showImport = ref(false);
const importHeaders = ['客户名称', '客户类型', '信用等级', '贸易国别', '所在城市', '详细地址', '联系人姓名', '联系人手机', '币种'];
const TYPE_BY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(CUSTOMER_TYPE_LABEL).map(([code, label]) => [label, code]),
);
const GRADE_BY_LABEL: Record<string, string> = { A级: 'A', B级: 'B', C级: 'C', A: 'A', B: 'B', C: 'C' };
function parseCustomerRow(c: Record<string, string>) {
  const type = TYPE_BY_LABEL[c['客户类型']];
  const contactName = c['联系人姓名'];
  if (!type) return { row: null, error: `客户类型无效(需 中间商/最终买家)` };
  if (!contactName) return { row: null, error: '联系人姓名必填' };
  if (type === 'BUYER') return { row: null, error: '最终买家需在编辑页选关联中间商，暂不支持导入' };
  return {
    row: {
      name: c['客户名称'] || undefined, type, grade: GRADE_BY_LABEL[c['信用等级']] || undefined,
      tradeCountry: c['贸易国别'] || undefined, city: c['所在城市'] || undefined, address: c['详细地址'] || undefined,
      currency: c['币种'] || undefined,
      contacts: [{ name: contactName, mobile: c['联系人手机'] || undefined }],
    },
  };
}
const submitImport = (rows: any[]) => customerApi.importBatch(rows);
function grantTip() { ElMessage.info(`批量授权机密权限：当前选中 ${selected.value.length} 个客户`); }
function exportCsv() {
  const cols = ['customer_no', 'name', 'type', 'trade_country', 'price_terms', 'grade', 'status'];
  const head = ['编号', '客户名称', '类型', '国别', '价格条款', '信用', '状态'];
  const rows = list.value.map((r) => cols.map((c) => `"${r[c] ?? ''}"`).join(','));
  const csv = '﻿' + [head.join(','), ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = '客户资料.csv'; a.click();
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
</style>
