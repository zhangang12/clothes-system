<template>
  <div class="list-page">
    <div class="toolbar-card">
      <div class="toolbar">
        <div class="tools-left">
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="goCreate">新建</el-button>
          <el-button v-if="canImport" type="warning" plain :icon="Upload" @click="showImport = true">导入客户资料</el-button>
          <el-button v-if="isAdmin" type="warning" plain :icon="Key" :disabled="!selected.length" @click="openGrant">批量授权机密权限</el-button>
          <el-button plain :icon="Download" :loading="exporting" @click="exportAllRows">导出</el-button>
          <el-dropdown trigger="click" @command="onMore">
            <el-button plain>···</el-button>
            <template #dropdown><el-dropdown-menu>
              <el-dropdown-item command="print">🖨 打印当前列表</el-dropdown-item>
              <el-dropdown-item command="copy">📋 复制到剪贴板</el-dropdown-item>
              <el-dropdown-item command="cols">👁 自定义显示列</el-dropdown-item>
              <el-dropdown-item command="reset">↺ 重置筛选</el-dropdown-item>
            </el-dropdown-menu></template>
          </el-dropdown>
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
            <el-form-item label="贸易国别"><el-input v-model="query.trade_country" clearable style="width:110px" @keyup.enter="load" @clear="load" /></el-form-item>
            <el-form-item label="合作等级"><el-input v-model="query.cooperation_level" clearable style="width:110px" @keyup.enter="load" @clear="load" /></el-form-item>
            <el-form-item label="客户来源"><el-input v-model="query.customer_source" clearable style="width:110px" @keyup.enter="load" @clear="load" /></el-form-item>
            <el-form-item label="外销员"><el-input v-model="query.salesperson" clearable style="width:100px" @keyup.enter="load" @clear="load" /></el-form-item>
            <el-form-item label="联系人/手机"><el-input v-model="query.contact" clearable style="width:130px" @keyup.enter="load" @clear="load" /></el-form-item>
            <el-form-item label="开发时间">
              <el-date-picker v-model="query.develop_start" type="date" value-format="YYYY-MM-DD" placeholder="起" style="width:130px" @change="load" />
              <span style="margin:0 4px">—</span>
              <el-date-picker v-model="query.develop_end" type="date" value-format="YYYY-MM-DD" placeholder="止" style="width:130px" @change="load" />
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
      <el-table :data="list" v-loading="loading" border stripe @selection-change="(v: any[]) => selected = v" @row-dblclick="goEdit" @row-click="onRowClick" ref="tableRef">
        <el-table-column type="selection" width="42" />
        <el-table-column prop="customer_no" label="编号" width="100" sortable />
        <el-table-column prop="name" label="客户名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === 'BUYER' ? 'warning' : 'primary'" effect="light">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="showCol('trade_country')" prop="trade_country" label="国别" width="90"><template #default="{ row }">{{ row.trade_country || '-' }}</template></el-table-column>
        <el-table-column v-if="showCol('price_terms')" prop="price_terms" label="价格条款" width="120"><template #default="{ row }">{{ row.price_terms || '-' }}</template></el-table-column>
        <el-table-column v-if="showCol('settlement_method')" prop="settlement_method" label="结汇方式" width="120"><template #default="{ row }">{{ row.settlement_method || '-' }}</template></el-table-column>
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
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="goEdit(row)">编辑</el-button>
            <el-button link size="small" @click="goView(row)">查看</el-button>
            <el-button v-if="isAdmin" link type="warning" size="small" @click="openGrantList(row)">授权</el-button>
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

    <!-- 批量授权机密权限（设计稿 01 §D.3，仅管理员） -->
    <el-dialog v-model="grantVisible" title="🔑 批量授权机密权限" width="560px">
      <div class="grant-hint">把选中的 <b>{{ selected.length }}</b> 个机密客户授权给以下用户（非授权用户在客户列表/下拉中均不可见这些客户）</div>
      <el-form label-width="90px">
        <el-form-item label="授权用户">
          <el-checkbox-group v-model="grantForm.user_ids">
            <el-checkbox v-for="u in grantUsers" :key="u.id" :value="u.id" :label="u.id" style="width:46%">
              {{ u.real_name || u.username }}（{{ u.username }} · {{ u.role }}）
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="权限级别">
          <el-radio-group v-model="grantForm.can_edit">
            <el-radio :value="false">仅查看</el-radio>
            <el-radio :value="true">查看 + 修改</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="有效期至">
          <el-date-picker v-model="grantForm.expire_at" type="date" value-format="YYYY-MM-DD" placeholder="留空=永久有效(过期自动失效)" style="width:100%" />
        </el-form-item>
        <el-form-item label="授权备注">
          <el-input v-model="grantForm.remark" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="grantVisible = false">取消</el-button>
        <el-button type="primary" :loading="grantSaving" @click="doGrant">确认授权</el-button>
      </template>
    </el-dialog>

    <!-- 单客户授权清单（查看 / 撤销） -->
    <el-dialog v-model="grantListVisible" title="🔒 机密授权清单" width="520px">
      <el-table :data="grantList" size="small" border>
        <el-table-column label="用户" min-width="140"><template #default="{ row }">{{ row.real_name || row.username }}（{{ row.username }}）</template></el-table-column>
        <el-table-column prop="role" label="角色" width="110" />
        <el-table-column label="权限" width="100" align="center"><template #default="{ row }"><el-tag size="small" :type="row.can_edit ? 'warning' : 'info'">{{ row.can_edit ? '查看+修改' : '仅查看' }}</el-tag></template></el-table-column>
        <el-table-column label="有效期至" width="104"><template #default="{ row }">{{ row.expire_at ? String(row.expire_at).slice(0, 10) : '永久' }}</template></el-table-column>
        <el-table-column label="备注" min-width="90"><template #default="{ row }">{{ row.remark || '—' }}</template></el-table-column>
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ row }">
            <el-popconfirm title="撤销后该用户将不可见此客户，确认？" @confirm="doRevoke(row)">
              <template #reference><el-button link type="danger" size="small">撤销</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!grantList.length" class="grant-hint">暂无授权记录（创建人与管理员天然可见）</div>
    </el-dialog>

    <el-dialog v-model="colsVisible" title="自定义显示列" width="420px">
      <el-checkbox-group v-model="visibleCols">
        <el-checkbox v-for="c in ALL_COLS" :key="c.key" :value="c.key" style="width:46%">{{ c.title }}</el-checkbox>
      </el-checkbox-group>
    </el-dialog>
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
const query = reactive({ page: 1, size: 20, keyword: '', type: undefined as string | undefined, grade: undefined as string | undefined, status: undefined as number | undefined, trade_country: '', cooperation_level: '', customer_source: '', salesperson: '', contact: '', develop_start: '', develop_end: '' });

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
function reset() { query.keyword = ''; query.type = undefined; query.grade = undefined; query.status = undefined; query.page = 1; Object.assign(query, { trade_country: '', cooperation_level: '', customer_source: '', salesperson: '', contact: '', develop_start: '', develop_end: '' }); load(); }
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
// ===== 批量授权机密权限（设计稿 01 §D.3，仅管理员）=====
const grantVisible = ref(false);
const grantUsers = ref<any[]>([]);
const grantForm = reactive<{ user_ids: number[]; can_edit: boolean; expire_at: string; remark: string }>({ user_ids: [], can_edit: false, expire_at: '', remark: '' });
const grantSaving = ref(false);
async function openGrant() {
  grantForm.user_ids = []; grantForm.can_edit = false; grantForm.expire_at = ''; grantForm.remark = '';
  try { grantUsers.value = ((await customerApi.listUsers()) as any).data ?? []; }
  catch { ElMessage.error('加载用户清单失败'); return; }
  grantVisible.value = true;
}
async function doGrant() {
  if (!grantForm.user_ids.length) { ElMessage.warning('请至少勾选 1 个用户'); return; }
  grantSaving.value = true;
  try {
    const res: any = await customerApi.grantBatch(selected.value.map((c: any) => c.id), grantForm.user_ids, grantForm.can_edit, grantForm.expire_at || undefined, grantForm.remark || undefined);
    const d = res.data ?? res;
    ElMessage.success(`已授权：${d.customers} 个客户 × ${d.users} 个用户（新增 ${d.created}，更新 ${d.updated}）`);
    grantVisible.value = false;
  } catch (e: any) { ElMessage.error(e?.response?.status === 403 ? '您没有权限执行此操作！' : (e?.response?.data?.message ?? '授权失败')); }
  finally { grantSaving.value = false; }
}
// 单客户授权清单（查看/撤销）
const grantListVisible = ref(false);
const grantList = ref<any[]>([]);
let grantListTarget: any = null;
async function openGrantList(row: any) {
  grantListTarget = row;
  try { grantList.value = ((await customerApi.getGrants(row.id)) as any).data ?? []; }
  catch { grantList.value = []; }
  grantListVisible.value = true;
}
async function doRevoke(g: any) {
  await customerApi.revokeGrant(grantListTarget.id, g.user_id);
  ElMessage.success('已撤销该用户的机密授权');
  openGrantList(grantListTarget);
}
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

