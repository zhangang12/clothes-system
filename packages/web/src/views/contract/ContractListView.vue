<template>
  <div class="list-page">
    <RuleHint>合同金额超阈值需主管审批后才可推送;<b>首次推送自动开通供应商门户账号</b>(初始密码 Factory@123,请提醒供应商改密);未匹配供应商的材料会生成「待定供应商」占位合同,确定后改绑。</RuleHint>
    <div class="toolbar-card">
      <div class="toolbar">
        <div class="tools-left">
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="$router.push('/contracts/new?type=MATERIAL')">新建材料合同</el-button>
          <el-button v-if="canEdit" type="primary" plain :icon="Plus" @click="$router.push('/contracts/new?type=PROCESS')">新建加工合同</el-button>
          <el-button plain :icon="Download" @click="exportCsv">导出</el-button>
        </div>
        <div class="tools-right">
          <el-input v-model="query.keyword" placeholder="合同编号" clearable style="width:200px" @keyup.enter="load" @clear="load">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-select v-model="query.type" clearable placeholder="全部类型" style="width:130px" @change="load">
            <el-option label="面料合同" value="MATERIAL" /><el-option label="加工合同" value="PROCESS" /><el-option label="补料合同" value="SUPPLEMENT" />
          </el-select>
          <el-select v-model="query.portal_status" clearable placeholder="门户状态" style="width:120px" @change="load">
            <el-option v-for="s in portalStatuses" :key="s.v" :label="s.l" :value="s.v" />
          </el-select>
          <el-button type="primary" @click="load">搜索</el-button>
          <el-button @click="reset">清空</el-button>
        </div>
      </div>
    </div>

    <div class="table-card">
      <el-table :data="list" v-loading="loading" border stripe @row-dblclick="viewDetail">
        <el-table-column prop="contract_no" label="合同编号" width="160" sortable />
        <el-table-column label="类型" width="100"><template #default="{ row }"><el-tag size="small" effect="light">{{ typeLabel(row.type) }}</el-tag></template></el-table-column>
        <el-table-column label="供应商/加工厂" min-width="140"><template #default="{ row }">{{ factoryName(row.factory_id) }}</template></el-table-column>
        <el-table-column label="关联款号" min-width="120"><template #default="{ row }">{{ row.style_nos || '—' }}</template></el-table-column>
        <el-table-column label="合同金额" width="130" align="right"><template #default="{ row }"><span v-if="row.total_amount == null">—</span><span v-else>{{ row.currency }} {{ (+row.total_amount).toFixed(2) }}</span></template></el-table-column>
        <el-table-column label="定金/中期/尾款" width="150" align="center"><template #default="{ row }">{{ row.deposit_ratio }}/{{ row.mid_ratio }}/{{ row.final_ratio }}%</template></el-table-column>
        <el-table-column prop="account_period_days" label="账期(天)" width="90" align="right" />
        <el-table-column label="门户状态" width="150"><template #default="{ row }"><el-tag :type="portalTagType(row.portal_status)" size="small">{{ portalLabel(row.portal_status) }}</el-tag><el-tag v-if="row.approval_status === 'PENDING'" type="warning" size="small" style="margin-left:4px">待审批</el-tag><el-tag v-if="Number(row.revised) === 1 && row.portal_status === 'PUSHED'" type="danger" size="small" style="margin-left:4px">已更新</el-tag></template></el-table-column>
        <el-table-column prop="stamped_at" label="盖章时间" width="160"><template #default="{ row }">{{ row.stamped_at || '—' }}</template></el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="$router.push(`/contracts/${row.id}/edit`)">{{ row.portal_status === 'DRAFT' && canEdit ? '编辑' : '查看' }}</el-button>
            <el-button link type="primary" size="small" @click="viewDetail(row)">详情</el-button>
            <el-button v-if="canEdit" link size="small" @click="$router.push(`/contracts/new?type=${row.type}&copy_from=${row.id}`)">复制</el-button>
            <el-button v-if="canEdit && row.type === 'MATERIAL'" link size="small" @click="$router.push(`/contracts/new?type=SUPPLEMENT&parent_id=${row.id}&copy_from=${row.id}`)">补料</el-button>
            <el-button link size="small" @click="printRow(row)">PDF</el-button>
            <el-button link size="small" @click="exportRow(row)">导出Excel</el-button>
            <el-button v-if="row.approval_status === 'PENDING' && canReview" link type="success" size="small" @click="doApprove(row)">审批</el-button>
            <el-button v-if="row.portal_status === 'DRAFT' && canEdit" link type="warning" size="small" @click="doPush(row)">推送门户</el-button>
            <el-popconfirm v-if="row.portal_status === 'PUSHED' && canEdit" title="撤销后合同回到草稿，可修改后重新推送。确认撤销？" @confirm="doRecall(row)">
              <template #reference><el-button link type="warning" size="small">撤销推送</el-button></template>
            </el-popconfirm>
            <el-popconfirm v-if="row.portal_status === 'DRAFT' && isAdmin" title="确认删除？" @confirm="remove(row.id)">
              <template #reference><el-button link type="danger" size="small">删除</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <div class="footer">
        <span class="sel-info">共 {{ total }} 条</span>
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.size" :total="total" :page-sizes="[10, 20, 50]" layout="sizes, prev, pager, next" @change="load" />
      </div>
      <div class="tip">材料合同不填材料明细时，自动从关联订单的用料核算带出（快照）；供应商盖章后单价锁定。</div>
    </div>

    <!-- 详情 -->
    <el-drawer v-model="detailVisible" :title="`合同详情 ${detail?.contract_no || ''}`" size="640px">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="类型">{{ typeLabel(detail.type) }}</el-descriptions-item>
          <el-descriptions-item label="门户状态"><el-tag :type="portalTagType(detail.portal_status)" size="small">{{ portalLabel(detail.portal_status) }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="合同金额">{{ detail.currency }} {{ (+detail.total_amount).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="账期">{{ detail.account_period_days }} 天</el-descriptions-item>
          <el-descriptions-item label="定金/中期/尾款">{{ detail.deposit_ratio }}/{{ detail.mid_ratio }}/{{ detail.final_ratio }}%</el-descriptions-item>
          <el-descriptions-item label="最后发货日">{{ detail.last_ship_date || '—' }}</el-descriptions-item>
          <el-descriptions-item label="盖章供应商">{{ detail.stamped_by_supplier || '—' }}</el-descriptions-item>
          <el-descriptions-item label="盖章时间">{{ detail.stamped_at || '—' }}</el-descriptions-item>
          <el-descriptions-item label="源订单">
            <el-tag v-if="detail.source_order_changed" type="warning" size="small">源订单已变更，请核对材料明细</el-tag>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="盖章方式">
            <template v-if="detail.stamp_mode === 'PAPER'">
              纸质盖章 <el-link v-if="detail.stamp_paper_url" type="primary" :href="detail.stamp_paper_url" target="_blank" style="margin-left:4px">盖章照片</el-link>
            </template>
            <template v-else-if="detail.stamp_mode === 'ESEAL'">电子章</template>
            <template v-else>—</template>
          </el-descriptions-item>
        </el-descriptions>

        <h4 class="sec">发货核对（合同量 / 累计实发 / 差额 · 到期日）</h4>
        <el-descriptions :column="4" border size="small">
          <el-descriptions-item label="合同量">{{ detail.qtyStats?.contractQty ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="累计实发">{{ detail.qtyStats?.shippedQty ?? 0 }}</el-descriptions-item>
          <el-descriptions-item label="差额">
            <span :class="{ 'text-danger': (detail.qtyStats?.diffQty ?? 0) < 0 }">{{ detail.qtyStats?.diffQty ?? '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="到期日">
            <span :class="{ 'text-danger': isOverdue(detail) }">{{ detail.due_date ? String(detail.due_date).slice(0, 10) : '—' }}</span>
            <el-tag v-if="isOverdue(detail)" type="danger" size="small" style="margin-left:4px">逾期</el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <template v-if="detail.shipments?.length">
          <h4 class="sec">发货批次（逐批锁价 · 审批通过后供应商方可勾选对账）</h4>
          <el-table :data="detail.shipments" size="small" border>
            <el-table-column prop="ship_no" label="发货单号" width="140" />
            <el-table-column prop="qty" label="数量" width="76" align="right" />
            <el-table-column prop="snapshot_unit_price" label="锁定单价" width="90" align="right">
              <template #default="{ row }">{{ row.snapshot_unit_price != null ? (+row.snapshot_unit_price).toFixed(4) : '—' }}</template>
            </el-table-column>
            <el-table-column prop="ship_date" label="发货日" width="104" />
            <el-table-column label="物流" min-width="110">
              <template #default="{ row }">{{ [row.express_company, row.express_no].filter(Boolean).join(' ') || '—' }}</template>
            </el-table-column>
            <el-table-column label="收货地址" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.ship_address || '—' }}</template>
            </el-table-column>
            <el-table-column label="合并组" width="110" show-overflow-tooltip>
              <template #default="{ row }">{{ row.merge_no || '—' }}</template>
            </el-table-column>
            <el-table-column label="物料行" min-width="130" show-overflow-tooltip>
              <template #default="{ row }">{{ (row.items ?? []).map((it: any) => `${it.item_name ?? '行'}×${+it.qty}`).join(' / ') || '—' }}</template>
            </el-table-column>
            <el-table-column label="附件" width="64" align="center">
              <template #default="{ row }">
                <el-link v-if="row.attach_url" type="primary" :href="row.attach_url" target="_blank">查看</el-link>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <el-table-column label="审批" width="86" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.reconcile_id" type="primary" size="small" effect="plain">已对账</el-tag>
                <el-tag v-else-if="row.approval_status === 'APPROVED'" type="success" size="small">已审批</el-tag>
                <el-tag v-else-if="row.approval_status === 'REJECTED'" type="danger" size="small">已驳回</el-tag>
                <el-tag v-else type="warning" size="small">待审批</el-tag>
              </template>
            </el-table-column>
            <el-table-column v-if="canEdit" label="操作" width="110" align="center">
              <template #default="{ row }">
                <template v-if="!row.reconcile_id && row.approval_status !== 'APPROVED'">
                  <el-button link type="success" size="small" @click="doApproveShipment(row, true)">通过</el-button>
                  <el-button v-if="row.approval_status !== 'REJECTED'" link type="danger" size="small" @click="doApproveShipment(row, false)">驳回</el-button>
                </template>
                <span v-else>—</span>
              </template>
            </el-table-column>
          </el-table>
        </template>

        <h4 class="sec">材料明细</h4>
        <el-table :data="detail.materials || []" size="small" border>
          <el-table-column type="index" label="#" width="44" />
          <el-table-column prop="item_name" label="材料名称" min-width="120" />
          <el-table-column prop="spec" label="规格" width="100" />
          <el-table-column prop="unit" label="单位" width="60" />
          <el-table-column prop="unit_price" label="单价" width="90" align="right" />
          <el-table-column prop="qty" label="数量" width="90" align="right" />
          <el-table-column prop="qty_source" label="数量来源" width="110">
            <template #default="{ row }">
              <el-tag v-if="row.qty_source" size="small" :type="row.qty_source === '大货数' ? 'warning' : 'info'">{{ row.qty_source }}</el-tag>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column prop="amount" label="金额" width="100" align="right" />
        </el-table>

        <h4 class="sec">门户流水 <el-tag v-if="detail.snapshot_json" size="small" type="success">已快照锁定</el-tag></h4>
        <el-timeline v-if="logs.length">
          <el-timeline-item v-for="l in logs" :key="l.id" :timestamp="l.created_at" size="small">
            {{ actionLabel(l.action) }} · {{ l.operator }}（{{ l.operator_type === 'SUPPLIER' ? '供应商' : '内部' }}）
            <div v-if="l.remark" class="log-remark">
              <span v-if="remarkText(l.remark)">{{ remarkText(l.remark) }}</span>
              <el-link
                v-if="remarkAttachment(l.remark)"
                type="primary"
                :href="remarkAttachment(l.remark)"
                target="_blank"
                :underline="false"
                style="margin-left: 6px;"
              >📎 查看发票附件</el-link>
            </div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="暂无门户流水" :image-size="60" />
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { errToast } from '@/api';
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search, Plus, Download } from '@element-plus/icons-vue';
import { contractApi } from '@/api/contract';
import { factoryApi } from '@/api/factory';
import { printContract } from '@/utils/contractPrint';
import { exportContractExcel } from '@/utils/contractExcel';
import { companyApi } from '@/api/company';
import { orderApi } from '@/api/order';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const route = useRoute();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));
const canReview = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.SUPERVISOR));

