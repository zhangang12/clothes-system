<template>
  <div class="list-page">
    <RuleHint>订单由报价「转销售合同」自动生成;<b>只有草稿状态可编辑</b>,已下单可「撤回」回草稿修改(已生成合同起不可撤回);下单后状态由下游(生成合同/发货/对账)<b>自动推进,不可手改</b>;可用行内「生成合同」按供应商拆单生成材料/加工合同——<b>材料合同可分批下</b>：列表入口只为还没下单的材料生成，要挑行先下请进订单页勾选。</RuleHint>
    <div class="toolbar-card">
      <div class="toolbar">
        <div class="tools-left">
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="goCreate">新建</el-button>
          <el-button plain :icon="Download" :loading="exporting" @click="exportCsv">导出</el-button>
          <el-button v-if="isAdmin" plain :icon="Upload" @click="importDialog = true">历史导入</el-button>
          <el-button v-if="isAdmin" type="danger" plain :icon="Delete" :disabled="!selected.length" @click="batchRemove">
            删除{{ selected.length ? `(${selected.length})` : '' }}
          </el-button>
        </div>
        <div class="tools-right">
          <el-input v-model="query.keyword" placeholder="订单编号/款号/PO/中间商/买家" clearable style="width:280px"
            @keyup.enter="search" @clear="search">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button type="primary" @click="search">搜索</el-button>
          <el-button @click="reset">清空</el-button>
          <el-button text @click="showAdvanced = !showAdvanced">高级筛选 <el-icon><ArrowDown /></el-icon></el-button>
        </div>
      </div>
      <el-collapse-transition>
        <div v-show="showAdvanced" class="advanced">
          <el-form inline>
            <el-form-item label="状态">
              <el-select v-model="query.status" clearable placeholder="全部" style="width:140px" @change="search">
                <el-option v-for="s in statuses" :key="s.value" :label="s.label" :value="s.value" />
              </el-select>
            </el-form-item>
          </el-form>
        </div>
      </el-collapse-transition>
    </div>

    <div class="table-card">
      <!-- 双击进编辑要先看权限与状态（B026）：船务/版师/打样默认带 orders 菜单，双击草稿行进了编辑表单，
           填完点保存被后端 403，工作白做 -->
      <el-table ref="colTableRef" :data="list" v-loading="loading" border stripe @header-dragend="onHeaderDragend" :row-class-name="rowClass" @selection-change="(v: any[]) => selected = v" @row-dblclick="onRowDblclick">
        <el-table-column type="selection" width="42" />
        <!-- 列头排序只在「本页即全部」时开放（B160）：后端按 id 倒序分页且不收排序参数，
             跨页时本地排序只是把当前 20 条颠倒一下，第 1 页仍然不是全库最大的那几条 -->
        <el-table-column prop="order_no" label="订单编号" width="150" :sortable="sortableLocal" />
        <el-table-column prop="style_no" label="客户款号" min-width="120"><template #default="{ row }">{{ row.style_no || row.style_name || '-' }}</template></el-table-column>
        <el-table-column prop="customer_po" label="客户PO" min-width="130"><template #default="{ row }">{{ row.customer_po || '-' }}</template></el-table-column>
        <el-table-column label="中间商/买家" min-width="150"><template #default="{ row }">{{ [row.middleman_name, row.buyer_name].filter(Boolean).join(' / ') || '-' }}</template></el-table-column>
        <el-table-column label="大货总数" width="90" align="right"><template #default="{ row }">{{ row.qty_total ?? 0 }}</template></el-table-column>
        <!-- 别写回 `currency === 'RMB' ? '¥' : '$'`：币种字典发的是 **CNY**，'RMB' 永远不命中，
             人民币订单会一律显示成 $（2026-08-04 反馈 #13 的同类回归）。统一走 currencySymbol()。 -->
        <el-table-column label="单品单价" width="100" align="right"><template #default="{ row }">{{ row.unit_price != null ? `${currencySymbol(row.currency)}${row.unit_price}` : '-' }}</template></el-table-column>
        <el-table-column prop="delivery_date" label="约定交期" width="110"><template #default="{ row }">{{ row.delivery_date || '-' }}</template></el-table-column>
        <el-table-column label="总金额" width="120" align="right">
          <template #default="{ row }">
            <span v-if="row.total_amount != null">{{ row.currency || '' }} {{ (+row.total_amount).toFixed(2) }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="130" fixed="right">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
            <el-tag v-if="row.approval_status === 'PENDING'" type="warning" size="small" style="margin-left:4px">待审批</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="salesperson" label="业务员" width="90"><template #default="{ row }">{{ row.salesperson || '-' }}</template></el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <!-- 日常操作统一主色，色彩只留给语义：审批=成功绿。排布交给 .table-ops -->
          <template #default="{ row }">
            <div class="table-ops">
              <!-- B026：没编辑权限的账号不显示「编辑」（点进去也只会被后端 403），留「查看」 -->
              <el-button v-if="row.status === 'DRAFT' && canEdit" link type="primary" size="small" @click="goEdit(row)">编辑</el-button>
              <el-button v-if="row.status === 'CONFIRMED' && canEdit" link type="warning" size="small" :disabled="acting !== null" @click="doRevert(row)">撤回</el-button>
              <el-button link type="primary" size="small" @click="goView(row)">查看</el-button>
              <el-button v-if="row.approval_status === 'PENDING' && canReview" link type="success" size="small" :disabled="acting !== null" @click="doApprove(row)">审批</el-button>
              <el-dropdown trigger="click" @command="(cmd: string) => onPrint(cmd, row)">
                <el-button link type="primary" size="small">打印<el-icon><ArrowDown /></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="customer">对客确认单（无成本）</el-dropdown-item>
                    <el-dropdown-item command="factory">生产通知单（无客户/价格）</el-dropdown-item>
                    <el-dropdown-item command="internal">内部单据（全量）</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <!-- 用 :disabled 而非 :loading：操作列是固定列宽 + flex-wrap（见 theme.css 的排布注释），
                   行内按钮中途插入 spinner 会让整行按钮在请求期间重排跳动 -->
              <el-button v-if="canEdit" link type="primary" size="small" :disabled="copying !== null" @click="doCopy(row)">复制</el-button>
              <el-dropdown
                v-if="canEdit && ['CONFIRMED', 'CONTRACTED', 'PRODUCING'].includes(row.status)"
                trigger="click" @command="(cmd: string) => onGenContract(cmd, row)"
              >
                <el-button link type="primary" size="small">生成合同<el-icon><ArrowDown /></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="material">材料合同（为未下单的材料，按供应商拆单）</el-dropdown-item>
                    <el-dropdown-item command="process">加工合同（带入订单明细）</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
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

    <!-- 在产订单迁移导入(P3#43/ORD D10):CSV/Excel 粘贴行,外部单号留档 -->
    <el-dialog v-model="importDialog" title="在产订单迁移导入" width="640px">
      <div class="hint" style="margin-bottom:8px">
        每行一条,列序(Tab/逗号分隔):<b>外部单号,客户名称,客户PO,款号,品名,数量,币种,单价,交期(YYYY-MM-DD),状态(CONFIRMED/CONTRACTED/PRODUCING/DONE,缺省PRODUCING)</b>。客户须先在基础资料建档(按名精确匹配)。
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
import { useListState, useColumnWidths } from '@/utils/listState';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Download, Delete, ArrowDown, Upload } from '@element-plus/icons-vue';
import { parseTableText, rowsPositional } from '@/utils/parseTable';
import { orderApi } from '@/api/order';
import { contractApi } from '@/api/contract';
import { printOrder } from '@/utils/orderPrint';
import { exportAll } from '@/utils/exportAll';
import { useAuthStore } from '@/stores/auth';
import { UserRole, ORDER_STATUS_LABEL } from '@i9/types';
import { currencySymbol } from '@/utils/currency';

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
// 返回列表时筛选条件、页码、调过的列宽保持原样（#139/#140，见 utils/listState.ts）
useListState('orders', { query, showAdvanced });
const { tableRef: colTableRef, onHeaderDragend } = useColumnWidths('orders');

async function load() {
  loading.value = true;
  try {
    const res: any = await orderApi.list(query);
    list.value = res.data ?? [];
    total.value = res.data?.total ?? res.total ?? 0;
  } finally { loading.value = false; }
}
// 改了搜索条件要回第 1 页（B107 同类）：翻到第 3 页再搜，结果不足 3 页就是一张空表
function search() { query.page = 1; load(); }
function reset() { query.keyword = ''; query.status = undefined; query.page = 1; load(); }
// 列头排序只在「本页即全部」时开放（B160，理由见模板注释）
const sortableLocal = computed(() => (total.value <= list.value.length ? true : false));
function goCreate() { router.push({ name: 'OrderCreate' }); }
function goEdit(row: any) { router.push({ name: 'OrderEdit', params: { id: row.id } }); }
// 双击行：有权限且是草稿才进编辑，否则进查看（B026）
function onRowDblclick(row: any) {
  if (canEdit.value && row.status === 'DRAFT') goEdit(row);
  else goView(row);
}
// 行内状态动作的进行中标志（B110 同类）：同一时刻只跑一个
const acting = ref<string | null>(null);
async function runAction(key: string, fn: () => Promise<void>) {
  if (acting.value) return;
  acting.value = key;
  try { await fn(); } finally { acting.value = null; }
}

// 在产订单迁移导入(P3#43)
const importDialog = ref(false);
const importText = ref('');
const importing = ref(false);
const importResult = ref<any>(null);
async function doImport() {
  // 解析走 parseTableText：Tab/逗号自适应+引号安全（旧 split(/\t|,/) 遇名称含逗号即错列）；
  // 首行像表头自动跳过
  const rows = rowsPositional(parseTableText(importText.value), (c) => ({
    external_no: c[0], customer_name: c[1], customer_po: c[2], style_no: c[3], style_name: c[4],
    qty_total: c[5], currency: c[6], unit_price: c[7], delivery_date: c[8], status: c[9],
  }), /单号|客户|款号|PO|金额|单价/);
  importing.value = true;
  try {
    const res: any = await orderApi.importBatch(rows);
    importResult.value = res?.data ?? res;
    if (importResult.value?.ok) load();
  } finally { importing.value = false; }
}

// 三套脱敏打印(P3#32/ORD E2)。弹窗被浏览器拦截时 printOrder 会抛错,须 catch 提示用户允许弹窗(同报价/样衣侧)
async function onPrint(mode: string, row: any) {
  try { const res: any = await orderApi.get(row.id); printOrder(res.data ?? res, mode as any); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? e?.message ?? '打印失败'); }
}

