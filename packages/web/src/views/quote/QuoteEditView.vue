<template>
  <div class="edit-page">
    <div class="toolbar">
      <div class="title-wrap">
        <el-button link :icon="Back" @click="goBack">返回</el-button>
        <span class="title">客户报价 · {{ modeLabel }}</span>
        <el-tag v-if="form.quoteNo" size="small" type="primary">{{ form.quoteNo }}</el-tag>
        <el-tag v-if="statusLabel" size="small" :type="form.status === 'ORDERED' ? 'success' : 'warning'">{{ statusLabel }}</el-tag>
      </div>
      <div class="ops">
        <el-button v-if="!readonly" type="primary" :icon="Check" :loading="saving" @click="save">保存</el-button>
        <el-button v-if="!readonly && editId" :icon="Download" @click="importDialog = true">从样衣导入</el-button>
        <el-button v-if="!readonly && editId" type="success" :icon="Promotion" @click="toContract">转销售合同</el-button>
        <el-button v-if="editId" :icon="CopyDocument" @click="copy">复制</el-button>
      </div>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="104px" :disabled="readonly" class="form-body">
      <!-- 主要信息 -->
      <section-block title="▣ 主要信息" badge="18 字段">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="报价单号"><el-input v-model="form.quoteNo" readonly placeholder="保存后自动 Q-YYYYMMDD-序号" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="询价日期"><el-date-picker v-model="form.inquiryDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="关联样衣">
              <el-select v-model="form.sampleId" filterable clearable placeholder="选择样衣" style="width:100%">
                <el-option v-for="s in samples" :key="s.id" :label="`${s.sample_no} · ${s.style_no}`" :value="s.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="中间商" prop="middlemanId" required>
              <el-select v-model="form.middlemanId" filterable placeholder="选择中间商" style="width:100%" @change="onMiddleman">
                <el-option v-for="m in middlemen" :key="m.id" :label="`${m.customer_no} · ${m.name}`" :value="m.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="最终买家">
              <el-select v-model="form.buyerId" filterable clearable placeholder="选择最终买家" style="width:100%">
                <el-option v-for="b in buyers" :key="b.id" :label="`${b.customer_no} · ${b.name}`" :value="b.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="客户款号"><el-input v-model="form.styleNo" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="中间商联系人"><el-input v-model="form.middlemanContact" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="外销币种" prop="currency" required>
              <el-select v-model="form.currency" placeholder="USD" style="width:100%">
                <el-option v-for="c in currencies" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="汇率" prop="exchangeRate" required><el-input v-model="form.exchangeRate" type="number" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="贸易国别"><dict-select v-model="form.tradeCountry" :options="tradeCountries" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="结汇方式"><dict-select v-model="form.settlementMethod" :options="dictSettlement" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="价格条款"><dict-select v-model="form.priceTerms" :options="dictPriceTerms" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="外销员"><el-input v-model="form.salesperson" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="利润率(%)">
              <el-input v-model="form.profitRate" type="number" class="hl-input" />
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="报价数量"><el-input v-model="form.quoteQty" type="number" /></el-form-item></el-col>
        </el-row>
      </section-block>

      <!-- 报价明细 -->
      <section-block title="▣ 报价明细（从样衣导入）" badge="12 字段">
        <div v-if="!readonly" class="subtable-ops">
          <el-button size="small" :icon="Plus" @click="addItem">添加行</el-button>
          <el-button size="small" :icon="Minus" :disabled="!selItems.length" @click="delItems">删除</el-button>
          <span class="hint">含损金额 = 人民币单价 × 报价耗用 × (1 + 损耗%)；美金单价 = 人民币单价 / 汇率</span>
        </div>
        <div class="table-scroll">
          <el-table :data="form.items" size="small" border @selection-change="(v: any[]) => selItems = v">
            <el-table-column type="selection" width="38" />
            <el-table-column label="部位" width="90"><template #default="{ row }"><el-input v-model="row.part" size="small" /></template></el-table-column>
            <el-table-column label="品名" min-width="130" fixed><template #default="{ row }"><el-input v-model="row.itemName" size="small" /></template></el-table-column>
            <el-table-column label="门幅" width="80"><template #default="{ row }"><el-input v-model="row.width" size="small" /></template></el-table-column>
            <el-table-column label="颜色" width="80"><template #default="{ row }"><el-input v-model="row.color" size="small" /></template></el-table-column>
            <el-table-column label="供应商" min-width="120"><template #default="{ row }"><el-input v-model="row.supplier" size="small" /></template></el-table-column>
            <el-table-column label="单位" width="70"><template #default="{ row }"><el-input v-model="row.unit" size="small" /></template></el-table-column>
            <el-table-column label="报价耗用" width="100"><template #default="{ row }"><el-input v-model="row.quoteUsage" size="small" /></template></el-table-column>
            <el-table-column label="人民币单价" width="110"><template #default="{ row }"><el-input v-model="row.rmbPrice" size="small" class="hl-input" /></template></el-table-column>
            <el-table-column label="美金单价" width="100"><template #default="{ row }">{{ usd(row.rmbPrice) }}</template></el-table-column>
            <el-table-column label="损耗%" width="80"><template #default="{ row }"><el-input v-model="row.lossRate" size="small" /></template></el-table-column>
            <el-table-column label="含损金额" width="110"><template #default="{ row }"><span class="calc">{{ lossAmt(row) }}</span></template></el-table-column>
            <el-table-column label="备注" min-width="100"><template #default="{ row }"><el-input v-model="row.remark" size="small" /></template></el-table-column>
          </el-table>
        </div>
      </section-block>

      <!-- 费用明细 -->
      <section-block title="▣ 费用明细" badge="4 字段 · 自动带6行">
        <div v-if="!readonly" class="subtable-ops">
          <el-button size="small" :icon="Plus" @click="addFee">添加行</el-button>
          <el-button size="small" :icon="Minus" :disabled="!selFees.length" @click="delFees">删除</el-button>
        </div>
        <el-table :data="form.fees" size="small" border style="max-width:640px" @selection-change="(v: any[]) => selFees = v">
          <el-table-column type="selection" width="38" />
          <el-table-column label="费用名称" min-width="140"><template #default="{ row }"><el-input v-model="row.feeName" size="small" /></template></el-table-column>
          <el-table-column label="人民币单价" width="120"><template #default="{ row }"><el-input v-model="row.rmbPrice" size="small" class="hl-input" /></template></el-table-column>
          <el-table-column label="美金单价" width="110"><template #default="{ row }">{{ usd(row.rmbPrice) }}</template></el-table-column>
          <el-table-column label="报价耗用" width="100"><template #default="{ row }"><el-input v-model="row.quoteUsage" size="small" /></template></el-table-column>
        </el-table>
      </section-block>

      <!-- 报价合计 -->
      <section-block title="▣ 报价合计" badge="3 字段">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="报价人民币价格"><el-input :model-value="rmbTotal" readonly class="total-input" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="报价美元价格"><el-input :model-value="usdTotal" readonly class="total-input" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注说明"><el-input v-model="form.totalRemark" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
        <div class="hint">报价人民币价格 = (含损金额合计 + 费用合计) × (1 + 利润率%)；美元价格按汇率换算。</div>
      </section-block>
    </el-form>

    <!-- 从样衣导入对话框 -->
    <el-dialog v-model="importDialog" title="从样衣导入材料明细" width="480px">
      <el-select v-model="importSampleId" filterable placeholder="选择样衣单" style="width:100%">
        <el-option v-for="s in samples" :key="s.id" :label="`${s.sample_no} · ${s.style_no}`" :value="s.id" />
      </el-select>
      <p class="hint" style="margin-top:8px">将把样衣材料明细复制到报价明细（部位/品名/门幅/颜色/供应商/耗用），覆盖现有明细。</p>
      <template #footer>
        <el-button @click="importDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!importSampleId" @click="doImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { Back, Check, Plus, Minus, Download, Promotion, CopyDocument } from '@element-plus/icons-vue';
