<template>
  <div class="dashboard">
    <div class="hero">
      <div>
        <div class="hello">你好，{{ auth.realName || '用户' }} 👋</div>
        <div class="sub">I9 服装制造管理系统 · 样衣 → 报价 → 订单 → 合同 → 对账 → 结算 全流程协同</div>
      </div>
      <div class="quick">
        <el-button v-if="canEdit" type="primary" :icon="Plus" @click="go('SampleCreate')">新建样衣</el-button>
        <el-button v-if="canEdit" :icon="Plus" @click="go('QuoteCreate')">新建报价</el-button>
        <el-button v-if="canEdit" :icon="Plus" @click="go('OrderCreate')">新建订单</el-button>
      </div>
    </div>

    <!-- 单据统计 -->
    <div class="section-title">单据统计</div>
    <div class="stat-grid" v-loading="loading">
      <div v-for="s in stats" :key="s.route" class="stat-card" :style="{ '--accent': s.color }" @click="goPath(s.route)">
        <div class="stat-icon"><el-icon :size="22"><component :is="s.icon" /></el-icon></div>
        <div class="stat-body">
          <div class="stat-num">{{ s.count ?? '—' }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
      </div>
    </div>

    <!-- 待处理 -->
    <div class="section-title">待处理事项</div>
    <div class="todo-grid" v-loading="loading">
      <div v-for="t in todos" :key="t.label" class="todo-card" @click="goPath(t.route)">
        <div class="todo-num" :class="{ hot: (t.count ?? 0) > 0 }">{{ t.count ?? 0 }}</div>
        <div class="todo-label">{{ t.label }}</div>
        <el-icon class="todo-arrow"><ArrowRight /></el-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, markRaw } from 'vue';
import { useRouter } from 'vue-router';
import {
  Plus, ArrowRight, Setting, Avatar, Goods, Document, List, Tickets, DataAnalysis, CreditCard, TrendCharts,
} from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';
import { factoryApi } from '@/api/factory';
import { customerApi } from '@/api/customer';
import { sampleApi } from '@/api/sample';
import { quoteApi } from '@/api/quote';
import { orderApi } from '@/api/order';
import { contractApi } from '@/api/contract';
import { reconciliationApi } from '@/api/reconciliation';
import { paymentRequestApi } from '@/api/payment';
import { settlementApi } from '@/api/settlement';

const router = useRouter();
const auth = useAuthStore();
const canEdit = computed(() => auth.hasRole(UserRole.ADMIN) || auth.hasRole(UserRole.BUSINESS));
const loading = ref(true);

const stats = reactive([
  { label: '工厂', route: '/factories', color: '#1E3A5F', icon: markRaw(Setting), count: null as number | null, api: () => factoryApi.list({ page: 1, size: 1 }) },
  { label: '客户', route: '/customers', color: '#3E8E7E', icon: markRaw(Avatar), count: null, api: () => customerApi.list({ page: 1, size: 1 }) },
  { label: '样衣', route: '/samples', color: '#C8901E', icon: markRaw(Goods), count: null, api: () => sampleApi.list({ page: 1, size: 1 }) },
  { label: '报价', route: '/quotes', color: '#D17A40', icon: markRaw(Document), count: null, api: () => quoteApi.list({ page: 1, size: 1 }) },
  { label: '订单', route: '/orders', color: '#1E3A5F', icon: markRaw(List), count: null, api: () => orderApi.list({ page: 1, size: 1 }) },
  { label: '合同', route: '/contracts', color: '#3E8E7E', icon: markRaw(Tickets), count: null, api: () => contractApi.list({ page: 1, size: 1 }) },
  { label: '对账单', route: '/reconciliations', color: '#C8901E', icon: markRaw(DataAnalysis), count: null, api: () => reconciliationApi.list({ page: 1, size: 1 }) },
  { label: '付款单', route: '/payments', color: '#C04042', icon: markRaw(CreditCard), count: null, api: () => paymentRequestApi.list({ page: 1, size: 1 }) },
  { label: '结算单', route: '/settlements', color: '#1E3A5F', icon: markRaw(TrendCharts), count: null, api: () => settlementApi.list({ page: 1, size: 1 }) },
]);

const todos = reactive([
  { label: '草稿报价待发出', route: '/quotes', count: null as number | null, api: () => quoteApi.list({ page: 1, size: 1, status: 'DRAFT' }) },
  { label: '待盖章合同', route: '/contracts', count: null, api: () => contractApi.list({ page: 1, size: 1, portal_status: 'PUSHED' }) },
  { label: '生产中订单', route: '/orders', count: null, api: () => orderApi.list({ page: 1, size: 1, status: 'PRODUCING' }) },
  { label: '待审批付款', route: '/payments', count: null, api: () => paymentRequestApi.list({ page: 1, size: 1, status: 'PENDING' }) },
]);

function go(name: string) { router.push({ name }); }
function goPath(p: string) { router.push(p); }
const totalOf = (r: any) => r?.total ?? r?.data?.total ?? 0;

onMounted(async () => {
  const all = [...stats, ...todos];
  const results = await Promise.allSettled(all.map((s) => s.api()));
  results.forEach((res, i) => { all[i].count = res.status === 'fulfilled' ? totalOf(res.value) : 0; });
  loading.value = false;
});
</script>

<style scoped>
.dashboard { padding: 18px; display: flex; flex-direction: column; gap: 8px; }
.hero { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
  background: linear-gradient(120deg, #1E3A5F, #2c527d); color: #fff; padding: 22px 26px; border-radius: 10px; }
.hello { font-size: 22px; font-weight: 700; }
.sub { margin-top: 6px; font-size: 13px; opacity: .85; }
.quick { display: flex; gap: 8px; flex-wrap: wrap; }
.section-title { margin: 18px 4px 4px; font-size: 15px; font-weight: 600; color: #1E3A5F; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.stat-card { display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light); border-left: 4px solid var(--accent); border-radius: 8px; cursor: pointer; transition: .15s; }
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(30,58,95,.12); }
.stat-icon { width: 44px; height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.stat-num { font-size: 26px; font-weight: 700; color: #1E3A5F; line-height: 1; }
.stat-label { margin-top: 4px; font-size: 13px; color: var(--el-text-color-secondary); }
.todo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.todo-card { display: flex; align-items: center; gap: 12px; padding: 16px 18px; background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light); border-radius: 8px; cursor: pointer; transition: .15s; }
.todo-card:hover { border-color: #D17A40; }
.todo-num { font-size: 24px; font-weight: 700; color: var(--el-text-color-secondary); min-width: 36px; }
.todo-num.hot { color: #D17A40; }
.todo-label { flex: 1; font-size: 14px; }
.todo-arrow { color: var(--el-text-color-secondary); }
</style>