// 订单复制(P3#34)
// 防连点：后端 copy 无幂等，此前既无 in-flight 守卫也无确认框——点一下立刻建一张，
// 连点几次就真出几张连号草稿（8-04 样衣列表 8 条同款即同型问题）。
// 守卫必须早退在确认框之前，覆盖「确认框开着时又点一次」的窗口。
const copying = ref<number | null>(null);
async function doCopy(row: any) {
  if (copying.value !== null) return;
  // 置位必须在弹确认框【之前】：只把「检查」放在 await 前是不够的——两次快速点击会同时
  // 穿过检查（那时还是 null）、各自弹框、各自通过，最后发出两次请求真建两张草稿。
  // （单测 OrderListView.spec「连点两次只发一次」正是守着这个边界。）
  copying.value = row.id;
  // 两选确认（不照抄报价的三选：orderApi.copy 只收 id，没有 withItems 可传）
  try {
    await ElMessageBox.confirm(
      `复制订单 ${row.order_no ?? ''} 为新草稿？将一并复制用料核算与尺码矩阵。`, '复制订单', { type: 'info' },
    );
  } catch { copying.value = null; return; }   // 用户取消要复位，否则按钮永久禁用
  try {
    const res: any = await orderApi.copy(row.id);
    const d = res?.data ?? res;
    ElMessage.success(`已复制为新草稿 ${d.order_no ?? ''}`);
    load();
  } catch (e: any) { errToast(e?.response?.data?.msg ?? '复制失败'); }
  finally { copying.value = null; }
}