import { ElSelect, ElOption } from 'element-plus';
import { quoteApi } from '@/api/quote';
import { customerApi } from '@/api/customer';
import { sampleApi } from '@/api/sample';
import { QUOTE_STATUS_LABEL } from '@i9/types';
import { TRADE_COUNTRIES, DICT_PRICE_TERMS, DICT_SETTLEMENT } from '@/constants/regions';

const SectionBlock = (props: { title: string; badge?: string }, { slots }: any) =>
  h('div', { class: 'section-block' }, [
    h('div', { class: 'section-head' }, [
      h('span', { class: 'section-title' }, props.title),
      props.badge ? h('span', { class: 'section-badge' }, props.badge) : null,
    ]),
    h('div', { class: 'section-body' }, slots.default?.()),
  ]);
const DictSelect = (props: any, { emit }: any) =>
  h(ElSelect, {
    modelValue: props.modelValue, filterable: true, clearable: true, allowCreate: true,
    placeholder: '点击选择', style: 'width:100%', 'onUpdate:modelValue': (v: any) => emit('update:modelValue', v),
  }, () => (props.options ?? []).map((o: string) => h(ElOption, { key: o, label: o, value: o })));

const route = useRoute();
const router = useRouter();
const readonly = computed(() => !!route.meta.readonly);
const editId = computed(() => (route.params.id ? Number(route.params.id) : null));
const modeLabel = computed(() => (readonly.value ? '查看' : editId.value ? '编辑' : '新建'));

