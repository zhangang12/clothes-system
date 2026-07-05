<template>
  <div class="contract-detail" v-if="contract.id">
    <van-nav-bar title="合同详情" left-arrow @click-left="$router.back()" />

    <!-- 状态徽标 + 四步顺序锁定进度（供应商门户设计稿 §B：🔖盖章→📦发货→🧾对账→💵开票）-->
    <div class="status-banner">当前状态：<b>{{ portalStatusLabel(contract.portal_status) }}</b></div>
    <van-steps :active="currentStep" active-color="#1E3A5F" class="steps-bar">
      <van-step>🔖 盖章</van-step>
      <van-step>📦 发货</van-step>
      <van-step>🧾 对账</van-step>
      <van-step>💵 开票</van-step>
    </van-steps>

    <!-- Basic Info -->
    <van-cell-group title="合同信息" inset>
      <van-cell title="合同编号" :value="contract.contract_no" />
      <van-cell title="合同类型" :value="typeLabel(contract.type)" />
      <van-cell title="合同金额">
        <template #value>
          <span class="amount-value">{{ contract.currency }} {{ (+contract.total_amount).toFixed(2) }}</span>
        </template>
      </van-cell>
      <van-cell title="定金比例" :value="`${contract.deposit_ratio}%`" />
      <van-cell title="中期款比例" :value="`${contract.mid_ratio}%`" />
      <van-cell title="尾款比例" :value="`${contract.final_ratio}%`" />
      <van-cell title="账期" :value="`${contract.account_period_days} 天`" />
      <van-cell v-if="contract.remark" title="备注" :value="contract.remark" />
    </van-cell-group>

    <!-- Materials -->
    <van-cell-group title="材料明细" inset>
      <van-cell
        v-for="m in contract.materials"
        :key="m.id"
        :title="m.item_name"
      >
        <template #label>
          <span v-if="m.spec || m.unit">{{ m.spec }} {{ m.unit }}</span>
        </template>
        <template #value>
          <div class="material-value">
            <div>单价: {{ (+m.unit_price).toFixed(4) }}</div>
            <div>数量: {{ m.qty }}</div>
            <div class="material-amount">小计: {{ (+m.amount).toFixed(2) }}</div>
          </div>
        </template>
      </van-cell>
    </van-cell-group>

    <!-- Stamp info (shown after stamping) -->
    <van-cell-group v-if="contract.stamped_at" title="盖章信息" inset>
      <van-cell title="盖章账号" :value="contract.stamped_by_supplier" />
      <van-cell title="盖章时间" :value="contract.stamped_at" />
    </van-cell-group>

    <!-- Operation Logs -->
    <van-cell-group v-if="contract.logs && contract.logs.length" title="操作记录" inset>
      <van-cell
        v-for="log in contract.logs"
        :key="log.id"
        :title="logActionLabel(log.action)"
        :value="log.operator"
        :label="log.created_at?.slice(0, 19)?.replace('T', ' ')"
      />
    </van-cell-group>

    <!-- Action Buttons -->
    <div class="action-area">
      <van-button
        v-if="contract.portal_status === 'PUSHED'"
        type="primary"
        block
        round
        size="large"
        :loading="actioning"
        @click="doStamp"
      >
        确认盖章
      </van-button>

      <van-button
        v-if="contract.portal_status === 'STAMPED'"
        type="success"
        block
        round
        size="large"
        :loading="actioning"
        @click="doConfirmShip"
      >
        确认出货
      </van-button>

      <van-button
        v-if="['STAMPED', 'SHIPPING'].includes(contract.portal_status)"
        type="default"
        block
        round
        size="large"
        style="margin-top: 10px;"
        @click="showInvoiceDialog = true"
      >
        上传发票
      </van-button>
    </div>

    <!-- Invoice Upload Dialog -->
    <van-dialog
      v-model:show="showInvoiceDialog"
      title="上传发票信息"
      show-cancel-button
      :before-close="handleInvoiceClose"
    >
      <div class="invoice-form">
        <van-field v-model="invoiceForm.invoice_no" label="发票号" placeholder="请输入发票号（选填）" />
        <van-field v-model="invoiceForm.invoice_amount" label="发票金额" type="number" placeholder="请输入发票金额（选填）" />
        <van-field v-model="invoiceForm.remark" label="备注" placeholder="可选备注" />
        <div class="invoice-upload">
          <span class="upload-label">发票附件</span>
          <van-uploader
            v-model="invoiceFiles"
            :after-read="onInvoiceRead"
            :max-count="1"
            accept="image/*,.pdf"
            upload-text="发票照片/PDF"
            @delete="invoiceForm.invoice_url = ''"
          />
        </div>
      </div>
    </van-dialog>
  </div>

  <div v-else class="loading-state">
    <van-loading v-if="loadingDetail" type="spinner" size="36px" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { showConfirmDialog, showSuccessToast } from 'vant';
