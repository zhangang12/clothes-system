<template>
  <div class="page-container">
    <!-- 金额审批阈值配置（管理员，0=不启用） -->
    <el-card v-if="isAdmin">
      <template #header><div class="card-header"><span>金额审批阈值（超阈值需主管审批，0=不启用）</span></div></template>
      <el-form inline>
        <el-form-item label="报价阈值(¥)">
          <el-input-number v-model="thresholds.quote" :min="0" :controls="false" style="width:140px" />
        </el-form-item>
        <el-form-item label="订单阈值">
          <el-input-number v-model="thresholds.order" :min="0" :controls="false" style="width:140px" />
        </el-form-item>
        <el-form-item label="合同阈值">
          <el-input-number v-model="thresholds.contract" :min="0" :controls="false" style="width:140px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="savingThreshold" @click="saveThresholds">保存阈值</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 转化漏斗 -->
    <el-card v-loading="loading.funnel">
      <template #header><div class="card-header"><span>转化漏斗（样衣 → 报价 → 订单成单）</span></div></template>
      <div class="funnel">
        <div class="funnel-step" v-for="(st, i) in funnelSteps" :key="st.label">
          <div class="funnel-bar" :style="{ width: barWidth(st.value), background: st.color }">
            <span class="funnel-num">{{ st.value }}</span>
          </div>
          <div class="funnel-label">{{ st.label }}</div>
          <div v-if="i < funnelSteps.length - 1" class="funnel-rate">↓ {{ st.nextRate }}%</div>
        </div>
      </div>
      <div class="funnel-summary">
        样衣→报价转化 <b>{{ funnel.sampleToQuoteRate ?? 0 }}%</b> ·
        报价→成单转化 <b>{{ funnel.quoteToOrderRate ?? 0 }}%</b> ·
        样衣→订单总转化 <b>{{ funnel.overallRate ?? 0 }}%</b>
      </div>
    </el-card>

    <!-- 成单率 -->
    <el-card v-loading="loading.win">
      <template #header>
        <div class="card-header">
          <span>成单率</span>
          <el-radio-group v-model="winDim" size="small" @change="loadWin">
            <el-radio-button value="salesperson">按业务员</el-radio-button>
            <el-radio-button value="customer">按客户</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <el-table :data="winRows" border stripe size="small">
        <el-table-column prop="name" :label="winDim === 'customer' ? '客户' : '业务员'" />
        <el-table-column prop="total" label="报价数" width="100" align="right" />
        <el-table-column prop="won" label="成单数" width="100" align="right" />
        <el-table-column prop="rate" label="成单率" width="140" align="right">
          <template #default="{ row }">
            <el-progress :percentage="row.rate" :stroke-width="12" :color="rateColor(row.rate)" />
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 利润汇总 -->
    <el-card v-loading="loading.profit">
      <template #header>
        <div class="card-header">
          <span>利润汇总（净利&lt;0 亏损预警）</span>
          <div>
            <el-radio-group v-model="profitDim" size="small" @change="loadProfit">
              <el-radio-button value="style">按款号</el-radio-button>
              <el-radio-button value="month">按月份</el-radio-button>
              <el-radio-button value="customer">按客户</el-radio-button>
            </el-radio-group>
            <el-button size="small" :icon="Download" style="margin-left:8px" :disabled="!profitRows.length" @click="exportProfit">导出CSV</el-button>
          </div>
        </div>
      </template>
      <el-table :data="profitRows" border stripe size="small" :row-class-name="lossRow">
        <el-table-column prop="key" :label="profitDim === 'month' ? '月份' : profitDim === 'customer' ? '客户' : '款号'" />
        <el-table-column prop="count" label="结算单数" width="90" align="right" />
        <el-table-column prop="settleAmount" label="结算金额" width="120" align="right">
          <template #default="{ row }">{{ fmt(row.settleAmount) }}</template>
        </el-table-column>
        <el-table-column prop="grossProfit" label="毛利" width="100" align="right">
          <template #default="{ row }">{{ fmt(row.grossProfit) }}</template>
        </el-table-column>
        <el-table-column prop="grossMargin" label="毛利率" width="85" align="right">
          <template #default="{ row }">{{ row.grossMargin != null ? row.grossMargin + '%' : '—' }}</template>
        </el-table-column>
        <el-table-column prop="netProfit" label="净利(含退税)" width="120" align="right">
          <template #default="{ row }">
            <span :class="{ loss: row.loss }">{{ fmt(row.netProfit) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="netProfitExRefund" label="净利(不含退税)" width="130" align="right">
          <template #default="{ row }">{{ fmt(row.netProfitExRefund) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.loss" type="danger" size="small">亏损</el-tag>
            <el-tag v-else type="success" size="small">盈利</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import { statsApi } from '@/api/stats';
import { configApi } from '@/api/config';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const thresholds = reactive({ quote: 0, order: 0, contract: 0 });
const savingThreshold = ref(false);

const loading = reactive({ funnel: false, win: false, profit: false });
const funnel = ref<any>({});
const winRows = ref<any[]>([]);
const profitRows = ref<any[]>([]);
const winDim = ref<'salesperson' | 'customer'>('salesperson');
const profitDim = ref<'style' | 'month' | 'customer'>('style');

const unwrap = (res: any) => res?.data ?? res;

const funnelSteps = computed(() => [
  { label: '样衣建档', value: funnel.value.samples ?? 0, color: 'var(--indigo, #1E3A5F)', nextRate: funnel.value.sampleToQuoteRate ?? 0 },
  { label: '客户报价', value: funnel.value.quotes ?? 0, color: 'var(--rust, #D17A40)', nextRate: funnel.value.quoteToOrderRate ?? 0 },
  { label: '订单成单', value: funnel.value.orders ?? 0, color: 'var(--weave, #3E8E7E)', nextRate: 0 },
]);
function barWidth(v: number) {
  const max = funnel.value.samples || 1;
  return `${Math.max(6, Math.round((v / max) * 100))}%`;
}
function rateColor(r: number) {
  return r >= 50 ? '#3E8E7E' : r >= 20 ? '#C8901E' : '#C04042';
}
function fmt(n: number) {
  return (n == null ? 0 : +n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function lossRow({ row }: { row: any }) {
  return row.loss ? 'loss-row' : '';
}

async function loadFunnel() {
  loading.funnel = true;
  try { funnel.value = unwrap(await statsApi.funnel()) ?? {}; } finally { loading.funnel = false; }
}
async function loadWin() {
  loading.win = true;
  try { winRows.value = unwrap(await statsApi.winRate(winDim.value)) ?? []; } finally { loading.win = false; }
}
async function loadProfit() {
  loading.profit = true;
  try { profitRows.value = unwrap(await statsApi.profit(profitDim.value)) ?? []; } finally { loading.profit = false; }
}

function exportProfit() {
  const dimLabel = profitDim.value === 'month' ? '月份' : profitDim.value === 'customer' ? '客户' : '款号';
  const header = [dimLabel, '结算单数', '结算金额', '毛利', '毛利率%', '净利(含退税)', '净利(不含退税)', '亏损'];
  const rows = profitRows.value.map((r: any) => [
    r.key, r.count, r.settleAmount, r.grossProfit, r.grossMargin, r.netProfit, r.netProfitExRefund, r.loss ? '亏损' : '',
  ]);
  const csv = [header, ...rows]
    .map((line) => line.map((c: any) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `利润汇总-${dimLabel}.csv`; a.click();
  URL.revokeObjectURL(url);
}

async function loadThresholds() {
  const t = unwrap(await configApi.getThresholds());
  if (t) Object.assign(thresholds, { quote: +t.quote || 0, order: +t.order || 0, contract: +t.contract || 0 });
}
async function saveThresholds() {
  savingThreshold.value = true;
  try {
    await configApi.setThresholds({ quote: thresholds.quote, order: thresholds.order, contract: thresholds.contract });
    ElMessage.success('审批阈值已保存');
  } finally { savingThreshold.value = false; }
}

onMounted(() => {
  loadFunnel(); loadWin(); loadProfit();
  if (isAdmin.value) loadThresholds();
});
</script>

<style scoped>
.page-container { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.funnel { display: flex; flex-direction: column; gap: 14px; padding: 8px 0; }
.funnel-step { position: relative; }
.funnel-bar {
  height: 34px; border-radius: 6px; display: flex; align-items: center;
  padding: 0 12px; color: #fff; transition: width .4s ease; min-width: 60px;
}
.funnel-num { font-weight: 700; font-size: 15px; }
.funnel-label { position: absolute; top: 8px; right: 12px; color: #fff; font-size: 13px; opacity: .9; }
.funnel-rate { font-size: 12px; color: #909399; margin-top: 4px; padding-left: 4px; }
.funnel-summary { margin-top: 10px; font-size: 13px; color: #606266; }
.funnel-summary b { color: var(--indigo, #1E3A5F); }
.loss { color: #C04042; font-weight: 700; }
:deep(.loss-row) { background: #fef0f0; }
</style>