const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CNY'];
const tradeCountries = TRADE_COUNTRIES, dictPriceTerms = DICT_PRICE_TERMS, dictSettlement = DICT_SETTLEMENT;
const middlemen = ref<any[]>([]);
const buyers = ref<any[]>([]);
const samples = ref<any[]>([]);

const emptyItem = () => ({ part: '', itemName: '', width: '', color: '', supplier: '', unit: '', quoteUsage: '', rmbPrice: '', lossRate: 3, remark: '' });
const emptyFee = (n = '') => ({ feeName: n, rmbPrice: '', quoteUsage: 1 });
const DEFAULT_FEES = ['加工费', '线', '包装', '样衣费', '测试费', '运费'];
const form = reactive<any>({
  quoteNo: '', inquiryDate: new Date().toISOString().slice(0, 10), sampleId: undefined,
  middlemanId: undefined, buyerId: undefined, styleNo: '', middlemanContact: '',
  currency: 'USD', exchangeRate: 7, tradeCountry: '', settlementMethod: '', priceTerms: '',
  salesperson: '', profitRate: 0, quoteQty: '', totalRemark: '', status: '',
  items: [emptyItem()], fees: DEFAULT_FEES.map((n) => emptyFee(n)),
});

const rate = computed(() => Number(form.exchangeRate) || 0);
const usd = (rmb: any) => (rate.value > 0 && rmb !== '' && rmb != null ? (Number(rmb) / rate.value).toFixed(2) : '-');
const lossAmt = (row: any) => {
  const v = (Number(row.rmbPrice) || 0) * (Number(row.quoteUsage) || 0) * (1 + (Number(row.lossRate) || 0) / 100);
  return v ? v.toFixed(2) : '0.00';
};
const itemsSum = computed(() => form.items.reduce((s: number, r: any) => s + (Number(row2loss(r))), 0));
function row2loss(row: any) { return (Number(row.rmbPrice) || 0) * (Number(row.quoteUsage) || 0) * (1 + (Number(row.lossRate) || 0) / 100); }
const feesSum = computed(() => form.fees.reduce((s: number, f: any) => s + (Number(f.rmbPrice) || 0) * (Number(f.quoteUsage) || 0), 0));
const rmbTotal = computed(() => ((itemsSum.value + feesSum.value) * (1 + (Number(form.profitRate) || 0) / 100)).toFixed(2));
const usdTotal = computed(() => (rate.value > 0 ? (Number(rmbTotal.value) / rate.value).toFixed(2) : '-'));
const statusLabel = computed(() => (QUOTE_STATUS_LABEL as any)[form.status] ?? '');

