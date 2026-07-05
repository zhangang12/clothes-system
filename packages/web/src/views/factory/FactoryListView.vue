<template>
  <div class="list-page">
    <!-- 工具栏 -->
    <div class="toolbar-card">
      <div class="toolbar">
        <div class="tools-left">
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="goCreate">新建</el-button>
          <el-button type="warning" plain :icon="Upload" @click="showImport = true">导入工厂资料</el-button>
          <el-button plain :icon="Download" @click="exportCsv">导出</el-button>
          <el-button v-if="isAdmin" type="danger" plain :icon="Delete" :disabled="!selected.length" @click="batchRemove">
            删除{{ selected.length ? `(${selected.length})` : '' }}
          </el-button>
        </div>
        <div class="tools-right">
          <el-input v-model="query.keyword" placeholder="编号/名称/省市/地址/业务范围/法人" clearable style="width:280px"
            @keyup.enter="load" @clear="load">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button type="primary" @click="load">搜索</el-button>
          <el-button @click="reset">清空</el-button>
          <el-button text @click="showAdvanced = !showAdvanced">高级筛选 <el-icon><ArrowDown /></el-icon></el-button>
        </div>
      </div>
      <!-- 高级筛选 -->
      <el-collapse-transition>
        <div v-show="showAdvanced" class="advanced">
          <el-form inline>
            <el-form-item label="状态">
              <el-select v-model="query.status" clearable placeholder="全部" style="width:110px" @change="load">
                <el-option label="启用" :value="1" /><el-option label="停用" :value="0" />
              </el-select>
            </el-form-item>
            <el-form-item label="工厂类型">
              <el-select v-model="query.type" clearable placeholder="全部" style="width:150px" @change="load">
                <el-option v-for="t in factoryTypes" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
          </el-form>
        </div>
      </el-collapse-transition>
    </div>

    <!-- 列表 -->
    <div class="table-card">
      <el-table :data="list" v-loading="loading" border stripe :row-class-name="rowClass"
        @selection-change="(v: any[]) => selected = v" @row-dblclick="goEdit">
        <el-table-column type="selection" width="42" />
        <el-table-column prop="factory_no" label="编号" width="100" sortable />
        <el-table-column prop="name" label="厂商名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="工厂类型" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="light" :type="typeTag(row.type)">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="省/市" width="130">
          <template #default="{ row }">{{ [row.province, row.city].filter(Boolean).join(' ') || '-' }}</template>
        </el-table-column>
        <el-table-column label="最后交易日期" width="130">
          <template #default="{ row }">
            <span :class="{ overdue: isOverdue(row.last_trade_date) }">{{ row.last_trade_date || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="开票" width="70" align="center">
          <template #default="{ row }">
            <span :style="{ color: row.can_invoice ? '#3E8E7E' : '#C04042' }">{{ row.can_invoice ? '✓' : '✗' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small"
              :style="{ cursor: isAdmin ? 'pointer' : 'default' }" @click="isAdmin && toggleStatus(row)">
              {{ row.status === 1 ? '启用' : '停用' }}
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
      <div class="tip">💡「最后交易日期」超过 90 天未更新的记录以红色标记，提示关注长期无往来厂商。</div>
    </div>

    <csv-import-dialog v-model="showImport" title="工厂资料"
      :template-headers="importHeaders" :parse-row="parseFactoryRow" :submit="submitImport" @done="load" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search, Plus, Upload, Download, Delete, ArrowDown } from '@element-plus/icons-vue';
import { factoryApi } from '@/api/factory';
import { useAuthStore } from '@/stores/auth';
import { UserRole, FACTORY_TYPE_LABEL } from '@i9/types';
import type { Factory } from '@i9/types';
import CsvImportDialog from '@/components/CsvImportDialog.vue';

const router = useRouter();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));
const factoryTypes = Object.entries(FACTORY_TYPE_LABEL).map(([value, label]) => ({ value, label }));

const typeLabel = (t: string) => (FACTORY_TYPE_LABEL as any)[t] ?? t;
const typeTag = (t: string) => ({ FABRIC: 'primary', ACCESSORY: 'success', OUTSOURCE: 'warning', FORWARDER: 'info', TESTING: 'info', EXPORT: 'danger', OTHER: 'info' } as any)[t] ?? 'info';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const selected = ref<any[]>([]);
const showAdvanced = ref(false);
const query = reactive({ page: 1, size: 20, keyword: '', type: undefined as string | undefined, status: undefined as number | undefined });

function isOverdue(d?: string) {
  if (!d) return false;
  return (Date.now() - new Date(d).getTime()) / 86400000 > 90;
}
const rowClass = ({ row }: { row: any }) => (isOverdue(row.last_trade_date) ? 'overdue-row' : '');

async function load() {
  loading.value = true;
  try {
    const res: any = await factoryApi.list(query);
    list.value = res.data?.items ?? res.items ?? [];
    total.value = res.data?.total ?? res.total ?? 0;
  } finally {
    loading.value = false;
  }
}
function reset() {
  query.keyword = ''; query.type = undefined; query.status = undefined; query.page = 1; load();
}
function goCreate() { router.push({ name: 'FactoryCreate' }); }
function goEdit(row: Factory) { router.push({ name: 'FactoryEdit', params: { id: row.id } }); }
function goView(row: Factory) { router.push({ name: 'FactoryView', params: { id: row.id } }); }

async function toggleStatus(row: any) {
  try {
    await factoryApi.toggleStatus(row.id);
    ElMessage.success(row.status === 1 ? '已停用' : '已启用');
    load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '操作失败');
  }
}
async function remove(id: number) {
  try {
    await factoryApi.remove(id);
    ElMessage.success('删除成功');
    load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '删除失败');
  }
}
async function batchRemove() {
  let ok = 0, fail = 0;
  for (const row of selected.value) {
    try { await factoryApi.remove(row.id); ok++; } catch { fail++; }
  }
  ElMessage[fail ? 'warning' : 'success'](`删除完成：成功 ${ok} 条${fail ? `，被引用拦截 ${fail} 条` : ''}`);
  load();
}
// ── Excel/CSV 批量导入 ──
const showImport = ref(false);
const importHeaders = ['厂商名称', '工厂类型', '联系人姓名', '联系人手机', '所在省份', '所在城市', '详细地址', '业务范围'];
const TYPE_BY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(FACTORY_TYPE_LABEL).map(([code, label]) => [label, code]),
);
function parseFactoryRow(c: Record<string, string>) {
  const name = c['厂商名称'];
  const type = TYPE_BY_LABEL[c['工厂类型']];
  const contactName = c['联系人姓名'];
  if (!name) return { row: null, error: '厂商名称必填' };
  if (!type) return { row: null, error: `工厂类型无效(${c['工厂类型'] || '空'})` };
  if (!contactName) return { row: null, error: '联系人姓名必填' };
  return {
    row: {
      name, type, province: c['所在省份'] || undefined, city: c['所在城市'] || undefined,
      address: c['详细地址'] || undefined, businessScope: c['业务范围'] || undefined,
      contacts: [{ name: contactName, mobile: c['联系人手机'] || undefined }],
    },
  };
}
const submitImport = (rows: any[]) => factoryApi.importBatch(rows);
function exportCsv() {
  const cols = ['factory_no', 'name', 'type', 'province', 'city', 'status'];
  const head = ['编号', '厂商名称', '类型', '省份', '城市', '状态'];
  const rows = list.value.map((r) => cols.map((c) => `"${r[c] ?? ''}"`).join(','));
  const csv = '﻿' + [head.join(','), ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = '工厂资料.csv'; a.click();
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
.overdue { color: #C04042; font-weight: 600; }
:deep(.overdue-row) { background: #FDF0EF !important; }
</style>
