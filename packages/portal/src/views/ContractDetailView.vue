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
      <van-cell v-if="contract.orderDetail.att_packing" title="包装资料" is-link @click="openAtt(contract.orderDetail.att_packing)" value="查看" />
      <van-cell v-if="contract.orderDetail.att_artwork" title="彩稿" is-link @click="openAtt(contract.orderDetail.att_artwork)" value="查看" />
      <van-cell
        v-for="(m, i) in contract.orderDetail.materials"
        :key="i"
        :title="m.item_name"
        :label="`${m.part || ''} ${m.color || ''} ${m.unit || ''}`"
        :value="`订量 ${m.final_purchase ?? m.total_purchase ?? 0}`"
      />
    </van-cell-group>

    <!-- 数量搭配(尺码矩阵,门户A2:加工厂按色/码/PO 生产)-->
    <van-cell-group v-if="matrixRows.length" title="数量搭配（色/码/PO）" inset>
      <div class="matrix-scroll">
        <table class="matrix-table">
          <thead>
            <tr>
              <th>款号</th><th>颜色</th><th>尺码</th>
              <th v-for="(po, pi) in matrixPos" :key="pi">{{ po.po_no || `PO${pi + 1}` }}</th>
              <th>合计</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, ri) in matrixRows" :key="ri">
              <td>{{ r.style_no || '—' }}</td><td>{{ r.color || '—' }}</td><td>{{ r.size || '—' }}</td>
              <td v-for="(po, pi) in matrixPos" :key="pi">{{ r.qtys?.[pi] || 0 }}</td>
              <td class="row-total">{{ (r.qtys ?? []).reduce((a: number, b: any) => a + (+b || 0), 0) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </van-cell-group>

    <!-- 发货批次（含业务审批状态；对账勾选数据源，设计稿 05 §B2/§C）-->
    <van-cell-group v-if="contract.shipments && contract.shipments.length" title="发货批次" inset>
      <van-cell
        v-for="(s, i) in contract.shipments"
        :key="s.id"
        :title="`第${i + 1}次 · ${s.ship_no || ''}`"
        :label="[
          `${(+s.qty)} 件/条`,
          s.express_company ? `${s.express_company} ${s.express_no || ''}` : '',
          s.ship_date,
          s.merge_no ? `合并组 ${s.merge_no}` : '',
          s.ship_address || '',
          (s.items ?? []).map((it: any) => `${it.item_name ?? '行'}×${+it.qty}`).join(' / '),
        ].filter(Boolean).join(' · ')"
      >
        <template #value>
          <div class="batch-value">
            <div class="material-amount">¥{{ (+s.amount || 0).toFixed(2) }}</div>
            <van-tag v-if="s.reconcile_id" type="primary" plain>已对账</van-tag>
            <van-tag v-else-if="s.approval_status === 'APPROVED'" type="success">已审批</van-tag>
            <van-tag v-else-if="s.approval_status === 'REJECTED'" type="danger">已驳回</van-tag>
            <van-tag v-else type="warning">待审批</van-tag>
            <van-button
              v-if="!s.reconcile_id && ['SHIPPING', 'RECONCILED'].includes(contract.portal_status)"
              size="mini" plain type="danger" style="margin-left:6px"
              @click.stop="doWithdrawBatch(s)"
            >撤回</van-button>
          </div>
        </template>
      </van-cell>
    </van-cell-group>

    <!-- 对账单回执（含退回批注,门户B3:供应商可见退回原因并重新发起）-->
    <van-cell-group v-if="contract.reconciliations && contract.reconciliations.length" title="对账单" inset>
      <template v-for="r in contract.reconciliations" :key="r.id">
        <van-cell :title="r.reconcile_no" :label="`金额 ¥${(+r.total_amount).toFixed(2)}${r.invoice_no ? ' · 发票 ' + r.invoice_no : ''}`">
          <template #value>
            <van-tag v-if="r.status === 'PAID'" type="success">已付款</van-tag>
            <van-tag v-else-if="r.status === 'CONFIRMED'" type="primary">已确认</van-tag>
            <van-tag v-else-if="r.status === 'PENDING'" type="warning">业务复核中</van-tag>
            <van-tag v-else-if="r.status === 'DRAFT' && r.review_remark" type="danger">已退回</van-tag>
            <van-tag v-else plain>草稿</van-tag>
          </template>
        </van-cell>
        <div v-if="r.status === 'DRAFT' && r.review_remark" class="reject-remark">
          ⚠️ 退回原因：{{ r.review_remark }}——批次已释放，请修正后重新勾选发起对账
        </div>
      </template>
    </van-cell-group>

    <!-- Stamp info (shown after stamping) -->
    <van-cell-group v-if="contract.stamped_at" title="盖章信息" inset>
      <van-cell title="盖章账号" :value="contract.stamped_by_supplier" />
      <van-cell title="盖章时间" :value="contract.stamped_at" />
      <van-cell title="盖章方式" :value="contract.stamp_mode === 'PAPER' ? '纸质盖章照片' : '电子章'" />
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
        <!-- 纸质盖章照片(A3):上传则按纸质盖章留痕;不传则电子章(PDF 落款自动贴章) -->
        <div class="paper-stamp">
          <span class="upload-label">纸质盖章照片(选填)</span>
          <van-uploader
            v-model="stampPaperFiles"
            :after-read="onStampPaperRead"
            :max-count="1"
            accept="image/*"
            upload-text="盖章页照片"
            @delete="stampPaperUrl = ''"
          />
        </div>
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

      <!-- 我要对账（设计稿 05 §C：至少一条发货被业务审批通过后可点）-->
      <van-button
        v-if="contract.portal_status === 'SHIPPING'"
        type="primary"
        block
        round
        size="large"
        style="margin-top: 10px;"
        :disabled="!reconcilableBatches.length"
        @click="openReconcileDialog"
      >
        🧾 我要对账{{ reconcilableBatches.length ? '' : '（待发货审批）' }}
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

      <!-- 发货完成（门户C3）：宣布后开票即闭环「已完成」;未宣布则开票后可继续发后续批次 -->
      <van-button
        v-if="['SHIPPING', 'RECONCILED'].includes(contract.portal_status) && !contract.ship_done_at"
        type="warning"
        plain
        block
        round
        size="large"
        style="margin-top: 10px;"
        :loading="actioning"
        @click="doShipDone"
      >
        ✅ 发货完成（本合同不再发货）
      </van-button>
      <div v-if="contract.ship_done_at" class="await-hint">已宣布发货完成（{{ String(contract.ship_done_at).slice(0, 10) }}）——开票后本合同将标记「已完成」</div>
      <div v-if="contract.portal_status === 'SHIPPING'" class="await-hint">可分批继续发货；发货经业务审批后可勾选对账，对账通过后解锁开票</div>
    </div>

    <!-- 我要对账 Dialog：勾选已审批批次 → 自动算 → 推业务审批（设计稿 05 §C）-->
    <van-dialog
      v-model:show="showReconcileDialog"
      title="🧾 我要对账"
      show-cancel-button
      confirm-button-text="确认对账 · 推业务审批"
      :before-close="handleReconcileClose"
    >
      <div class="invoice-form">
        <div class="rec-hint">勾选要对账的发货批次（仅可选已审批且未对账批次）</div>
        <van-checkbox-group v-model="selectedBatchIds">
          <van-cell
            v-for="(s, i) in contract.shipments"
            :key="s.id"
            clickable
            @click="toggleBatch(s)"
          >
            <template #title>
              <van-checkbox
                :name="s.id"
                shape="square"
                icon-size="16px"
                :disabled="s.approval_status !== 'APPROVED' || !!s.reconcile_id"
                @click.stop
              >
                第{{ i + 1 }}次 {{ (+s.qty) }}{{ s.reconcile_id ? '（已对账）' : (s.approval_status !== 'APPROVED' ? '（未审批）' : '') }}
              </van-checkbox>
            </template>
            <template #value>¥{{ (+s.amount || 0).toFixed(2) }}</template>
          </van-cell>
        </van-checkbox-group>
        <van-cell title="对账单（自动生成）" label="合同单价 × 已发数量">
          <template #value>
            <span class="amount-value">¥{{ selectedTotal.toFixed(2) }}</span>
          </template>
        </van-cell>
        <div class="rec-hint">🧾 系统按合同单价×发货数量自动算；确认后推业务审批。</div>
      </div>
    </van-dialog>

    <!-- Shipping Dialog（批次累计 + 超发确认，设计稿 门户 B3/C4）-->
    <van-dialog
      v-model:show="showShipDialog"
      title="确认出货"
      show-cancel-button
      :before-close="handleShipClose"
    >
      <div class="invoice-form">
        <van-field
          v-model="shipForm.ship_address" label="收货地址" placeholder="默认合同发货地址,可临时改"
          type="textarea" rows="1" autosize
        />
        <van-cell title="累计已发" :value="String(contract.shipped_qty || 0)" />
        <van-cell v-if="(contract.materials ?? []).length > 1" title="按物料行填写实发数" center>
          <template #right-icon><van-switch v-model="shipByLine" size="20" /></template>
        </van-cell>
        <template v-if="shipByLine">
          <div v-for="m in contract.materials" :key="m.id" class="ship-line">
            <span class="line-name">{{ m.item_name }}<span class="line-sub">（合同量 {{ +m.qty }}）</span></span>
            <van-field
              v-model="shipLineQty[m.id]" type="number" placeholder="实发数"
              class="line-input"
            />
          </div>
          <van-cell title="本次合计" :value="String(lineTotal)" />
        </template>
        <van-field v-else v-model="shipForm.qty" label="本次实发" type="number" placeholder="本次发货数量（必填）" required />
        <van-field v-model="shipForm.express_company" label="快递公司" placeholder="必填" required />
        <van-field v-model="shipForm.express_no" label="快递单号" placeholder="必填" required />
        <div class="invoice-upload">
          <span class="upload-label">附件（装箱单/货物照片）</span>
          <van-uploader
            v-model="shipFiles"
            :after-read="onShipAttachRead"
            :max-count="1"
            accept="image/*,.pdf"
            upload-text="装箱单/照片"
            @delete="shipForm.attach_url = ''"
          />
        </div>
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
import { ref, computed, onMounted, watch } from 'vue';
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
const shipForm = ref({ qty: '', remark: '', express_company: '', express_no: '', attach_url: '', ship_address: '' });
// 逐物料行实发数(P3#30)
const shipByLine = ref(false);
const shipLineQty = ref<Record<number, string>>({});
const lineTotal = computed(() =>
  Object.values(shipLineQty.value).reduce((s: number, v: any) => s + (Number(v) || 0), 0));
const shipFiles = ref<any[]>([]);
// 我要对账（设计稿 05 §C）
const showReconcileDialog = ref(false);
const selectedBatchIds = ref<number[]>([]);
const reconcilableBatches = computed(() =>
  (contract.value.shipments ?? []).filter((s: any) => s.approval_status === 'APPROVED' && !s.reconcile_id));
const selectedTotal = computed(() =>
  (contract.value.shipments ?? [])
    .filter((s: any) => selectedBatchIds.value.includes(s.id))
    .reduce((sum: number, s: any) => sum + (+s.amount || 0), 0));
function toggleBatch(s: any) {
  if (s.approval_status !== 'APPROVED' || s.reconcile_id) return;
  const idx = selectedBatchIds.value.indexOf(s.id);
  if (idx >= 0) selectedBatchIds.value.splice(idx, 1);
  else selectedBatchIds.value.push(s.id);
}
function openReconcileDialog() {
  selectedBatchIds.value = reconcilableBatches.value.map((s: any) => s.id); // 默认全选可对账批次
  showReconcileDialog.value = true;
}
async function handleReconcileClose(action: string) {
  if (action === 'cancel') return true;
  if (!selectedBatchIds.value.length) {
    showConfirmDialog({ title: '提示', message: '请至少勾选 1 个发货批次', showCancelButton: false });
    return false;
  }
  try {
    const res = await portalContractApi.createReconcile(contract.value.id, selectedBatchIds.value);
    const rec = (res as any).data ?? res;
    showSuccessToast(`对账单 ${rec.reconcile_no ?? ''} 已推业务审批`);
    selectedBatchIds.value = [];
    await load();
    return true;
  } catch {
    return false;
  }
}
// 发货附件上传（装箱单/货物照片）
async function onShipAttachRead(item: any) {
  const f = Array.isArray(item) ? item[0] : item;
  f.status = 'uploading'; f.message = '上传中...';
  try {
    const res = await uploadApi.upload(f.file, { sensitive: true });
    shipForm.value.attach_url = ((res as any).data ?? res).url;
    f.status = 'done'; f.message = '';
  } catch {
    f.status = 'failed'; f.message = '上传失败'; shipForm.value.attach_url = '';
  }
}
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
    { PUSH: '已推送', RECALL: '撤销推送', STAMP: '供应商盖章', SHIP: '确认出货', SHIP_DONE: '发货完成', WITHDRAW_SHIP: '撤回发货批次', INVOICE: '上传发票', RECONCILE: '对账完成' } as Record<string, string>
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

// 纸质盖章照片上传(A3)
// 发货弹窗打开时预填收货地址(P3#31:默认带合同发货地址,可临时改)
watch(showShipDialog, (v) => {
  if (v) {
    shipForm.value.ship_address = contract.value?.ship_to_address ?? '';
    shipByLine.value = false;
    shipLineQty.value = {};
  }
});

// 数量搭配矩阵(门户A2):orderDetail.size_matrix {pos,rows}
const matrixPos = computed(() => (contract.value?.orderDetail?.size_matrix?.pos ?? []) as any[]);
const matrixRows = computed(() => (contract.value?.orderDetail?.size_matrix?.rows ?? []) as any[]);

const stampPaperFiles = ref<any[]>([]);
const stampPaperUrl = ref('');
async function onStampPaperRead(item: any) {
  const f = Array.isArray(item) ? item[0] : item;
  f.status = 'uploading';
  try {
    const res = await uploadApi.upload(f.file);
    stampPaperUrl.value = ((res as any).data ?? res).url;
    f.status = 'done';
  } catch {
    f.status = 'failed'; f.message = '上传失败'; stampPaperUrl.value = '';
  }
}

async function doStamp() {
  if (!agreedTerms.value) {
    showConfirmDialog({ title: '提示', message: '请先勾选「我已阅读并同意合同条款」后再盖章', showCancelButton: false });
    return;
  }
  await showConfirmDialog({
    title: '确认盖章',
    message: stampPaperUrl.value
      ? '将以「纸质盖章照片」留痕完成签约，盖章后合同材料明细将被锁定，确认？'
      : '盖章即视为同意合同条款（电子章将贴入合同 PDF 落款），盖章后合同材料明细将被锁定，确认盖章？',
  });
  actioning.value = true;
  try {
    const res = await portalContractApi.stamp(contract.value.id, agreedTerms.value, stampPaperUrl.value || undefined);
    contract.value = { ...contract.value, ...((res as any).data ?? res) };
    showSuccessToast('盖章成功');
    await load();
  } finally {
    actioning.value = false;
  }
}

async function handleShipClose(action: string) {
  if (action === 'cancel') return true;
  // 数量/物流必填（总览走查P1#16）;逐物料行模式数量=Σ行(P3#30)
  const items = shipByLine.value
    ? Object.entries(shipLineQty.value)
        .filter(([, v]) => Number(v) > 0)
        .map(([mid, v]) => ({ material_id: Number(mid), qty: Number(v) }))
    : [];
  if (shipByLine.value ? !items.length : !(Number(shipForm.value.qty) > 0)) {
    showConfirmDialog({ title: '提示', message: shipByLine.value ? '请至少为一行物料填写实发数' : '请填写本次实发数量', showCancelButton: false });
    return false;
  }
  if (!shipForm.value.express_company.trim() || !shipForm.value.express_no.trim()) {
    showConfirmDialog({ title: '提示', message: '请填写物流信息（快递公司与单号）', showCancelButton: false });
    return false;
  }
  const payload = {
    qty: !shipByLine.value && shipForm.value.qty ? Number(shipForm.value.qty) : undefined,
    items: items.length ? items : undefined,
    remark: shipForm.value.remark || undefined,
    express_company: shipForm.value.express_company,
    express_no: shipForm.value.express_no,
    attach_url: shipForm.value.attach_url || undefined,
    ship_address: shipForm.value.ship_address?.trim() || undefined,
  };
  try {
    await portalContractApi.confirmShip(contract.value.id, payload);
    showSuccessToast('已确认出货');
    shipForm.value = { qty: '', remark: '', express_company: '', express_no: '', attach_url: '', ship_address: '' }; shipFiles.value = []; shipLineQty.value = {}; shipByLine.value = false;
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
        shipForm.value = { qty: '', remark: '', express_company: '', express_no: '', attach_url: '', ship_address: '' }; shipFiles.value = []; shipLineQty.value = {}; shipByLine.value = false;
        await load();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

// 发货完成（门户C3）：宣布后开票即闭环「已完成」
async function doShipDone() {
  try {
    await showConfirmDialog({
      title: '发货完成',
      message: '确认本合同发货已全部完成？宣布后不可继续发货，开票后合同将标记「已完成」。',
    });
  } catch { return; }
  actioning.value = true;
  try {
    await portalContractApi.shipDone(contract.value.id);
    showSuccessToast('已宣布发货完成');
    await load();
  } catch (e: any) {
    showConfirmDialog({ title: '操作失败', message: e?.response?.data?.msg ?? '请稍后重试', showCancelButton: false });
  } finally { actioning.value = false; }
}

// 撤回发货批次（门户B3）：未被对账占用前可撤,累计发货量回退
async function doWithdrawBatch(batch: any) {
  try {
    await showConfirmDialog({
      title: '撤回发货批次',
      message: `确认撤回 ${batch.ship_no || '该批次'}（数量 ${+batch.qty}）？撤回后累计发货量同步回退。`,
    });
  } catch { return; }
  try {
    await portalContractApi.withdrawShipment(contract.value.id, batch.id);
    showSuccessToast('批次已撤回');
    await load();
  } catch (e: any) {
    showConfirmDialog({ title: '撤回失败', message: e?.response?.data?.msg ?? '请稍后重试', showCancelButton: false });
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
/* 让位给 .action-area（传了盖章照片时最高约 195px）+ 底部 tabbar，否则末尾内容被压住 */
.contract-detail {
  background: #FBF8F2;
  min-height: 100vh;
  padding-bottom: calc(210px + var(--van-tabbar-height, 50px) + env(safe-area-inset-bottom, 0px));
}
.status-banner { background: #1E3A5F; color: #fff; padding: 10px 16px; font-size: 14px; }
.status-banner b { color: #F5EDDC; }
.steps-bar { background: #fff; margin-bottom: 12px; padding: 16px 0; }
.amount-value { color: #D17A40; font-weight: 600; }
.material-value { text-align: right; font-size: 12px; color: #646566; }
.material-amount { font-weight: 600; color: #323233; }
.batch-value { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.rec-hint { padding: 8px 16px; font-size: 12px; color: #969799; }
/* 吸底操作栏必须让开并盖过 PortalLayout 的 van-tabbar：tabbar 是 fixed/bottom:0、
   z-index:1、不透明白底，且 placeholder=false 不占位。本栏若停在 bottom:0 且不设
   z-index，「确认盖章/确认出货/我要对账/上传发票」会被 tabbar 压住点不到。 */
.action-area {
  position: fixed;
  bottom: calc(var(--van-tabbar-height, 50px) + env(safe-area-inset-bottom, 0px));
  left: 0;
  right: 0;
  z-index: 2;
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
.matrix-scroll { overflow-x: auto; padding: 8px 12px; }
.matrix-table { border-collapse: collapse; font-size: 12px; min-width: 100%; }
.matrix-table th, .matrix-table td { border: 1px solid #eee; padding: 4px 8px; text-align: center; white-space: nowrap; }
.matrix-table th { background: #fafafa; color: #666; }
.row-total { font-weight: 600; }
.ship-line { display: flex; align-items: center; padding: 4px 16px; gap: 8px; }
.line-name { flex: 1; font-size: 13px; }
.line-sub { color: #999; font-size: 11px; }
.line-input { width: 110px; flex: none; padding: 0; }
.paper-stamp {
  margin-top: 10px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.reject-remark {
  margin: 0 16px 10px;
  padding: 8px 10px;
  background: #fff1f0;
  color: #cf1322;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
}
</style>