// 到期日逾期判断（今日>到期日 且未结束对账，对账付款串流程 D15）
function isOverdue(row: any): boolean {
  if (!row?.due_date) return false;
  const due = new Date(String(row.due_date).slice(0, 10));
  return !isNaN(due.getTime()) && due < new Date() && row.portal_status !== 'RECONCILED';
}
const portalStatuses = [{ v: 'DRAFT', l: '草稿' }, { v: 'PUSHED', l: '已推送' }, { v: 'STAMPED', l: '已盖章' }, { v: 'SHIPPING', l: '出货中' }, { v: 'RECONCILED', l: '已对账' }, { v: 'COMPLETED', l: '已完成' }];
const typeLabel = (t: string) => ({ MATERIAL: '面料合同', PROCESS: '加工合同', SUPPLEMENT: '补料合同' } as any)[t] ?? t;
const portalLabel = (s: string) => ({ DRAFT: '草稿', PUSHED: '已推送', STAMPED: '已盖章', SHIPPING: '出货中', RECONCILED: '已对账', COMPLETED: '已完成' } as any)[s] ?? s;
const portalTagType = (s: string): any => ({ DRAFT: 'info', PUSHED: 'warning', STAMPED: 'primary', SHIPPING: 'success', RECONCILED: 'success', COMPLETED: 'success' } as any)[s] ?? 'info';
const actionLabel = (a: string) => ({ PUSH: '推送门户', RECALL: '撤销推送', STAMP: '供应商盖章', SHIP: '发货', SHIP_DONE: '发货完成', WITHDRAW_SHIP: '撤回发货批次', INVOICE: '上传发票', RECONCILE: '对账' } as any)[a] ?? a;
// 门户流水备注：抽取 附件:<url> 作可点击链接，剩余文本正常展示
const remarkAttachment = (remark?: string): string => {
  const m = remark?.match(/附件:(\S+)/);
  return m ? m[1] : '';
};
const remarkText = (remark?: string): string => (remark ? remark.replace(/\s*·?\s*附件:\S+/, '').trim() : '');

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const factories = ref<any[]>([]);
const orders = ref<any[]>([]);
const query = reactive({ page: 1, size: 20, keyword: '', type: undefined as string | undefined, portal_status: undefined as string | undefined });