import { portalContractApi } from '../api/contract';
import { uploadApi } from '../api/upload';

const route = useRoute();
const contract = ref<any>({});
const loadingDetail = ref(true);
const actioning = ref(false);
const showInvoiceDialog = ref(false);
const invoiceForm = ref({ invoice_no: '', invoice_amount: '', remark: '', invoice_url: '' });
const invoiceFiles = ref<any[]>([]);

// 发票附件上传：走后端 /uploads 端点，成功后写入 invoice_url
async function onInvoiceRead(item: any) {
  const f = Array.isArray(item) ? item[0] : item;
  f.status = 'uploading';
  f.message = '上传中...';
  try {
    const res = await uploadApi.upload(f.file);
    const data = (res as any).data ?? res;
    invoiceForm.value.invoice_url = data.url;
    f.status = 'done';
    f.message = '';
  } catch {
    f.status = 'failed';
    f.message = '上传失败';
    invoiceForm.value.invoice_url = '';
  }
}

const currentStep = computed(() => {
  const map: Record<string, number> = { PUSHED: 0, STAMPED: 1, SHIPPING: 2, RECONCILED: 3 };
  return map[contract.value.portal_status] ?? 0;
});

function typeLabel(t: string) {
  return ({ MATERIAL: '面料合同', PROCESS: '加工合同', SUPPLEMENT: '补料合同' } as Record<string, string>)[t] ?? t;
}

// 门户状态标签（设计稿：待盖章/待发货/待对账/待开票/已完成）
function portalStatusLabel(s: string) {
  return ({ PUSHED: '待盖章', STAMPED: '待发货', SHIPPING: '待对账', RECONCILED: '待开票', COMPLETED: '已完成' } as Record<string, string>)[s] ?? s;
}

function logActionLabel(action: string) {
  return (
    { PUSH: '已推送', STAMP: '供应商盖章', SHIP: '确认出货', INVOICE: '上传发票', RECONCILE: '对账完成' } as Record<string, string>
  )[action] ?? action;
}

async function load() {
  loadingDetail.value = true;
  try {
    const res = await portalContractApi.get(Number(route.params.id));
    contract.value = (res as any).data ?? res;
  } finally {
    loadingDetail.value = false;
  }
}

async function doStamp() {
  await showConfirmDialog({ title: '确认盖章', message: '盖章后合同材料明细将被锁定，无法修改，确认盖章？' });
  actioning.value = true;
  try {
    const res = await portalContractApi.stamp(contract.value.id);
    contract.value = { ...contract.value, ...((res as any).data ?? res) };
    showSuccessToast('盖章成功');
    await load();
  } finally {
    actioning.value = false;
  }
}

async function doConfirmShip() {
  await showConfirmDialog({ title: '确认出货', message: '确认已开始出货？' });
  actioning.value = true;
  try {
    await portalContractApi.confirmShip(contract.value.id);
    showSuccessToast('已确认出货');
    await load();
  } finally {
    actioning.value = false;
  }
}

async function handleInvoiceClose(action: string) {
  if (action === 'cancel') return true;
  try {
    await portalContractApi.uploadInvoice(contract.value.id, {
      invoice_no: invoiceForm.value.invoice_no || undefined,
      invoice_amount: invoiceForm.value.invoice_amount ? Number(invoiceForm.value.invoice_amount) : undefined,
      invoice_url: invoiceForm.value.invoice_url || undefined,
      remark: invoiceForm.value.remark || undefined,
    });
    showSuccessToast('发票信息已提交');
    invoiceForm.value = { invoice_no: '', invoice_amount: '', remark: '', invoice_url: '' };
    invoiceFiles.value = [];
    await load();
    return true;
  } catch {
    return false;
  }
}

onMounted(load);
</script>

<style scoped>
.contract-detail { background: #FBF8F2; min-height: 100vh; padding-bottom: 120px; }
.status-banner { background: #1E3A5F; color: #fff; padding: 10px 16px; font-size: 14px; }
.status-banner b { color: #F5EDDC; }
.steps-bar { background: #fff; margin-bottom: 12px; padding: 16px 0; }
.amount-value { color: #D17A40; font-weight: 600; }
.material-value { text-align: right; font-size: 12px; color: #646566; }
.material-amount { font-weight: 600; color: #323233; }
.action-area {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  padding: 12px 16px;
  box-shadow: 0 -2px 8px rgba(0,0,0,0.08);
}
.invoice-form { padding: 16px 0; }
.invoice-upload { padding: 12px 16px 4px; }
.upload-label { display: block; margin-bottom: 8px; font-size: 14px; color: #646566; }
.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}
</style>
