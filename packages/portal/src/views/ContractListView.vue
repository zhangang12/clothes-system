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

    <!-- 跨合同合并发货(P3#29):同地址一车货勾多张合同,一套物流分摊 -->
    <div class="merge-bar">
      <van-button size="small" type="primary" plain round icon="logistics" @click="openMergeShip">
        合并发货（跨合同）
      </van-button>
    </div>

    <van-dialog
      v-model:show="showMergeDialog"
      title="🚚 合并发货"
      show-cancel-button
      confirm-button-text="确认发货"
      :confirm-button-disabled="mergeSubmitting"
      :before-close="handleMergeClose"
    >
      <div class="merge-form">
        <div class="rec-hint">勾选要一起发货的合同（须已盖章/发货中，同一物流单）</div>
        <div v-for="c in mergeCandidates" :key="c.id" class="merge-row">
          <van-checkbox
            :model-value="mergeSelected.includes(c.id)"
            shape="square" icon-size="16px"
            @click="toggleMerge(c.id)"
          >
            <span class="merge-label">{{ c.contract_no }}<span v-if="c.style_nos" class="merge-sub"> {{ c.style_nos }}</span></span>
          </van-checkbox>
          <van-field
            v-if="mergeSelected.includes(c.id)"
            v-model="mergeQty[c.id]" type="number" placeholder="数量" class="merge-input"
          />
        </div>
        <van-empty v-if="!mergeCandidates.length" description="暂无可发货合同" image="search" />
        <van-field v-model="mergeForm.ship_address" label="收货地址" placeholder="可填统一收货地址(选填)" />
        <van-field v-model="mergeForm.express_company" label="快递公司" placeholder="必填" required />
        <van-field v-model="mergeForm.express_no" label="快递单号" placeholder="必填" required />
        <van-field v-model="mergeForm.remark" label="备注" placeholder="可选" />
      </div>
    </van-dialog>

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
      <van-list
        v-model:loading="loading"
        :finished="finished"
        finished-text="没有更多了"
        @load="loadMore"
      >
        <div v-for="c in list" :key="c.id" class="contract-card" :class="'edge-' + c.portal_status" @click="goDetail(c.id)">
          <div class="card-header">
            <span class="contract-no">{{ c.contract_no }}</span>
            <span class="status-pill" :class="'st-' + c.portal_status">{{ statusLabel(c.portal_status) }}</span>
          </div>
          <div class="card-body">
            <span class="type-label">{{ typeLabel(c.type) }}</span>
            <span v-if="c.style_nos" class="style-nos">款号 {{ c.style_nos }}</span>
            <span class="amount">{{ c.currency }} {{ (+c.total_amount).toFixed(2) }}</span>
          </div>
          <div class="card-footer">
            <span>账期 {{ c.account_period_days }} 天</span>
            <van-button
              size="mini" :type="actionable(c.portal_status) ? 'primary' : 'default'" plain round
              @click.stop="goDetail(c.id)"
            >{{ actionable(c.portal_status) ? '进入处理' : '查看' }}</van-button>
          </div>
        </div>
        <van-empty v-if="!loading && !list.length" description="暂无合同记录" image="search" />
      </van-list>
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { showConfirmDialog, showSuccessToast } from 'vant';
import { useRouter } from 'vue-router';
import { portalContractApi } from '../api/contract';

const router = useRouter();

const list = ref<any[]>([]);
const loading = ref(false);
const finished = ref(false);
const refreshing = ref(false);
const activeTab = ref('');
// 待我处理(P2#27):待盖章/待发货/待对账/待开票=可操作,已完成=仅查看
const actionable = (st: string) => ['PUSHED', 'STAMPED', 'SHIPPING', 'RECONCILED'].includes(st);

// ── 跨合同合并发货(P3#29) ──
const showMergeDialog = ref(false);
const mergeSubmitting = ref(false); // 防连点(M12):before-close 异步期间禁用重复确认
const mergeCandidates = ref<any[]>([]);
const mergeSelected = ref<number[]>([]);
const mergeQty = ref<Record<number, string>>({});
const mergeForm = ref({ express_company: '', express_no: '', ship_address: '', remark: '' });
async function openMergeShip() {
  const res: any = await portalContractApi.list({ page: 1, size: 100 });
  const all = res?.data ?? [];
  mergeCandidates.value = all.filter((c: any) => ['STAMPED', 'SHIPPING'].includes(c.portal_status));
  mergeSelected.value = [];
  mergeQty.value = {};
  mergeForm.value = { express_company: '', express_no: '', ship_address: '', remark: '' };
  showMergeDialog.value = true;
}
function toggleMerge(id: number) {
  const i = mergeSelected.value.indexOf(id);
  if (i >= 0) mergeSelected.value.splice(i, 1);
  else mergeSelected.value.push(id);
}
async function handleMergeClose(action: string) {
  if (action === 'cancel') return true;
  if (mergeSubmitting.value) return false; // 防连点(M12):提交中忽略重复确认
  const entries = mergeSelected.value
    .filter((id) => Number(mergeQty.value[id]) > 0)
    // bigint 主键经 mysql2 出来是字符串,提交时与 qty 一样 Number() 归一(H7)
    .map((id) => ({ contract_id: Number(id), qty: Number(mergeQty.value[id]) }));
  if (entries.length < 2) {
    showConfirmDialog({ title: '提示', message: '请至少勾选 2 张合同并填写数量', showCancelButton: false });
    return false;
  }
  if (!mergeForm.value.express_company.trim() || !mergeForm.value.express_no.trim()) {
    showConfirmDialog({ title: '提示', message: '请填写物流信息（快递公司与单号）', showCancelButton: false });
    return false;
  }
  mergeSubmitting.value = true;
  try {
    const res: any = await portalContractApi.mergeShip({
      express_company: mergeForm.value.express_company,
      express_no: mergeForm.value.express_no,
      ship_address: mergeForm.value.ship_address || undefined,
      remark: mergeForm.value.remark || undefined,
      entries,
    });
    const d = res?.data ?? res;
    showSuccessToast(`合并发货成功（组号 ${d.merge_no ?? ''}，${d.count} 张合同）`);
    onRefresh();
    return true;
  } catch (e: any) {
    showConfirmDialog({ title: '发货失败', message: e?.response?.data?.msg ?? '请稍后重试', showCancelButton: false });
    return false;
  } finally {
    mergeSubmitting.value = false;
  }
}
const page = ref(1);
const PAGE_SIZE = 20;

function statusLabel(s: string) {
  return ({ PUSHED: '待盖章', STAMPED: '待发货', SHIPPING: '待对账', RECONCILED: '待开票', COMPLETED: '已完成' } as Record<string, string>)[s] ?? s;
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
  try {
    await loadMore();
  } catch {
    // 失败提示已由响应拦截器统一 toast,这里只保证刷新态复位(L28)
  } finally {
    refreshing.value = false;
  }
}

function onTabChange() {
  list.value = [];
  page.value = 1;
  finished.value = false;
}

function goDetail(id: number) {
  router.push(`/portal/contracts/${id}`);
}
</script>

<style scoped>
.portal-contracts { background: var(--dx-canvas, #FBF8F2); min-height: 100vh; padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px)); }
.contract-card {
  background: #fff;
  margin: 12px;
  border-radius: 12px;
  padding: 14px 16px;
  border-left: 4px solid transparent;
  box-shadow: 0 1px 4px rgba(35, 52, 58, 0.06);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.contract-card:active { transform: scale(0.985); }
/* 左侧色条 = 当前阶段颜色，翻列表时一眼分层 */
.edge-PUSHED { border-left-color: var(--dx-amber, #C8901E); }
.edge-STAMPED { border-left-color: var(--dx-rust, #D17A40); }
.edge-SHIPPING { border-left-color: var(--dx-green, #2E8B78); }
.edge-RECONCILED { border-left-color: #4A6572; }
.edge-COMPLETED { border-left-color: #C4C8CC; }
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.contract-no { font-size: 15px; font-weight: 600; color: #23343A; }
/* 状态徽章：品牌色胶囊(浅底深字) */
.status-pill {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  flex: none;
}
.st-PUSHED { background: #FBF1DA; color: #A87715; }
.st-STAMPED { background: #FBE8DD; color: #B86530; }
.st-SHIPPING { background: #E8F4F0; color: #24705F; }
.st-RECONCILED { background: #E9EEF1; color: #4A6572; }
.st-COMPLETED { background: #F1F2F3; color: #85888C; }
.card-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.type-label { font-size: 13px; color: #646566; }
.style-nos { font-size: 12px; color: #666; margin: 0 8px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.amount { font-size: 16px; font-weight: 600; color: var(--dx-rust, #D17A40); font-variant-numeric: tabular-nums; }
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #969799;
}
.arrow-icon { color: #c8c9cc; }
.merge-bar { padding: 8px 16px 0; display: flex; justify-content: flex-end; }
.merge-form { max-height: 60vh; overflow-y: auto; padding-bottom: 8px; }
.merge-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 16px; gap: 8px; }
.merge-label { font-size: 13px; }
.merge-sub { color: #999; font-size: 11px; }
.merge-input { width: 100px; flex: none; padding: 0; }
.rec-hint { font-size: 12px; color: #999; padding: 8px 16px 4px; }
</style>