const formRef = ref<FormInstance>();
const saving = ref(false);
const selItems = ref<any[]>([]); const selFees = ref<any[]>([]);
const importDialog = ref(false); const importSampleId = ref<number>();
const rules: FormRules = {
  middlemanId: [{ required: true, message: '请选择中间商', trigger: 'change' }],
  currency: [{ required: true, message: '请选择外销币种', trigger: 'change' }],
  exchangeRate: [{ validator: (_r, _v, cb) => (rate.value > 0 ? cb() : cb(new Error('汇率必须 > 0'))), trigger: 'blur' }],
};

function addItem() { form.items.push(emptyItem()); }
function delItems() { form.items = form.items.filter((r: any) => !selItems.value.includes(r)); if (!form.items.length) form.items.push(emptyItem()); }
function addFee() { form.fees.push(emptyFee()); }
function delFees() { form.fees = form.fees.filter((r: any) => !selFees.value.includes(r)); }
function onMiddleman(id: number) {
  const m = middlemen.value.find((x) => x.id === id);
  if (m) {
    if (!form.priceTerms) form.priceTerms = m.price_terms ?? '';
    if (!form.settlementMethod) form.settlementMethod = m.settlement_method ?? '';
    if (!form.tradeCountry) form.tradeCountry = m.trade_country ?? '';
  }
}

async function loadRefs() {
  const [ms, bs, ss] = await Promise.all([
    customerApi.list({ page: 1, size: 200, type: 'MIDDLEMAN' }),
    customerApi.list({ page: 1, size: 200, type: 'BUYER' }),
    sampleApi.list({ page: 1, size: 200 }),
  ]);
  middlemen.value = (ms as any).data?.items ?? (ms as any).items ?? [];
  buyers.value = (bs as any).data?.items ?? (bs as any).items ?? [];
  samples.value = (ss as any).data?.items ?? (ss as any).items ?? [];
}

async function load() {
  if (!editId.value) return;
  const res: any = await quoteApi.get(editId.value);
  const d = res.data ?? res;
  Object.assign(form, {
    quoteNo: d.quote_no, inquiryDate: d.inquiry_date ?? '', sampleId: d.sample_id ?? undefined,
    middlemanId: d.customer_id, buyerId: d.buyer_id ?? undefined, styleNo: d.style_no ?? '',
    middlemanContact: d.middleman_contact ?? '', currency: d.currency ?? 'USD', exchangeRate: d.exchange_rate ?? 7,
    tradeCountry: d.trade_country ?? '', settlementMethod: d.settlement_method ?? '', priceTerms: d.price_terms ?? '',
    salesperson: d.salesperson ?? '', profitRate: d.profit_rate ?? 0, quoteQty: d.quote_qty ?? '',
    totalRemark: d.total_remark ?? '', status: d.status,
    items: d.items?.length ? d.items.map((i: any) => ({
      part: i.part, itemName: i.item_name, width: i.width, color: i.color, supplier: i.supplier,
      unit: i.unit, quoteUsage: i.quote_usage, rmbPrice: i.rmb_price, lossRate: i.loss_rate, remark: i.remark,
    })) : [emptyItem()],
    fees: d.fees?.length ? d.fees.map((f: any) => ({ feeName: f.fee_name, rmbPrice: f.rmb_price, quoteUsage: f.quote_usage })) : DEFAULT_FEES.map((n) => emptyFee(n)),
  });
}