// 生成合同入口（设计稿 合同 A1 主流程:订单侧拆单,而非只能从合同侧反向带入）
async function onGenContract(cmd: string, row: any) {
  if (cmd === 'process') {
    router.push({ path: '/contracts/new', query: { type: 'PROCESS', order_id: row.id } });
    return;
  }
  // #128 分批下：列表入口 = 为还没下过合同的材料行生成（已下过的后端跳过并报回）；要挑行下请进订单页勾选
  try {
    await ElMessageBox.confirm(
      '将为订单里还没生成过合同的材料行按供应商分组，每个供应商各生成一张材料合同草稿（已下单的行不再重复；分色/分码材料按尺码矩阵拆行）。要挑几行先下，请进订单页勾选后生成。',
      '生成材料合同', { type: 'info', confirmButtonText: '生成', cancelButtonText: '取消' },
    );
  } catch { return; }
  try {
    const res: any = await contractApi.generateFromOrder(row.id);
    const d = res?.data ?? res;
    const unmatched: string[] = d?.unmatched ?? [];
    const skipped: Array<{ item_name: string }> = d?.skipped ?? [];
    if (d?.created) ElMessage.success(`已生成 ${d.created} 张材料合同草稿${skipped.length ? `，跳过已下单的 ${skipped.length} 行` : ''}`);
    const notes: string[] = [];
    if (skipped.length) notes.push(`已生成过合同、本次跳过：${skipped.map((x) => x.item_name).join('、')}`);
    if (unmatched.length) notes.push(`以下供应商未在工厂库中登记，对应材料先挂在「待定供应商」占位合同上：${unmatched.join('、')}。请在基础资料·工厂库补录后到合同草稿里改绑。`);
    if (notes.length) ElMessageBox.alert(notes.join('；'), '生成结果', { type: 'warning' });
    else if (!d?.created) ElMessage.warning('没有可生成的材料行');
    if (d?.created) router.push({ path: '/contracts', query: { order_id: row.id } });
  } catch (e: any) {
    errToast(e?.response?.data?.msg ?? e?.response?.data?.msg ?? '生成失败');
  }
}
function goView(row: any) { router.push({ name: 'OrderView', params: { id: row.id } }); }
async function doApprove(row: any) {
  await runAction(`approve:${row.id}`, async () => {
    try { await orderApi.approve(row.id); ElMessage.success('已审批，订单可下单'); load(); }
    catch (e: any) { errToast(e?.response?.data?.msg ?? '审批失败'); }
  });
}
// 撤回下单（已下单→草稿，可再编辑；已生成合同起后端会拦截）
async function doRevert(row: any) {
  if (acting.value) return;
  try {
    await ElMessageBox.confirm(`确认撤回订单「${row.order_no}」？撤回后回到草稿可修改，重新下单需重走审批校验。`, '撤回下单', { type: 'warning' });
  } catch { return; }
  await runAction(`revert:${row.id}`, async () => {
    try { await orderApi.revert(row.id); ElMessage.success('已撤回为草稿'); load(); }
    catch (e: any) { errToast(e?.response?.data?.msg ?? '撤回失败'); }
  });
}
/**
 * 批量删除。
 * 【被拦下的要说清为什么】后端不止拦「非草稿」，还会拦「名下还有未删除合同的草稿单」——
 * 原来 `catch { fail++ }` 把 msg 吞了，用户只看到「拦截 N 条」，完全不知道该去处理什么（同样式见样衣列表）。
 */
