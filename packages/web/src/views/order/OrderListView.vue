<template>
  <div class="list-page">
    <div class="toolbar-card">
      <div class="toolbar">
        <div class="tools-left">
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="goCreate">新建</el-button>
          <el-button plain :icon="Download" @click="exportCsv">导出</el-button>
          <el-button v-if="isAdmin" type="danger" plain :icon="Delete" :disabled="!selected.length" @click="batchRemove">
            删除{{ selected.length ? `(${selected.length})` : '' }}
          </el-button>
        </div>
        <div class="tools-right">
          <el-input v-model="query.keyword" placeholder="订单编号/款号/PO/中间商/买家" clearable style="width:280px"
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
              <el-select v-model="query.status" clearable placeholder="全部" style="width:140px" @change="load">
                <el-option v-for="s in statuses" :key="s.value" :label="s.label" :value="s.value" />
              </el-select>
            </el-form-item>
          </el-form>
        </div>
      </el-collapse-transition>
    </div>

    <div class="table-card">
      <el-table :data="list" v-loading="loading" border stripe :row-class-name="rowClass" @selection-change="(v: any[]) => selected = v" @row-dblclick="goEdit">
        <el-table-column type="selection" width="42" />
        <el-table-column prop="order_no" label="订单编号" width="150" sortable />
        <el-table-column prop="style_no" label="客户款号" min-width="120"><template #default="{ row }">{{ row.style_no || row.style_name || '-' }}</template></el-table-column>
        <el-table-column prop="customer_po" label="客户PO" min-width="130"><template #default="{ row }">{{ row.customer_po || '-' }}</template></el-table-column>
        <el-table-column label="中间商/买家" min-width="150"><template #default="{ row }">{{ [row.middleman_name, row.buyer_name].filter(Boolean).join(' / ') || '-' }}</template></el-table-column>
        <el-table-column label="大货总数" width="90" align="right"><template #default="{ row }">{{ row.qty_total ?? 0 }}</template></el-table-column>
        <el-table-column label="单品单价" width="100" align="right"><template #default="{ row }">{{ row.unit_price != null ? `${row.currency === 'RMB' ? '¥' : '$'}${row.unit_price}` : '-' }}</template></el-table-column>
        <el-table-column prop="delivery_date" label="约定交期" width="110"><template #default="{ row }">{{ row.delivery_date || '-' }}</template></el-table-column>
        <el-table-column label="总金额" width="120" align="right">
          <template #default="{ row }">
            <span v-if="row.total_amount != null">{{ row.currency || '' }} {{ (+row.total_amount).toFixed(2) }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
            <el-tag v-if="row.approval_status === 'PENDING'" type="warning" size="small" style="margin-left:4px">待审批</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="salesperson" label="业务员" width="90"><template #default="{ row }">{{ row.salesperson || '-' }}</template></el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="goEdit(row)">编辑</el-button>
            <el-button link size="small" @click="goView(row)">查看</el-button>
            <el-button v-if="row.approval_status === 'PENDING' && canReview" link type="success" size="small" @click="doApprove(row)">审批</el-button>
            <el-dropdown trigger="click" @command="(cmd: string) => onPrint(cmd, row)">
              <el-button link size="small">打印<el-icon><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="customer">对客确认单（无成本）</el-dropdown-item>
                  <el-dropdown-item command="factory">生产通知单（无客户/价格）</el-dropdown-item>
                  <el-dropdown-item command="internal">内部单据（全量）</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button v-if="canEdit" link type="info" size="small" @click="doCopy(row)">复制</el-button>
            <el-dropdown
              v-if="canEdit && ['CONFIRMED', 'CONTRACTED', 'PRODUCING'].includes(row.status)"
              trigger="click" @command="(cmd: string) => onGenContract(cmd, row)"
            >
              <el-button link type="warning" size="small">生成合同<el-icon><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="material">材料合同（按供应商拆单）</el-dropdown-item>
                  <el-dropdown-item command="process">加工合同（带入订单明细）</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <div class="footer">
        <span class="sel-info">已选 {{ selected.length }} 条 · 共 {{ total }} 条</span>
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.size" :total="total"
          :page-sizes="[10, 20, 50, 100]" layout="sizes, prev, pager, next" @change="load" />
      </div>
      <div class="tip">大货总数量 = 尺码数量搭配表所有格子之和；采购量 = 大货总数 × 单件耗用 × (1+损耗%)。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Download, Delete, ArrowDown } from '@element-plus/icons-vue';
import { orderApi } from '@/api/order';
import { contractApi } from '@/api/contract';
import { printOrder } from '@/utils/orderPrint';
import { useAuthStore } from '@/stores/auth';
import { UserRole, ORDER_STATUS_LABEL } from '@i9/types';