// ===== 列表增强(基础资料稿 §列表页) =====
import { exportAll } from '@/utils/exportAll';
const canImport = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));
const exporting = ref(false);
const tableRef = ref();
const ALL_COLS = [
  { key: 'customer_no', title: '编号' }, { key: 'name', title: '客户名称' }, { key: 'type', title: '类型' },
  { key: 'trade_country', title: '贸易国别' }, { key: 'country_region', title: '国家区域' }, { key: 'city', title: '城市' },
  { key: 'price_terms', title: '价格条款' }, { key: 'settlement_method', title: '结汇方式' },
  { key: 'grade', title: '信用等级' }, { key: 'cooperation_level', title: '合作等级' }, { key: 'customer_source', title: '客户来源' },
  { key: 'salesperson', title: '外销员' }, { key: 'develop_date', title: '开发时间' }, { key: 'status', title: '状态' },
];
const colsVisible = ref(false);
const visibleCols = ref<string[]>(ALL_COLS.map((c) => c.key));
const showCol = (k: string) => visibleCols.value.includes(k);
// 单击行=切换选中;按住 Shift=连选(设计稿 §行交互)
let lastClickIndex = -1;
function onRowClick(row: any, _col: any, event: MouseEvent) {
  const idx = list.value.indexOf(row);
  const table = tableRef.value;
  if (!table) return;
  if (event.shiftKey && lastClickIndex >= 0) {
    const [a, b] = [Math.min(lastClickIndex, idx), Math.max(lastClickIndex, idx)];
    for (let i = a; i <= b; i++) table.toggleRowSelection(list.value[i], true);
  } else {
    table.toggleRowSelection(row);
  }
  lastClickIndex = idx;
}
async function exportAllRows() {
  exporting.value = true;
  try {
    const n = await exportAll((p, sz) => customerApi.list({ ...query, page: p, size: sz }) as any, ALL_COLS, '客户资料');
    ElMessage.success(`已导出全部 ${n} 条(全列)`);
  } catch (e: any) { ElMessage.error(e?.message ?? '导出失败'); }
  finally { exporting.value = false; }
}
function onMore(cmd: string) {
  if (cmd === 'print') window.print();
  else if (cmd === 'copy') {
    const tsv = [ALL_COLS.map((c) => c.title).join('\t'),
      ...list.value.map((r: any) => ALL_COLS.map((c) => r[c.key] ?? '').join('\t'))].join('\n');
    navigator.clipboard.writeText(tsv).then(() => ElMessage.success('已复制当前页到剪贴板(可直接粘进 Excel)'));
  }
  else if (cmd === 'cols') colsVisible.value = true;
  else if (cmd === 'reset') reset();
}
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
.grant-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 10px; }
</style>
