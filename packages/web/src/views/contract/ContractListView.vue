<template>
  <div class="list-page">
    <div class="toolbar-card">
      <div class="toolbar">
        <div class="tools-left">
          <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreate">新建合同</el-button>
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
        <el-table-column label="合同金额" width="130" align="right"><template #default="{ row }">{{ row.currency }} {{ (+row.total_amount).toFixed(2) }}</template></el-table-column>
        <el-table-column label="定金/中期/尾款" width="150" align="center"><template #default="{ row }">{{ row.deposit_ratio }}/{{ row.mid_ratio }}/{{ row.final_ratio }}%</template></el-table-column>
        <el-table-column prop="account_period_days" label="账期(天)" width="90" align="right" />
        <el-table-column label="门户状态" width="110"><template #default="{ row }"><el-tag :type="portalTagType(row.portal_status)" size="small">{{ portalLabel(row.portal_status) }}</el-tag></template></el-table-column>
        <el-table-column prop="stamped_at" label="盖章时间" width="160"><template #default="{ row }">{{ row.stamped_at || '—' }}</template></el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row)">详情</el-button>
            <el-button v-if="row.portal_status === 'DRAFT' && canEdit" link type="warning" size="small" @click="doPush(row)">推送门户</el-button>
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

    <!-- 新建合同 -->
    <el-dialog v-model="createVisible" title="新建合同" width="760px" @closed="resetCreateForm">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="96px">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="合同类型" prop="type"><el-select v-model="createForm.type" style="width:100%"><el-option label="面料合同" value="MATERIAL" /><el-option label="加工合同" value="PROCESS" /><el-option label="补料合同" value="SUPPLEMENT" /></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="供应商工厂" prop="factory_id"><el-select v-model="createForm.factory_id" filterable placeholder="选择工厂" style="width:100%"><el-option v-for="f in factories" :key="f.id" :label="`${f.factory_no} · ${f.name}`" :value="f.id" /></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="关联订单" prop="order_id"><el-select v-model="createForm.order_id" filterable placeholder="选择订单" style="width:100%"><el-option v-for="o in orders" :key="o.id" :label="`${o.order_no} · ${o.style_no || ''}`" :value="o.id" /></el-select></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="币种"><el-select v-model="createForm.currency" style="width:100%"><el-option label="CNY" value="CNY" /><el-option label="USD" value="USD" /></el-select></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="定金%"><el-input-number v-model="createForm.deposit_ratio" :min="0" :max="100" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="中期%"><el-input-number v-model="createForm.mid_ratio" :min="0" :max="100" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="尾款%"><el-input-number v-model="createForm.final_ratio" :min="0" :max="100" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="最后发货日"><el-date-picker v-model="createForm.last_ship_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="账期(天)"><el-input-number v-model="createForm.account_period_days" :min="0" style="width:100%" /></el-form-item></el-col>
        </el-row>
        <div class="ratio-hint" :class="{ bad: ratioSum !== 100 }">定金+中期+尾款 = {{ ratioSum }}%（须=100%）</div>
        <el-form-item label="备注"><el-input v-model="createForm.remark" type="textarea" :rows="2" /></el-form-item>

        <el-divider>材料明细<span class="muted">（材料合同可留空，自动从订单用料核算带出）</span></el-divider>
        <div v-for="(m, idx) in createForm.materials" :key="idx" class="item-row">
          <el-row :gutter="8" align="middle">
            <el-col :span="6"><el-input v-model="m.item_name" placeholder="材料名称" /></el-col>
            <el-col :span="4"><el-input v-model="m.spec" placeholder="规格" /></el-col>
            <el-col :span="3"><el-input v-model="m.unit" placeholder="单位" /></el-col>
            <el-col :span="4"><el-input-number v-model="m.unit_price" :min="0" :precision="4" placeholder="单价" style="width:100%" /></el-col>
            <el-col :span="4"><el-input-number v-model="m.qty" :min="0" :precision="4" placeholder="数量" style="width:100%" /></el-col>
            <el-col :span="3"><el-button link type="danger" @click="removeMaterial(idx)">删除</el-button></el-col>
          </el-row>
        </div>
        <el-button style="width:100%;margin-top:8px" @click="addMaterial">+ 添加材料行</el-button>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreate">保存</el-button>
      </template>
    </el-dialog>

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
        </el-descriptions>

        <h4 class="sec">材料明细</h4>
        <el-table :data="detail.materials || []" size="small" border>
          <el-table-column type="index" label="#" width="44" />
          <el-table-column prop="item_name" label="材料名称" min-width="120" />
          <el-table-column prop="spec" label="规格" width="100" />
          <el-table-column prop="unit" label="单位" width="60" />
          <el-table-column prop="unit_price" label="单价" width="90" align="right" />
          <el-table-column prop="qty" label="数量" width="90" align="right" />
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
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Plus, Download } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { contractApi } from '@/api/contract';
import { factoryApi } from '@/api/factory';
import { orderApi } from '@/api/order';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.BUSINESS));
const portalStatuses = [{ v: 'DRAFT', l: '草稿' }, { v: 'PUSHED', l: '已推送' }, { v: 'STAMPED', l: '已盖章' }, { v: 'SHIPPING', l: '出货中' }, { v: 'RECONCILED', l: '已对账' }];
const typeLabel = (t: string) => ({ MATERIAL: '面料合同', PROCESS: '加工合同', SUPPLEMENT: '补料合同' } as any)[t] ?? t;
const portalLabel = (s: string) => ({ DRAFT: '草稿', PUSHED: '已推送', STAMPED: '已盖章', SHIPPING: '出货中', RECONCILED: '已对账' } as any)[s] ?? s;
const portalTagType = (s: string): any => ({ DRAFT: 'info', PUSHED: 'warning', STAMPED: 'primary', SHIPPING: 'success', RECONCILED: 'success' } as any)[s] ?? 'info';
const actionLabel = (a: string) => ({ PUSH: '推送门户', STAMP: '供应商盖章', SHIP: '发货', INVOICE: '上传发票', RECONCILE: '对账' } as any)[a] ?? a;
// 门户流水备注：抽取 附件:<url> 作可点击链接，剩余文本正常展示
const remarkAttachment = (remark?: string): string => {
  const m = remark?.match(/附件:(\S+)/);
  return m ? m[1] : '';
};
const remarkText = (remark?: string): string => (remark ? remark.replace(/\s*·?\s*附件:\S+/, '').trim() : '');

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const factories = ref<any[]>([]);
const orders = ref<any[]>([]);
const query = reactive({ page: 1, size: 20, keyword: '', type: undefined as string | undefined, portal_status: undefined as string | undefined });

