<template>
  <div class="dashboard">
    <div class="hero">
      <div>
        <div class="hello">{{ greeting }}，{{ auth.realName || '用户' }} 👋</div>
        <div class="sub">{{ today }} · 样衣 → 报价 → 订单 → 合同 → 对账 → 结算 全流程协同</div>
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
          <div class="stat-num">{{ s.count == null ? '—' : s.shown }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
        <el-icon class="stat-arrow"><ArrowRight /></el-icon>
      </div>
    </div>

    <!-- 待处理 -->
    <div class="section-title">待处理事项</div>
    <div class="todo-grid" v-loading="loading">
      <div v-for="t in todos" :key="t.label" class="todo-card" :class="{ clear: t.count === 0 }" @click="goPath(t.route)">
        <el-icon v-if="t.count === 0" class="todo-ok"><CircleCheck /></el-icon>
        <div v-else class="todo-num" :class="{ hot: (t.count ?? 0) > 0 }">{{ t.count == null ? '—' : t.shown }}</div>
        <div class="todo-label">{{ t.label }}<span v-if="t.count === 0" class="todo-clear-txt">已清</span></div>
        <el-icon class="todo-arrow"><ArrowRight /></el-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, markRaw } from 'vue';
import { useRouter } from 'vue-router';
import {
  Plus, ArrowRight, CircleCheck, Setting, Avatar, Goods, Document, List, Tickets, DataAnalysis, CreditCard, TrendCharts,
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

// 按时段问候 + 今天的日期，让工作台像「今天的台面」而不是静态门牌
const hour = new Date().getHours();
const greeting = hour < 6 ? '凌晨好' : hour < 9 ? '早上好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

type Card = { label: string; route: string; count: number | null; shown: number; api: () => Promise<unknown>; color?: string; icon?: unknown };

const stats = reactive<Card[]>([
  { label: '工厂', route: '/factories', color: '#1E3A5F', icon: markRaw(Setting), count: null, shown: 0, api: () => factoryApi.list({ page: 1, size: 1 }) },
  { label: '客户', route: '/customers', color: '#3E8E7E', icon: markRaw(Avatar), count: null, shown: 0, api: () => customerApi.list({ page: 1, size: 1 }) },
  { label: '样衣', route: '/samples', color: '#C8901E', icon: markRaw(Goods), count: null, shown: 0, api: () => sampleApi.list({ page: 1, size: 1 }) },
  { label: '报价', route: '/quotes', color: '#D17A40', icon: markRaw(Document), count: null, shown: 0, api: () => quoteApi.list({ page: 1, size: 1 }) },
  { label: '订单', route: '/orders', color: '#1E3A5F', icon: markRaw(List), count: null, shown: 0, api: () => orderApi.list({ page: 1, size: 1 }) },
  { label: '合同', route: '/contracts', color: '#3E8E7E', icon: markRaw(Tickets), count: null, shown: 0, api: () => contractApi.list({ page: 1, size: 1 }) },
  { label: '对账单', route: '/reconciliations', color: '#C8901E', icon: markRaw(DataAnalysis), count: null, shown: 0, api: () => reconciliationApi.list({ page: 1, size: 1 }) },
  { label: '付款单', route: '/payments', color: '#C04042', icon: markRaw(CreditCard), count: null, shown: 0, api: () => paymentRequestApi.list({ page: 1, size: 1 }) },
  { label: '结算单', route: '/settlements', color: '#1E3A5F', icon: markRaw(TrendCharts), count: null, shown: 0, api: () => settlementApi.list({ page: 1, size: 1 }) },
]);

const todos = reactive<Card[]>([
  { label: '草稿报价待发出', route: '/quotes', count: null, shown: 0, api: () => quoteApi.list({ page: 1, size: 1, status: 'DRAFT' }) },
  { label: '待盖章合同', route: '/contracts', count: null, shown: 0, api: () => contractApi.list({ page: 1, size: 1, portal_status: 'PUSHED' }) },
  { label: '生产中订单', route: '/orders', count: null, shown: 0, api: () => orderApi.list({ page: 1, size: 1, status: 'PRODUCING' }) },
  { label: '待审批付款', route: '/payments', count: null, shown: 0, api: () => paymentRequestApi.list({ page: 1, size: 1, approval_status: 'PENDING' }) },
]);

function go(name: string) { router.push({ name }); }
function goPath(p: string) { router.push(p); }
const totalOf = (r: any) => r?.total ?? r?.data?.total ?? 0;

// 数字滚动到位（尊重系统「减少动态效果」设置，测试/降级环境直接就位）
function countUp(cards: Card[]) {
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof requestAnimationFrame !== 'function') {
    cards.forEach((c) => { c.shown = c.count ?? 0; });
    return;
  }
  const t0 = performance.now();
  const dur = 650;
  const step = (t: number) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
    cards.forEach((c) => { c.shown = Math.round((c.count ?? 0) * e); });
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

onMounted(async () => {
  const all = [...stats, ...todos];
  const results = await Promise.allSettled(all.map((s) => s.api()));
  results.forEach((res, i) => { all[i].count = res.status === 'fulfilled' ? totalOf(res.value) : 0; });
  loading.value = false;
  countUp(all);
});
</script>

<style scoped>
.dashboard { padding: 18px; display: flex; flex-direction: column; gap: 8px; }

/* Hero：靛蓝渐变 + 斜纹织物质感 + 右下铁锈橙一抹暖光 */
.hero {
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
  color: #fff; padding: 24px 28px; border-radius: 12px;
  background:
    radial-gradient(560px 220px at 92% 130%, rgba(209, 122, 64, 0.28), transparent 70%),
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.028) 0 2px, transparent 2px 6px),
    repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.02) 0 2px, transparent 2px 6px),
    linear-gradient(120deg, #1E3A5F, #2c527d);
  box-shadow: var(--shadow-sm);
}
.hello { font-size: 22px; font-weight: 700; }
.sub { margin-top: 6px; font-size: 14px; opacity: .85; }
.quick { display: flex; gap: 8px; flex-wrap: wrap; }