async function load() {
  loading.value = true;
  try {
    const res: any = await contractApi.list(query);
    list.value = res.data ?? [];
    total.value = res.data?.total ?? res.total ?? 0;
  } finally { loading.value = false; }
}
function reset() { query.keyword = ''; query.type = undefined; query.portal_status = undefined; query.page = 1; load(); }
async function loadRefs() {
  const [fs, os] = await Promise.all([factoryApi.select(), orderApi.list({ page: 1, size: 100 })]);
  factories.value = (((fs as any).data ?? fs) as any[]) ?? [];
  orders.value = (os as any).data ?? [];
}
onMounted(() => {
  load();
  loadRefs();
  // query.open=合同ID 自动开详情弹框。站内已无处产生该链接（对账「来源合同」改跳
  // ContractEdit 的 :id 路由，见 ReconciliationListView.goContract），仅留作旧链接兼容。
  if (route.query.open) viewDetail({ id: Number(route.query.open) });
});

// detail
const detailVisible = ref(false);
const detail = ref<any>(null);
const logs = ref<any[]>([]);
async function viewDetail(row: any) {
  const [d, l]: any = await Promise.all([contractApi.get(row.id), contractApi.getLogs(row.id)]);
  detail.value = d.data ?? d;
  logs.value = (l.data ?? l) ?? [];
  detailVisible.value = true;
}
async function doApprove(row: any) {
  try { await contractApi.approve(row.id); ElMessage.success('已审批，合同可推送'); load(); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '审批失败'); }
}
// 发货批次审批（门户 B2：通过后供应商方可勾选该批次对账）
async function doApproveShipment(row: any, approve: boolean) {
  try {
    await contractApi.approveShipment(detail.value.id, row.id, approve);
    ElMessage.success(approve ? '批次已审批通过，供应商可对账' : '批次已驳回');
    await viewDetail({ id: detail.value.id });
  } catch (e: any) { errToast(e?.response?.data?.msg ?? '操作失败'); }
}
let cachedCompany: any = null;
async function printRow(row: any) {
  try {
    if (!factories.value.length) await loadRefs();
    const res: any = await contractApi.get(row.id);
    const detail = res.data ?? res;
    const factory = factories.value.find((f: any) => f.id === detail.factory_id);
    if (cachedCompany === null) {
      try { cachedCompany = (await companyApi.getDefault() as any)?.data ?? null; } catch { cachedCompany = undefined; }
    }
    printContract(detail, factory, cachedCompany || undefined);
  } catch (e: any) { errToast(e?.message ?? e?.response?.data?.msg ?? '打印失败'); }
}
// 导出 Excel(取详情含材料明细/发货批次;.xls)
async function exportRow(row: any) {
  try {
    const res: any = await contractApi.get(row.id);
    const detail = res.data ?? res;
    // 详情接口只回 factory_id 不回名字，不补的话导出件里是「工厂#12」
    exportContractExcel({ ...detail, factory_name: factoryName(detail.factory_id) });
  } catch (e: any) { errToast(e?.response?.data?.msg ?? e?.message ?? '导出失败'); }
}
async function doPush(row: any) {
  try { await contractApi.push(row.id); ElMessage.success('已推送至供应商门户'); load(); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '推送失败'); }
}
async function doRecall(row: any) {
  try { await contractApi.recall(row.id); ElMessage.success('已撤销推送，合同回到草稿，可修改后重新推送'); load(); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '撤销失败'); }
}
async function remove(id: number) {
  try { await contractApi.remove(id); ElMessage.success('删除成功'); load(); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '删除失败'); }
}
function exportCsv() {
  const cols = ['contract_no', 'type', 'total_amount', 'currency', 'account_period_days', 'portal_status'];
  const head = ['合同编号', '类型', '金额', '币种', '账期', '门户状态'];
  const rows = list.value.map((r) => cols.map((c) => `"${r[c] ?? ''}"`).join(','));
  const csv = '﻿' + [head.join(','), ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = '合同.csv'; a.click();
  URL.revokeObjectURL(url);
}

// 供应商/加工厂列显示（factories 引用已在 loadRefs 装载）
function factoryName(id: number): string {
  return factories.value.find((f: any) => f.id === id)?.name ?? (id ? `工厂#${id}` : '—');
}
</script>

<style scoped>
.list-page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.toolbar-card, .table-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 6px; padding: 12px 14px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.tools-left, .tools-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
.sel-info { font-size: 14px; color: var(--el-text-color-secondary); }
.tip { margin-top: 8px; font-size: 13px; color: var(--el-text-color-secondary); }
.item-row { margin-bottom: 8px; }
.ratio-hint { font-size: 13px; color: #3E8E7E; margin: 4px 0 10px; }
.ratio-hint.bad { color: #C04042; font-weight: 600; }
.muted { font-size: 13px; color: var(--el-text-color-secondary); font-weight: 400; }
.sec { margin: 16px 0 8px; color: #1E3A5F; }
.log-remark { margin-top: 4px; font-size: 13px; color: var(--el-text-color-secondary); }
</style>
