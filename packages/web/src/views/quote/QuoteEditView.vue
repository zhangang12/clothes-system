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
        <el-button v-if="editId" :icon="Printer" @click="printDialog = true">打印/PDF</el-button>
        <el-button v-if="!readonly && editId" :icon="Download" @click="importDialog = true">从样衣导入</el-button>
        <el-button v-if="!readonly && editId && ['DRAFT', 'ADJUSTING'].includes(form.status)" type="warning" @click="submitQuote">发出报价</el-button>
        <el-button v-if="!readonly && editId && form.status === 'QUOTED'" plain @click="adjustQuote">客户调整</el-button>
        <el-button v-if="!readonly && editId && ['QUOTED', 'ADJUSTING'].includes(form.status)" type="success" :icon="Promotion" @click="toContract">转销售合同</el-button>
        <el-button v-if="editId" :icon="CopyDocument" @click="copy">复制</el-button>
      </div>
    </div>

    <!-- 关联订单/占用标记(P2#20/#23):被引用订单号可见;草稿订单引用=占用中软标记 -->
    <div v-if="relatedOrders.length" class="mark-alert related-orders">
      <el-tag v-if="occupiedByDraft" type="warning" size="small" effect="dark" style="margin-right:8px">占用中</el-tag>
      <span class="ro-label">被引用订单：</span>
      <el-tag
        v-for="o in relatedOrders" :key="o.id" size="small" class="ro-tag"
        :type="o.status === 'DRAFT' ? 'warning' : 'success'"
        style="cursor:pointer" @click="$router.push({ name: 'OrderEdit', params: { id: o.id } })"
      >{{ o.order_no }} · {{ orderStatusLabel(o.status) }}</el-tag>
    </div>

    <!-- 打印内容勾选(P3#32/rev G1-G3):对外默认去客户信息与利润率 -->
    <el-dialog v-model="printDialog" title="打印 / 导出 PDF" width="380px">
      <el-checkbox v-model="printOpts.internal">内部留档（含客户信息与利润率）</el-checkbox><br>
      <el-checkbox v-model="printOpts.withImages">含款图（样衣图）</el-checkbox><br>
      <el-checkbox v-model="printOpts.withFees">含费用明细</el-checkbox>
      <div class="hint" style="margin-top:8px">对外报价单不含供应商/成本/客户信息与利润率；打印窗口中「另存为 PDF」即可独立导出文件。</div>
      <template #footer>
        <el-button @click="printDialog = false">取消</el-button>
        <el-button type="primary" @click="printCurrent">打印</el-button>
      </template>
    </el-dialog>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="104px" :disabled="readonly" class="form-body">
      <!-- 主要信息 -->
      <section-block title="▣ 主要信息" badge="18 字段">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="报价单号"><el-input v-model="form.quoteNo" readonly placeholder="保存后自动 Q-YYYYMMDD-序号" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="询价日期" prop="inquiryDate"><el-date-picker v-model="form.inquiryDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="关联样衣">
              <el-select v-model="form.sampleId" filterable clearable placeholder="选择样衣" style="width:100%" @change="onSample">
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
            <el-form-item label="最终买家" prop="buyerId">
              <el-select v-model="form.buyerId" filterable clearable placeholder="选择最终买家" style="width:100%">
                <el-option v-for="b in buyers" :key="b.id" :label="`${b.customer_no} · ${b.name}`" :value="b.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col v-if="form.buyerId" :span="8">
            <el-form-item label="买家编号"><el-input :model-value="buyerNo" readonly placeholder="选最终买家后带出" /></el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="客户款号" prop="styleNo"><el-input v-model="form.styleNo" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="中间商联系人">
              <el-select v-model="form.middlemanContact" filterable allow-create default-first-option clearable
                placeholder="选择联系人（可自填）" style="width:100%">
                <el-option v-for="c in middlemanContacts" :key="c.value" :label="c.label" :value="c.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="外销币种" prop="currency" required>
              <el-select v-model="form.currency" placeholder="USD" style="width:100%" @change="onCurrency">
                <el-option v-for="c in currencies" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="汇率" prop="exchangeRate" required><el-input v-model="form.exchangeRate" type="number" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="贸易国别"><dict-select v-model="form.tradeCountry" :options="tradeCountries" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="结汇方式" prop="settlementMethod"><dict-select v-model="form.settlementMethod" :options="dictSettlement" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="价格条款" prop="priceTerms"><dict-select v-model="form.priceTerms" :options="dictPriceTerms" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="外销员" prop="salesperson"><el-input v-model="form.salesperson" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="利润率(%)" prop="profitRate">
              <el-input v-model="form.profitRate" type="number" class="hl-input" />
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="报价数量"><el-input v-model="form.quoteQty" type="number" /></el-form-item></el-col>
        </el-row>
      </section-block>

      <!-- 图片信息 -->
      <section-block title="▣ 图片信息" badge="2 字段 · 截图/拖拽">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="图片1"><file-upload v-model="form.image1" :disabled="readonly" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="图片2"><file-upload v-model="form.image2" :disabled="readonly" /></el-form-item></el-col>
        </el-row>
      </section-block>

      <!-- 报价明细 -->
      <section-block title="▣ 报价明细（从样衣导入）" badge="12 字段">
        <div v-if="!readonly" class="subtable-ops">
          <el-button size="small" :icon="Plus" @click="addItem">添加行</el-button>
          <el-button size="small" :icon="Minus" :disabled="!selItems.length" @click="delItems">删除</el-button>
          <el-tooltip placement="top"
            content="在 Excel 中按列序复制后粘贴追加：部位｜品名｜门幅｜颜色｜供应商｜单位｜报价耗用｜人民币单价｜损耗%｜备注">
            <el-button size="small" @click="pasteItems">📋 Excel 粘贴</el-button>
          </el-tooltip>
          <span class="hint">含损金额 = 人民币单价 × 报价耗用 × (1 + 损耗%)；美金单价 = 人民币单价 / 汇率</span>
        </div>
        <div class="table-scroll">
          <el-table :data="form.items" size="small" border @selection-change="(v: any[]) => selItems = v">
            <el-table-column type="selection" width="38" />
            <el-table-column label="品名" min-width="150" fixed>
              <template #default="{ row }">
                <el-input v-model="row.itemName" size="small" />
                <el-tag v-if="row.deviatedFromSample" type="warning" size="small" style="margin-top:2px" :title="`样衣实测/预估耗用 ${row.sampleUsage}`">已偏离样衣</el-tag>
                <el-tag v-else-if="row.usageIsEstimate" type="info" size="small" style="margin-top:2px">单耗为预估</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="部位" width="90"><template #default="{ row }"><el-input v-model="row.part" size="small" /></template></el-table-column>
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
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { Back, Check, Plus, Minus, Download, Promotion, CopyDocument, Printer } from '@element-plus/icons-vue';
import { ElSelect, ElOption } from 'element-plus';
import { quoteApi } from '@/api/quote';
import { useAuthStore } from '@/stores/auth';
import { customerApi } from '@/api/customer';
import { sampleApi } from '@/api/sample';
import { companyApi } from '@/api/company';
import { dictApi } from '@/api/dict';
import { pasteRowsFromClipboard } from '@/utils/pasteRows';
import { printQuote } from '@/utils/quotePrint';
import FileUpload from '@/components/FileUpload.vue';
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
const authStore = useAuthStore();
const form = reactive<any>({
  quoteNo: '', inquiryDate: new Date().toISOString().slice(0, 10), sampleId: undefined,
  middlemanId: undefined, buyerId: undefined, buyerNo: '', styleNo: '', middlemanContact: '',
  // 新建默认值（设计稿字典默认：英国 / T/T 30天 / FOB 上海；编辑载入会覆盖）
  currency: 'USD', exchangeRate: 7, tradeCountry: '英国', settlementMethod: 'T/T 30天', priceTerms: 'FOB 上海',
  salesperson: authStore.realName || '', profitRate: 0, quoteQty: '', totalRemark: '', status: '',
  image1: '', image2: '',
  items: [emptyItem()], fees: DEFAULT_FEES.map((n) => emptyFee(n)),
});
// 买家编号：随所选最终买家带出（列表里就有 customer_no；编辑载入兜底用 buyer_no 快照）
const buyerNo = computed(() => buyers.value.find((b) => b.id === form.buyerId)?.customer_no ?? form.buyerNo ?? '');
// 中间商联系人下拉选项（来自中间商客户档案 contacts；可自填）
const middlemanContacts = ref<Array<{ label: string; value: string }>>([]);

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
  inquiryDate: [{ required: true, message: '请选择询价日期', trigger: 'change' }],
  middlemanId: [{ required: true, message: '请选择中间商', trigger: 'change' }],
  buyerId: [{ required: true, message: '请选择最终买家', trigger: 'change' }],
  styleNo: [{ required: true, message: '请填写客户款号', trigger: 'blur' }],
  currency: [{ required: true, message: '请选择外销币种', trigger: 'change' }],
  exchangeRate: [{ validator: (_r, _v, cb) => (rate.value > 0 ? cb() : cb(new Error('汇率必须 > 0'))), trigger: 'blur' }],
  settlementMethod: [{ required: true, message: '请选择结汇方式', trigger: 'change' }],
  priceTerms: [{ required: true, message: '请选择价格条款', trigger: 'change' }],
  salesperson: [{ required: true, message: '请填写外销员', trigger: 'blur' }],
  profitRate: [{ required: true, message: '请填写利润率', trigger: 'blur' }],
};

function addItem() { form.items.push(emptyItem()); }
function delItems() { form.items = form.items.filter((r: any) => !selItems.value.includes(r)); if (!form.items.length) form.items.push(emptyItem()); }
function addFee() { form.fees.push(emptyFee()); }
function delFees() { form.fees = form.fees.filter((r: any) => !selFees.value.includes(r)); }
// 切换中间商：直接覆盖带出价格条款/结汇方式/贸易国别（客户档案是权威来源）；联系人清空并重载选项
function onMiddleman(id: number) {
  const m = middlemen.value.find((x) => x.id === id);
  if (m) {
    form.priceTerms = m.price_terms ?? '';
    form.settlementMethod = m.settlement_method ?? '';
    form.tradeCountry = m.trade_country ?? '';
  }
  form.middlemanContact = '';
  loadContacts(id);
}

// 中间商联系人选项：取客户档案 contacts，label=姓名（职务），value=姓名
async function loadContacts(middlemanId?: number) {
  middlemanContacts.value = [];
  if (!middlemanId) return;
  try {
    const res: any = await customerApi.get(middlemanId);
    const contacts: any[] = (res.data ?? res)?.contacts ?? [];
    middlemanContacts.value = contacts
      .filter((c) => c.name)
      .map((c) => ({ label: c.title ? `${c.name}（${c.title}）` : c.name, value: c.name }));
  } catch { /* 联系人加载失败不阻断编辑 */ }
}

// 选关联样衣：带入中间商/款号/最终买家（仅当前值为空时，不覆盖已填内容）
async function onSample(id?: number) {
  if (!id) return;
  try {
    const res: any = await sampleApi.get(id);
    const s = res.data ?? res;
    if (!form.middlemanId && s.customer_id) {
      form.middlemanId = s.customer_id;
      loadContacts(s.customer_id);
    }
    if (!form.styleNo && s.style_no) form.styleNo = s.style_no;
    if (!form.buyerId && s.buyer_id) form.buyerId = s.buyer_id;
  } catch { /* 样衣详情失败不阻断 */ }
}

// 切换币种：从 currency 字典带出默认汇率（字典 value=默认汇率）
async function onCurrency(v: string) {
  if (!v) return;
  try {
    const res: any = await dictApi.list('currency');
    const hit = ((res.data ?? res) as any[])?.find((d) => d.label === v);
    const rateVal = Number(hit?.value);
    if (Number.isFinite(rateVal) && rateVal > 0) form.exchangeRate = rateVal;
  } catch { /* 字典失败保留原汇率 */ }
}

// Excel 粘贴追加明细（列序：部位/品名/门幅/颜色/供应商/单位/报价耗用/人民币单价/损耗%/备注）
async function pasteItems() {
  try {
    const rows = await pasteRowsFromClipboard<any>([
      'part', 'itemName', 'width', 'color', 'supplier', 'unit', 'quoteUsage', 'rmbPrice', 'lossRate', 'remark',
    ]);
    const toNum = (v: any) => {
      if (v === '' || v == null) return '';
      const n = Number(String(v).replace(/,/g, ''));
      return Number.isFinite(n) ? n : '';
    };
    const mapped = rows.map((r: any) => ({
      ...emptyItem(), ...r,
      quoteUsage: toNum(r.quoteUsage), rmbPrice: toNum(r.rmbPrice),
      lossRate: r.lossRate === '' || r.lossRate == null ? 3 : (toNum(r.lossRate) === '' ? 3 : toNum(r.lossRate)),
    }));
    // 追加；若当前只有一行空白行则替换之
    if (form.items.length === 1 && !form.items[0].itemName && !form.items[0].part) form.items = [];
    form.items.push(...mapped);
    ElMessage.success(`已粘贴 ${mapped.length} 行`);
  } catch (e: any) {
    ElMessage.error(e?.message ?? '粘贴失败——请先在 Excel 中复制表格区域');
  }
}

// 编辑页直接打印当前报价单（取详情 + 默认公司抬头）
const printDialog = ref(false);
const printOpts = reactive({ internal: false, withImages: true, withFees: true });
async function printCurrent() {
  if (!editId.value) return;
  printDialog.value = false;
  try {
    const res: any = await quoteApi.get(editId.value);
    let company: any;
    try { company = (await companyApi.getDefault() as any)?.data ?? undefined; } catch { company = undefined; }
    printQuote(res.data ?? res, company || undefined, { ...printOpts });
  } catch (e: any) { ElMessage.error(e?.message ?? e?.response?.data?.message ?? '打印失败'); }
}

async function loadRefs() {
  const [ms, bs, ss] = await Promise.all([
    customerApi.list({ page: 1, size: 100, type: 'MIDDLEMAN' }),
    customerApi.list({ page: 1, size: 100, type: 'BUYER' }),
    sampleApi.list({ page: 1, size: 100 }),
  ]);
  middlemen.value = (ms as any).data ?? [];
  buyers.value = (bs as any).data ?? [];
  samples.value = (ss as any).data ?? [];
}

const relatedOrders = ref<any[]>([]);
const occupiedByDraft = ref(false);
const orderStatusLabel = (st: string) =>
  ({ DRAFT: '草稿', CONFIRMED: '已下单', CONTRACTED: '已生成合同', PRODUCING: '生产中', DONE: '已完成' } as Record<string, string>)[st] ?? st;

async function load() {
  if (!editId.value) return;
  const res: any = await quoteApi.get(editId.value);
  const d = res.data ?? res;
  relatedOrders.value = d.related_orders ?? [];
  occupiedByDraft.value = !!d.occupied_by_draft;
  Object.assign(form, {
    quoteNo: d.quote_no, inquiryDate: d.inquiry_date ?? '', sampleId: d.sample_id ?? undefined,
    middlemanId: d.customer_id, buyerId: d.buyer_id ?? undefined, buyerNo: d.buyer_no ?? '', styleNo: d.style_no ?? '',
    middlemanContact: d.middleman_contact ?? '', currency: d.currency ?? 'USD', exchangeRate: d.exchange_rate ?? 7,
    tradeCountry: d.trade_country ?? '', settlementMethod: d.settlement_method ?? '', priceTerms: d.price_terms ?? '',
    salesperson: d.salesperson ?? '', profitRate: d.profit_rate ?? 0, quoteQty: d.quote_qty ?? '',
    totalRemark: d.total_remark ?? '', status: d.status, image1: d.image1 ?? '', image2: d.image2 ?? '',
    items: d.items?.length ? d.items.map((i: any) => ({
      part: i.part, itemName: i.item_name, width: i.width, color: i.color, supplier: i.supplier,
      unit: i.unit, quoteUsage: i.quote_usage, rmbPrice: i.rmb_price, lossRate: i.loss_rate, remark: i.remark,
      usageIsEstimate: !!i.usage_is_estimate, deviatedFromSample: !!i.deviated_from_sample, sampleUsage: i.sample_usage,
    })) : [emptyItem()],
    fees: d.fees?.length ? d.fees.map((f: any) => ({ feeName: f.fee_name, rmbPrice: f.rmb_price, quoteUsage: f.quote_usage })) : DEFAULT_FEES.map((n) => emptyFee(n)),
  });
  loadContacts(form.middlemanId);
}

function buildDto() {
  const num = (v: any) => (v === '' || v == null ? undefined : Number(v));
  return {
    inquiryDate: form.inquiryDate || undefined, sampleId: form.sampleId, middlemanId: form.middlemanId,
    buyerId: form.buyerId, styleNo: form.styleNo || undefined, middlemanContact: form.middlemanContact || undefined,
    currency: form.currency, exchangeRate: num(form.exchangeRate), tradeCountry: form.tradeCountry || undefined,
    settlementMethod: form.settlementMethod || undefined, priceTerms: form.priceTerms || undefined,
    salesperson: form.salesperson || undefined, profitRate: num(form.profitRate) ?? 0, quoteQty: num(form.quoteQty),
    totalRemark: form.totalRemark || undefined, image1: form.image1 || undefined, image2: form.image2 || undefined,
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
  // 明细可空的唯一例外：已关联样衣 → 创建后自动从样衣带入材料
  if (!dto.items.length && !(form.sampleId && !editId.value)) { ElMessage.error('报价明细至少 1 行且品名必填'); return; }
  saving.value = true;
  try {
    if (editId.value) {
      await quoteApi.update(editId.value, dto);
      ElMessage.success('更新成功');
      router.push({ name: 'Quotes' });
    } else {
      const r: any = await quoteApi.create(dto);
      const newId = (r.data ?? r).id;
      // 关联了样衣且没填明细 → 自动带入样衣材料并停留在编辑页
      if (form.sampleId && !dto.items.length) {
        await quoteApi.importFromSample(newId, form.sampleId);
        ElMessage.success('已自动带入样衣材料');
        await router.push({ name: 'QuoteEdit', params: { id: newId } });
        await load();
        return;
      }
      ElMessage.success('创建成功');
      router.push({ name: 'Quotes' });
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '保存失败');
  } finally { saving.value = false; }
}
async function doImport() {
  if (!editId.value || !importSampleId.value) return;
  try { await quoteApi.importFromSample(editId.value, importSampleId.value); ElMessage.success('已从样衣导入'); importDialog.value = false; load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '导入失败'); }
}
// 发出报价（草稿/客户调整→已报价；超阈值转待审批并提示）——此前 UI 缺此入口,状态机断链
async function submitQuote() {
  if (!editId.value) return;
  try { await quoteApi.submit(editId.value); ElMessage.success('已发出报价'); load(); }
  catch (e: any) {
    const msg = e?.response?.data?.message ?? '发出失败';
    if (String(msg).includes('审批')) { ElMessage.warning(msg); load(); }
    else ElMessage.error(msg);
  }
}
// 客户调整（已报价→客户调整，改完可再次发出）
async function adjustQuote() {
  if (!editId.value) return;
  try { await quoteApi.adjust(editId.value); ElMessage.success('已进入客户调整，修改后可再次发出'); load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '操作失败'); }
}
async function toContract() {
  if (!editId.value) return;
  // 客户调整状态建单:提示后放行(总览走查P2#28/ORD A7)
  if (form.status === 'ADJUSTING') {
    try {
      await ElMessageBox.confirm(
        '该报价处于「客户调整」中，价格尚未最终确认。确定按当前内容转销售合同并生成订单？',
        '客户调整中建单', { type: 'warning', confirmButtonText: '继续建单', cancelButtonText: '取消' },
      );
    } catch { return; }
  }
  try {
    const r: any = await quoteApi.toContract(editId.value);
    const d = r.data ?? r;
    ElMessage.success('已转销售合同（已成单）');
    load();
    // 后端已自动生成订单草稿（含报价明细导入），引导前往编辑
    if (d?.order_id) {
      try {
        await ElMessageBox.confirm(`已生成订单 ${d.order_no ?? `#${d.order_id}`}，是否前往编辑?`, '转销售合同', {
          confirmButtonText: '前往编辑', cancelButtonText: '留在本页', type: 'success',
        });
        router.push(`/orders/${d.order_id}/edit`);
      } catch { /* 留在本页 */ }
    }
  } catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '转合同失败'); }
}
async function copy() {
  if (!editId.value) return;
  // 复制方式三选：确认=含明细/取消按钮=仅基本信息/右上关闭=不复制
  let withItems: boolean;
  try {
    await ElMessageBox.confirm('复制为新报价（草稿）：是否同时复制报价明细与费用明细?', '复制报价单', {
      distinguishCancelAndClose: true, confirmButtonText: '含明细复制', cancelButtonText: '仅基本信息', type: 'info',
    });
    withItems = true;
  } catch (action) {
    if (action !== 'cancel') return;
    withItems = false;
  }
  try { const r: any = await quoteApi.copy(editId.value, withItems); ElMessage.success('已复制'); await router.push({ name: 'QuoteEdit', params: { id: (r.data ?? r).id } }); await load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '复制失败'); }
}
function goBack() { router.push({ name: 'Quotes' }); }
onMounted(async () => { await loadRefs(); await load(); });
</script>

<style scoped>
.mark-alert { margin-bottom: 8px; }
.related-orders { display:flex; align-items:center; flex-wrap:wrap; gap:4px; padding:8px 12px; background: var(--el-fill-color-light); border-radius:4px; font-size:12px; }
.ro-label { color: var(--el-text-color-secondary); }
.ro-tag { margin-right: 4px; }
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