async function batchRemove() {
  try { await ElMessageBox.confirm(`确认删除选中的 ${selected.value.length} 条记录?此操作不可恢复。`, "批量删除", { type: "warning" }); } catch { return; }
  let ok = 0;
  const reasons: string[] = [];
  for (const row of selected.value) {
    try { await orderApi.remove(row.id); ok++; }
    catch (e: any) { reasons.push(`${row.order_no ?? row.id}：${e?.response?.data?.msg ?? '未知原因'}`); }
  }
  if (!reasons.length) ElMessage.success(`删除完成：成功 ${ok} 条`);
  else {
    ElMessageBox.alert(reasons.join('<br>'), `删除完成：成功 ${ok} 条，拦截 ${reasons.length} 条`,
      { dangerouslyUseHTMLString: true, confirmButtonText: '知道了' });
  }
  load();
}
// 导出：当前筛选下全量、逐页拉取（B152）。原来只导当前一页 20 行，文件却叫「订单.csv」
const exporting = ref(false);
const EXPORT_COLS = [
  { key: 'order_no', title: '订单编号' }, { key: 'style_no', title: '客户款号' }, { key: 'customer_po', title: '客户PO' },
  { key: 'middleman_name', title: '中间商' }, { key: 'buyer_name', title: '最终买家' }, { key: 'qty_total', title: '大货总数' },
  { key: 'unit_price', title: '单品单价' }, { key: 'currency', title: '币种' }, { key: 'delivery_date', title: '约定交期' },
  { key: 'status', title: '状态', format: (r: any) => statusLabel(r.status) },
];
async function exportCsv() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const n = await exportAll((p, sz) => orderApi.list({ ...query, page: p, size: sz }) as any, EXPORT_COLS, '订单');
    ElMessage.success(`已导出全部 ${n} 条`);
  } catch (e: any) { errToast(e?.response?.data?.msg ?? e?.message ?? '导出失败'); }
  finally { exporting.value = false; }
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
:deep(.done-row) { background: #F0F7F4 !important; }
</style>
