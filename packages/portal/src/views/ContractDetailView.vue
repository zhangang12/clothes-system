<template>
  <div class="contract-detail" v-if="contract.id">
    <van-nav-bar title="合同详情" left-arrow @click-left="$router.back()" />

    <!-- 撤销重推提示：内部撤回修改后重新推送，供应商需重新核对盖章 -->
    <van-notice-bar
      v-if="Number(contract.revised) === 1 && contract.portal_status === 'PUSHED'"
      left-icon="info-o"
      color="#b12b2b"
      background="#fff1f0"
      text="合同已更新，请重新核对材料明细与金额后再盖章"
    />

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
          <span>{{ [m.spec, m.color, m.size, m.style_no, m.unit].filter(Boolean).join(' · ') }}</span>
          <span v-if="m.delivery_date" style="margin-left:6px">交期 {{ String(m.delivery_date).slice(0, 10) }}</span>
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

    <!-- 加工厂订单明细同步（加工合同，设计稿 门户 A2） -->
    <van-cell-group v-if="contract.orderDetail" title="订单明细（加工同步）" inset>
      <van-cell title="订单号" :value="contract.orderDetail.order_no" />
      <van-cell title="款号" :value="contract.orderDetail.style_no || '—'" />
      <van-cell title="大货总数" :value="String(contract.orderDetail.qty_total ?? 0)" />
      <van-cell v-if="contract.orderDetail.att_board" title="大货纸板" is-link @click="openAtt(contract.orderDetail.att_board)" value="查看" />
      <van-cell v-if="contract.orderDetail.att_sizechart" title="尺寸表" is-link @click="openAtt(contract.orderDetail.att_sizechart)" value="查看" />
      <van-cell v-if="contract.orderDetail.att_filling" title="填充量" is-link @click="openAtt(contract.orderDetail.att_filling)" value="查看" />
      <van-cell
        v-for="(m, i) in contract.orderDetail.materials"
        :key="i"
        :title="m.item_name"
        :label="`${m.part || ''} ${m.color || ''} ${m.unit || ''}`"
        :value="`订量 ${m.final_purchase ?? m.total_purchase ?? 0}`"
      />
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
      <div v-if="contract.portal_status === 'PUSHED'" class="terms-agree">
        <van-checkbox v-model="agreedTerms" shape="square" icon-size="18px">
          我已阅读并同意合同条款
        </van-checkbox>
      </div>
      <van-button
        v-if="contract.portal_status === 'PUSHED'"
        type="primary"
        block
        round
        size="large"
        :disabled="!agreedTerms"
        :loading="actioning"
        @click="doStamp"
      >
        确认盖章
      </van-button>

      <van-button
        v-if="['STAMPED', 'SHIPPING'].includes(contract.portal_status)"
        type="success"
        block
        round
        size="large"
        :loading="actioning"
        @click="showShipDialog = true"
      >
        {{ contract.portal_status === 'STAMPED' ? '确认出货' : '继续发货（累计 ' + (contract.shipped_qty || 0) + '）' }}
      </van-button>

      <van-button
        v-if="contract.portal_status === 'RECONCILED'"
        type="default"
        block
        round
        size="large"
        style="margin-top: 10px;"
        @click="showInvoiceDialog = true"
      >
        上传发票
      </van-button>
      <div v-if="contract.portal_status === 'SHIPPING'" class="await-hint">可分批继续发货；待内部对账后可开票</div>
    </div>

    <!-- Shipping Dialog（批次累计 + 超发确认，设计稿 门户 B3/C4）-->
    <van-dialog
      v-model:show="showShipDialog"
      title="确认出货"
      show-cancel-button
      :before-close="handleShipClose"
    >
      <div class="invoice-form">
        <van-cell v-if="contract.ship_to_address" title="收货地址" :label="contract.ship_to_address" />
        <van-cell title="累计已发" :value="String(contract.shipped_qty || 0)" />
        <van-field v-model="shipForm.qty" label="本次实发" type="number" placeholder="本次发货数量（选填）" />
        <van-field v-model="shipForm.remark" label="备注" placeholder="可选" />
      </div>
    </van-dialog>

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
const agreedTerms = ref(false); // 盖章前须勾选「已阅读并同意合同条款」
const showShipDialog = ref(false);
const shipForm = ref({ qty: '', remark: '' });
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
    { PUSH: '已推送', RECALL: '撤销推送', STAMP: '供应商盖章', SHIP: '确认出货', INVOICE: '上传发票', RECONCILE: '对账完成' } as Record<string, string>
  )[action] ?? action;
}

// 打开订单附件（纸板/尺寸表/填充量，取第一个 URL）
function openAtt(urls: string) {
  const first = (urls || '').split(',')[0];
  if (first) window.open(first, '_blank');
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
  if (!agreedTerms.value) {
    showConfirmDialog({ title: '提示', message: '请先勾选「我已阅读并同意合同条款」后再盖章', showCancelButton: false });
    return;
  }
  await showConfirmDialog({ title: '确认盖章', message: '盖章即视为同意合同条款，盖章后合同材料明细将被锁定，无法修改，确认盖章？' });
  actioning.value = true;
  try {
    const res = await portalContractApi.stamp(contract.value.id, agreedTerms.value);
    contract.value = { ...contract.value, ...((res as any).data ?? res) };
    showSuccessToast('盖章成功');
    await load();
  } finally {
    actioning.value = false;
  }
}

async function handleShipClose(action: string) {
  if (action === 'cancel') return true;
  const payload = {
    qty: shipForm.value.qty ? Number(shipForm.value.qty) : undefined,
    remark: shipForm.value.remark || undefined,
  };
  try {
    await portalContractApi.confirmShip(contract.value.id, payload);
    showSuccessToast('已确认出货');
    shipForm.value = { qty: '', remark: '' };
    await load();
    return true;
  } catch (e: any) {
    // 超合同量 → 二次确认后 force 放行（设计稿 门户 C4）
    const msg = String(e?.response?.data?.msg || e?.message || '');
    if (msg.includes('超过合同量')) {
      try {
        await showConfirmDialog({ title: '超发确认', message: '本次发货将超过合同量，确认超发？' });
        await portalContractApi.confirmShip(contract.value.id, { ...payload, force: true });
        showSuccessToast('已确认超发出货');
        shipForm.value = { qty: '', remark: '' };
        await load();
        return true;
      } catch {
        return false;
      }
    }
    return false;
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
.terms-agree { display: flex; justify-content: center; margin-bottom: 10px; font-size: 13px; color: #646566; }
.await-hint { margin-top: 10px; text-align: center; font-size: 13px; color: #969799; }
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