function buildDto() {
  const num = (v: any) => (v === '' || v == null ? undefined : Number(v));
  return {
    inquiryDate: form.inquiryDate || undefined, sampleId: form.sampleId, middlemanId: form.middlemanId,
    buyerId: form.buyerId, styleNo: form.styleNo || undefined, middlemanContact: form.middlemanContact || undefined,
    currency: form.currency, exchangeRate: num(form.exchangeRate), tradeCountry: form.tradeCountry || undefined,
    settlementMethod: form.settlementMethod || undefined, priceTerms: form.priceTerms || undefined,
    salesperson: form.salesperson || undefined, profitRate: num(form.profitRate) ?? 0, quoteQty: num(form.quoteQty),
    totalRemark: form.totalRemark || undefined,
    items: form.items.filter((i: any) => i.itemName).map((i: any, idx: number) => ({
      part: i.part, itemName: i.itemName, width: i.width, color: i.color, supplier: i.supplier, unit: i.unit,
      quoteUsage: num(i.quoteUsage), rmbPrice: num(i.rmbPrice), lossRate: num(i.lossRate) ?? 3, remark: i.remark, sortOrder: idx,
    })),
    fees: form.fees.filter((f: any) => f.feeName).map((f: any, idx: number) => ({
      feeName: f.feeName, rmbPrice: num(f.rmbPrice), quoteUsage: num(f.quoteUsage) ?? 1, sortOrder: idx,
    })),
  };
}

async function save() {
  await formRef.value?.validate();
  const dto = buildDto();
  if (!dto.items.length) { ElMessage.error('报价明细至少 1 行且品名必填'); return; }
  saving.value = true;
  try {
    if (editId.value) { await quoteApi.update(editId.value, dto); ElMessage.success('更新成功'); }
    else { await quoteApi.create(dto); ElMessage.success('创建成功'); }
    router.push({ name: 'Quotes' });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '保存失败');
  } finally { saving.value = false; }
}
async function doImport() {
  if (!editId.value || !importSampleId.value) return;
  try { await quoteApi.importFromSample(editId.value, importSampleId.value); ElMessage.success('已从样衣导入'); importDialog.value = false; load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '导入失败'); }
}
async function toContract() {
  if (!editId.value) return;
  try { await quoteApi.toContract(editId.value); ElMessage.success('已转销售合同（已成单）'); load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '转合同失败'); }
}
async function copy() {
  if (!editId.value) return;
  try { const r: any = await quoteApi.copy(editId.value); ElMessage.success('已复制'); router.push({ name: 'QuoteEdit', params: { id: (r.data ?? r).id } }); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '复制失败'); }
}
function goBack() { router.push({ name: 'Quotes' }); }
onMounted(async () => { await loadRefs(); await load(); });
</script>

<style scoped>
.edit-page { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.toolbar { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center;
  background: var(--el-bg-color); padding: 10px 14px; border: 1px solid var(--el-border-color-light); border-radius: 6px; }
.title-wrap { display: flex; align-items: center; gap: 10px; }
.title { font-size: 16px; font-weight: 600; color: #1E3A5F; }
.ops { display: flex; gap: 8px; flex-wrap: wrap; }
.form-body { display: flex; flex-direction: column; gap: 14px; }
.table-scroll { overflow-x: auto; }
.calc { color: #C04042; font-weight: 600; }
:deep(.hl-input .el-input__wrapper) { background: #EAF6F3; }
.total-input :deep(.el-input__wrapper) { background: #FDF0EF; font-weight: 700; }
:deep(.section-block) { border: 1px solid var(--el-border-color-light); border-radius: 6px; overflow: hidden; }
:deep(.section-head) { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: #F5EDDC; border-bottom: 1px solid var(--el-border-color-light); }
:deep(.section-title) { font-weight: 600; color: #1E3A5F; }
:deep(.section-badge) { font-size: 12px; color: #C8901E; background: #fff; padding: 1px 8px; border-radius: 10px; }
:deep(.section-body) { padding: 14px; }
.subtable-ops { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.subtable-ops .hint, .hint { font-size: 12px; color: var(--el-text-color-secondary); }
.subtable-ops .hint { margin-left: auto; }
</style>
