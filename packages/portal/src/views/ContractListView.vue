<template>
  <div class="portal-contracts">
    <van-tabs v-model:active="activeTab" sticky @change="onTabChange">
      <van-tab title="全部" name="" />
      <van-tab title="待盖章" name="PUSHED" />
      <van-tab title="待发货" name="STAMPED" />
      <van-tab title="待对账" name="SHIPPING" />
      <van-tab title="待开票" name="RECONCILED" />
      <van-tab title="已完成" name="COMPLETED" />
    </van-tabs>

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
      <van-list
        v-model:loading="loading"
        :finished="finished"
        finished-text="没有更多了"
        @load="loadMore"
      >
        <div v-for="c in list" :key="c.id" class="contract-card" @click="goDetail(c.id)">
          <div class="card-header">
            <span class="contract-no">{{ c.contract_no }}</span>
            <van-tag :type="statusTagType(c.portal_status)" size="medium">{{ statusLabel(c.portal_status) }}</van-tag>
          </div>
          <div class="card-body">
            <span class="type-label">{{ typeLabel(c.type) }}</span>
            <span class="amount">{{ c.currency }} {{ (+c.total_amount).toFixed(2) }}</span>
          </div>
          <div class="card-footer">
            <span>账期 {{ c.account_period_days }} 天</span>
            <van-icon name="arrow" class="arrow-icon" />
          </div>
        </div>
        <van-empty v-if="!loading && !list.length" description="暂无合同记录" image="search" />
      </van-list>
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { portalContractApi } from '../api/contract';

const router = useRouter();

const list = ref<any[]>([]);
const loading = ref(false);
const finished = ref(false);
const refreshing = ref(false);
const activeTab = ref('');
const page = ref(1);
const PAGE_SIZE = 20;

function statusLabel(s: string) {
  return ({ PUSHED: '待盖章', STAMPED: '待发货', SHIPPING: '待对账', RECONCILED: '待开票', COMPLETED: '已完成' } as Record<string, string>)[s] ?? s;
}
function statusTagType(s: string): any {
  return ({ PUSHED: 'warning', STAMPED: 'primary', SHIPPING: 'success', RECONCILED: '', COMPLETED: 'success' } as Record<string, string>)[s] ?? 'default';
}
function typeLabel(t: string) {
  return ({ MATERIAL: '面料合同', PROCESS: '加工合同', SUPPLEMENT: '补料合同' } as Record<string, string>)[t] ?? t;
}

async function loadMore() {
  try {
    const params: Record<string, unknown> = { page: page.value, size: PAGE_SIZE };
    if (activeTab.value) params.portal_status = activeTab.value;
    const res = await portalContractApi.list(params);
    const body = res as any;
    const items: any[] = body.data ?? [];
    list.value.push(...items);
    finished.value = list.value.length >= (body.total ?? 0);
    page.value += 1;
  } finally {
    loading.value = false;
  }
}

async function onRefresh() {
  list.value = [];
  page.value = 1;
  finished.value = false;
  await loadMore();
  refreshing.value = false;
}

function onTabChange() {
  list.value = [];
  page.value = 1;
  finished.value = false;
}

function goDetail(id: number) {
  router.push(`/portal/contracts/${id}`);
}

onMounted(() => {});
</script>

<style scoped>
.portal-contracts { background: #f5f5f5; min-height: 100vh; }
.contract-card {
  background: #fff;
  margin: 12px;
  border-radius: 8px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.contract-no { font-size: 15px; font-weight: 600; color: #323233; }
.card-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.type-label { font-size: 13px; color: #646566; }
.amount { font-size: 16px; font-weight: 600; color: #ee0a24; }
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #969799;
}
.arrow-icon { color: #c8c9cc; }
</style>