.section-title {
  margin: 18px 4px 4px; font-size: 15px; font-weight: 600; color: #1E3A5F;
  display: flex; align-items: center; gap: 8px;
}
.section-title::before {
  content: ''; width: 4px; height: 14px; border-radius: 2px; background: var(--rust);
}

.stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.stat-card {
  display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light); border-left: 4px solid var(--accent);
  border-radius: 10px; cursor: pointer;
  transition: transform 0.16s var(--ease), box-shadow 0.16s var(--ease);
}
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-icon {
  width: 44px; height: 44px; border-radius: 10px; flex: none;
  display: flex; align-items: center; justify-content: center;
  color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.stat-body { flex: 1; min-width: 0; }
.stat-num { font-size: 26px; font-weight: 700; color: #1E3A5F; line-height: 1; font-variant-numeric: tabular-nums; }
.stat-label { margin-top: 4px; font-size: 14px; color: var(--el-text-color-secondary); }
.stat-arrow { color: var(--gray-3); opacity: 0; transform: translateX(-4px); transition: opacity 0.16s var(--ease), transform 0.16s var(--ease); }
.stat-card:hover .stat-arrow { opacity: 1; transform: translateX(0); }

.todo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.todo-card {
  display: flex; align-items: center; gap: 12px; padding: 16px 18px; background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light); border-radius: 10px; cursor: pointer;
  transition: border-color 0.16s var(--ease), box-shadow 0.16s var(--ease);
}
.todo-card:hover { border-color: #D17A40; box-shadow: var(--shadow-sm); }
.todo-card.clear:hover { border-color: var(--teal); }
.todo-num { font-size: 24px; font-weight: 700; color: var(--el-text-color-secondary); min-width: 36px; font-variant-numeric: tabular-nums; }
.todo-num.hot { color: #D17A40; }
.todo-ok { font-size: 24px; color: var(--teal); min-width: 36px; }
.todo-label { flex: 1; font-size: 14px; }
.todo-clear-txt { margin-left: 6px; font-size: 12px; color: var(--teal); }
.todo-arrow { color: var(--el-text-color-secondary); transition: transform 0.16s var(--ease); }
.todo-card:hover .todo-arrow { transform: translateX(3px); }
</style>