async function load() {
  loading.value = true;
  try {
    const res: any = await contractApi.list(query);
    list.value = res.data?.items ?? res.items ?? [];
    total.value = res.data?.total ?? res.total ?? 0;
  } finally { loading.value = false; }
}
function reset() { query.keyword = ''; query.type = undefined; query.portal_status = undefined; query.page = 1; load(); }
async function loadRefs() {
  const [fs, os] = await Promise.all([factoryApi.select(), orderApi.list({ page: 1, size: 200 })]);
  factories.value = (((fs as any).data ?? fs) as any[]) ?? [];
  orders.value = (os as any).data?.items ?? (os as any).items ?? [];
}
onMounted(() => { load(); loadRefs(); });

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
async function doPush(row: any) {
  try { await contractApi.push(row.id); ElMessage.success('已推送至供应商门户'); load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '推送失败'); }
}
async function remove(id: number) {
  try { await contractApi.remove(id); ElMessage.success('删除成功'); load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '删除失败'); }
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

// create
const createVisible = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive<any>({
  type: 'MATERIAL', factory_id: undefined, order_id: undefined, currency: 'CNY',
  deposit_ratio: 30, mid_ratio: 40, final_ratio: 30, last_ship_date: '', account_period_days: 45, remark: '', materials: [],
});
const ratioSum = computed(() => (+createForm.deposit_ratio || 0) + (+createForm.mid_ratio || 0) + (+createForm.final_ratio || 0));
const createRules: FormRules = {
  type: [{ required: true, message: '请选择合同类型', trigger: 'change' }],
  factory_id: [{ required: true, message: '请选择工厂', trigger: 'change' }],
  order_id: [{ required: true, message: '请选择订单', trigger: 'change' }],
};
function openCreate() { createVisible.value = true; }
function resetCreateForm() {
  Object.assign(createForm, { type: 'MATERIAL', factory_id: undefined, order_id: undefined, currency: 'CNY', deposit_ratio: 30, mid_ratio: 40, final_ratio: 30, last_ship_date: '', account_period_days: 45, remark: '', materials: [] });
}
function addMaterial() { createForm.materials.push({ item_name: '', spec: '', unit: '', unit_price: undefined, qty: undefined }); }
function removeMaterial(idx: number) { createForm.materials.splice(idx, 1); }
async function doCreate() {
  await createFormRef.value?.validate();
  if (ratioSum.value !== 100) { ElMessage.warning('定金+中期+尾款须等于100%'); return; }
  saving.value = true;
  try {
    const dto = { ...createForm };
    if (!dto.materials.length) delete dto.materials; // 材料合同触发自动带出
    if (!dto.last_ship_date) delete dto.last_ship_date;
    await contractApi.create(dto);
    ElMessage.success('创建成功');
    createVisible.value = false;
    load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '创建失败');
  } finally { saving.value = false; }
}
</script>

<style scoped>
.list-page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.toolbar-card, .table-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 6px; padding: 12px 14px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.tools-left, .tools-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
.sel-info { font-size: 13px; color: var(--el-text-color-secondary); }
.tip { margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary); }
.item-row { margin-bottom: 8px; }
.ratio-hint { font-size: 12px; color: #3E8E7E; margin: 4px 0 10px; }
.ratio-hint.bad { color: #C04042; font-weight: 600; }
.muted { font-size: 12px; color: var(--el-text-color-secondary); font-weight: 400; }
.sec { margin: 16px 0 8px; color: #1E3A5F; }
.log-remark { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
</style>