const router = useRouter();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));
const canReview = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.SUPERVISOR));
const statuses = Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => ({ value, label }));
const statusLabel = (s: string) => (ORDER_STATUS_LABEL as any)[s] ?? s;
const statusTag = (s: string) => ({ DRAFT: 'info', CONFIRMED: 'primary', CONTRACTED: 'warning', PRODUCING: 'warning', DONE: 'success' } as any)[s] ?? 'info';
const rowClass = ({ row }: { row: any }) => (row.status === 'DONE' ? 'done-row' : '');

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const selected = ref<any[]>([]);
const showAdvanced = ref(false);
const query = reactive({ page: 1, size: 20, keyword: '', status: undefined as string | undefined });

async function load() {
  loading.value = true;
  try {
    const res: any = await orderApi.list(query);
    list.value = res.data ?? [];
    total.value = res.data?.total ?? res.total ?? 0;
  } finally { loading.value = false; }
}
function reset() { query.keyword = ''; query.status = undefined; query.page = 1; load(); }
function goCreate() { router.push({ name: 'OrderCreate' }); }
function goEdit(row: any) { router.push({ name: 'OrderEdit', params: { id: row.id } }); }

// 三套脱敏打印(P3#32/ORD E2)
async function onPrint(mode: string, row: any) {
  const res: any = await orderApi.get(row.id);
  printOrder(res.data ?? res, mode as any);
}

// 订单复制(P3#34)
async function doCopy(row: any) {
  try {
    const res: any = await orderApi.copy(row.id);
    const d = res?.data ?? res;
    ElMessage.success(`已复制为新草稿 ${d.order_no ?? ''}`);
    load();
  } catch (e: any) { ElMessage.error(e?.response?.data?.msg ?? '复制失败'); }
}

// 生成合同入口（设计稿 合同 A1 主流程:订单侧拆单,而非只能从合同侧反向带入）
async function onGenContract(cmd: string, row: any) {
  if (cmd === 'process') {
    router.push({ path: '/contracts/new', query: { type: 'PROCESS', order_id: row.id } });
    return;
  }
  try {
    await ElMessageBox.confirm(
      '将按订单「用料核算」中的供应商分组，每个供应商各生成一张材料合同草稿（分色/分码材料按尺码矩阵拆行）。',
      '生成材料合同', { type: 'info', confirmButtonText: '生成', cancelButtonText: '取消' },
    );
  } catch { return; }
  try {
    const res: any = await contractApi.generateFromOrder(row.id);
    const d = res?.data ?? res;
    const unmatched: string[] = d?.unmatched ?? [];
    if (d?.created) ElMessage.success(`已生成 ${d.created} 张材料合同草稿`);
    if (unmatched.length) {
      ElMessageBox.alert(
        `以下供应商未在工厂库中登记，对应材料未生成合同：${unmatched.join('、')}。请先在基础资料·工厂库补录后重试。`,
        '部分供应商未匹配', { type: 'warning' },
      );
    } else if (!d?.created) {
      ElMessage.warning('没有可生成的材料行');
    }
    if (d?.created) router.push({ path: '/contracts', query: { order_id: row.id } });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg ?? e?.response?.data?.message ?? '生成失败');
  }
}
function goView(row: any) { router.push({ name: 'OrderView', params: { id: row.id } }); }
async function doApprove(row: any) {
  try { await orderApi.approve(row.id); ElMessage.success('已审批，订单可下单'); load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '审批失败'); }
}
async function batchRemove() {
  try { await ElMessageBox.confirm(`确认删除选中的 ${selected.value.length} 条记录?此操作不可恢复。`, "批量删除", { type: "warning" }); } catch { return; }
  let ok = 0, fail = 0;
  for (const row of selected.value) { try { await orderApi.remove(row.id); ok++; } catch { fail++; } }
  ElMessage[fail ? 'warning' : 'success'](`删除完成：成功 ${ok} 条${fail ? `，拦截 ${fail} 条(仅草稿可删)` : ''}`);
  load();
}
function exportCsv() {
  const cols = ['order_no', 'style_no', 'customer_po', 'middleman_name', 'buyer_name', 'qty_total', 'unit_price', 'delivery_date', 'status'];
  const head = ['订单编号', '客户款号', '客户PO', '中间商', '最终买家', '大货总数', '单品单价', '约定交期', '状态'];
  const rows = list.value.map((r) => cols.map((c) => `"${r[c] ?? ''}"`).join(','));
  const csv = '﻿' + [head.join(','), ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = '订单.csv'; a.click();
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
:deep(.done-row) { background: #F0F7F4 !important; }
</style>
