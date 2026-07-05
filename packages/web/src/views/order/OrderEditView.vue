<template>
  <div class="edit-page">
    <div class="toolbar">
      <div class="title-wrap">
        <el-button link :icon="Back" @click="goBack">返回</el-button>
        <span class="title">订单 · {{ modeLabel }}</span>
        <el-tag v-if="form.orderNo" size="small" type="primary">{{ form.orderNo }}</el-tag>
        <el-tag v-if="statusLabel" size="small" :type="form.status === 'DONE' ? 'success' : 'warning'">{{ statusLabel }}</el-tag>
      </div>
      <div class="ops">
        <el-button v-if="!readonly" type="primary" :icon="Check" :loading="saving" @click="save">保存</el-button>
        <el-button v-if="!readonly && editId" :icon="Download" @click="importDialog = true">从报价导入</el-button>
        <el-button v-if="!readonly && editId && form.status !== 'DONE'" type="success" :icon="Promotion" @click="advance">推进状态</el-button>
      </div>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="104px" :disabled="readonly" class="form-body">
      <!-- 基础信息 -->
      <section-block title="▣ 基础信息" badge="15 字段">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="订单编号"><el-input v-model="form.orderNo" readonly placeholder="保存后自动 O-YYYYMMDD-序号" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="关联报价单">
              <el-select v-model="form.quoteId" filterable clearable placeholder="选择已生效报价" style="width:100%">
                <el-option v-for="q in quotes" :key="q.id" :label="`${q.quote_no} · ${q.style_no || ''}`" :value="q.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="客户 PO 号" prop="customerPo" required><el-input v-model="form.customerPo" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="客户款号" prop="styleNo" required><el-input v-model="form.styleNo" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="单品单价"><el-input v-model="form.unitPrice" type="number" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="币种">
              <el-select v-model="form.currency" style="width:100%"><el-option label="RMB" value="RMB" /><el-option label="USD" value="USD" /></el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="约定交期" prop="deliveryDate" required><el-date-picker v-model="form.deliveryDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="佣金(%)"><el-input v-model="form.commissionRate" type="number" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="生产工厂">
              <el-select v-model="form.factoryId" filterable clearable placeholder="从供应商库选(可后填)" style="width:100%">
                <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="中间商"><el-input v-model="form.middlemanName" readonly placeholder="报价带入" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="最终买家"><el-input v-model="form.buyerName" readonly placeholder="报价带入" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="外销员"><el-input v-model="form.salesperson" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="大货总数量"><el-input :model-value="qtyTotal" readonly class="total-input" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="制单日期"><el-input v-model="form.makeDate" readonly /></el-form-item></el-col>
        </el-row>
      </section-block>

      <!-- 尺码数量搭配 -->
      <section-block title="▣ 尺码数量搭配" badge="大货总数=各格之和">
        <div v-if="!readonly" class="subtable-ops">
          <el-button size="small" :icon="Plus" @click="addSize">加款/色·尺码行</el-button>
          <el-button size="small" :icon="Minus" :disabled="!selSizes.length" @click="delSizes">删除</el-button>
          <span class="hint">大货总数量 = 所有数量格之和，驱动用料核算</span>
        </div>
        <el-table :data="form.sizes" size="small" border @selection-change="(v: any[]) => selSizes = v">
          <el-table-column type="selection" width="38" />
          <el-table-column label="款号" min-width="130"><template #default="{ row }"><el-input v-model="row.style" size="small" /></template></el-table-column>
          <el-table-column label="颜色" width="110"><template #default="{ row }"><el-input v-model="row.color" size="small" /></template></el-table-column>
          <el-table-column label="尺码" width="90"><template #default="{ row }"><el-input v-model="row.size" size="small" /></template></el-table-column>
          <el-table-column label="PO号" width="130"><template #default="{ row }"><el-input v-model="row.po" size="small" /></template></el-table-column>
          <el-table-column label="目的地" width="120"><template #default="{ row }"><el-input v-model="row.dest" size="small" /></template></el-table-column>
          <el-table-column label="数量" width="100"><template #default="{ row }"><el-input v-model="row.qty" size="small" type="number" /></template></el-table-column>
        </el-table>
      </section-block>

      <!-- 附件档案 5 类 -->
      <section-block title="▣ 附件档案" badge="5 类">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="彩稿"><el-input v-model="form.att1" placeholder="文件URL/路径(多文件逗号分隔)" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="大货尺寸表"><el-input v-model="form.att2" placeholder="文件URL/路径" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="大货纸板"><el-input v-model="form.att3" placeholder="文件URL/路径" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="包装资料"><el-input v-model="form.att4" placeholder="文件URL/路径" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="填充量"><el-input v-model="form.att5" placeholder="羽绒/棉服填充克重表" /></el-form-item></el-col>
        </el-row>
      </section-block>

      <!-- 材料明细 -->
      <section-block title="▣ 材料明细（从报价带入，品名可改）" badge="13 字段">
        <div v-if="!readonly" class="subtable-ops">
          <el-button size="small" :icon="Plus" @click="addMat">添加行</el-button>
          <el-button size="small" :icon="Minus" :disabled="!selMats.length" @click="delMats">删除</el-button>
          <span class="hint">采购量 = 大货总数 × 单件耗用 × (1+损耗%)；个/条向上取整；最终采购量偏离>±10%需确认</span>
        </div>
        <div class="table-scroll">
          <el-table :data="form.materials" size="small" border @selection-change="(v: any[]) => selMats = v">
            <el-table-column type="selection" width="38" />
            <el-table-column label="品名" min-width="130" fixed><template #default="{ row }"><el-input v-model="row.itemName" size="small" /></template></el-table-column>
            <el-table-column label="部位" width="90"><template #default="{ row }"><el-input v-model="row.part" size="small" /></template></el-table-column>
            <el-table-column label="门幅/尺寸" width="100"><template #default="{ row }"><el-input v-model="row.width" size="small" /></template></el-table-column>
            <el-table-column label="颜色" width="90"><template #default="{ row }"><el-input v-model="row.color" size="small" /></template></el-table-column>
            <el-table-column label="成份" width="100"><template #default="{ row }"><el-input v-model="row.composition" size="small" /></template></el-table-column>
            <el-table-column label="供应商" min-width="110"><template #default="{ row }"><el-input v-model="row.supplier" size="small" /></template></el-table-column>
            <el-table-column label="单位" width="70"><template #default="{ row }"><el-input v-model="row.unit" size="small" /></template></el-table-column>
            <el-table-column label="单件耗用" width="90"><template #default="{ row }"><el-input v-model="row.netUsage" size="small" /></template></el-table-column>
            <el-table-column label="损耗%" width="80"><template #default="{ row }"><el-input v-model="row.lossRate" size="small" /></template></el-table-column>
            <el-table-column label="拆分" width="100"><template #default="{ row }"><el-select v-model="row.splitMode" size="small" style="width:100%"><el-option label="不拆" value="NONE" /><el-option label="按尺码" value="BY_SIZE" /><el-option label="按颜色" value="BY_COLOR" /></el-select></template></el-table-column>
            <el-table-column label="系统采购量" width="110"><template #default="{ row }"><span class="calc">{{ sysPurchase(row) }}</span></template></el-table-column>
            <el-table-column label="最终采购量" width="120">
              <template #default="{ row }">
                <el-input v-model="row.finalPurchase" size="small" :class="{ 'dev-warn': deviated(row) }" @blur="checkDeviation(row)" />
              </template>
            </el-table-column>
            <el-table-column label="备注" min-width="100"><template #default="{ row }"><el-input v-model="row.remark" size="small" /></template></el-table-column>
          </el-table>
        </div>
      </section-block>

      <!-- 用料核算 -->
      <section-block title="▣ 用料核算" badge="">
        <el-form-item label="整单核算模式">
          <el-radio-group v-model="form.splitMode">
            <el-radio value="NONE">不拆分</el-radio>
            <el-radio value="BY_SIZE">按尺码</el-radio>
            <el-radio value="BY_COLOR">按颜色</el-radio>
          </el-radio-group>
        </el-form-item>
        <div class="hint">采购量公式：不拆分 = 大货总数×单件耗用×(1+损耗率)；按分码/分色分别出量。整数类材料(个/条)损耗后向上取整。</div>
      </section-block>
    </el-form>

    <el-dialog v-model="importDialog" title="从报价一键导入" width="480px">
      <el-select v-model="importQuoteId" filterable placeholder="选择报价单" style="width:100%">
        <el-option v-for="q in quotes" :key="q.id" :label="`${q.quote_no} · ${q.style_no || ''}`" :value="q.id" />
      </el-select>
      <p class="hint" style="margin-top:8px">带出款号/客户/中间商/最终买家 + 复制报价明细到材料明细（单件耗用=报价耗用），快照。</p>
      <template #footer>
        <el-button @click="importDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!importQuoteId" @click="doImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { Back, Check, Plus, Minus, Download, Promotion } from '@element-plus/icons-vue';
import { orderApi } from '@/api/order';
import { quoteApi } from '@/api/quote';
import { factoryApi } from '@/api/factory';
import { ORDER_STATUS_LABEL } from '@i9/types';

const SectionBlock = (props: { title: string; badge?: string }, { slots }: any) =>
  h('div', { class: 'section-block' }, [
    h('div', { class: 'section-head' }, [
      h('span', { class: 'section-title' }, props.title),
      props.badge ? h('span', { class: 'section-badge' }, props.badge) : null,
    ]),
    h('div', { class: 'section-body' }, slots.default?.()),
  ]);

const route = useRoute();
const router = useRouter();
const readonly = computed(() => !!route.meta.readonly);
const editId = computed(() => (route.params.id ? Number(route.params.id) : null));
const modeLabel = computed(() => (readonly.value ? '查看' : editId.value ? '编辑' : '新建'));

const quotes = ref<any[]>([]);
const factories = ref<any[]>([]);
const INT_UNITS = ['个', '条', '只', '件', '粒', '套', 'pcs', 'PCS'];

const emptySize = () => ({ style: '', color: '', size: '', po: '', dest: '', qty: '' });
const emptyMat = () => ({ itemName: '', part: '', width: '', color: '', composition: '', supplier: '', unit: '', netUsage: '', lossRate: 3, splitMode: 'NONE', finalPurchase: '', remark: '' });
const form = reactive<any>({
  orderNo: '', quoteId: undefined, customerPo: '', styleNo: '', unitPrice: '', currency: 'USD',
  deliveryDate: '', commissionRate: 0, factoryId: undefined, middlemanName: '', buyerName: '',
  salesperson: '', makeDate: new Date().toISOString().slice(0, 10), splitMode: 'NONE', status: '',
  att1: '', att2: '', att3: '', att4: '', att5: '',
  sizes: [emptySize()], materials: [emptyMat()],
});

const qtyTotal = computed(() => form.sizes.reduce((s: number, r: any) => s + (Number(r.qty) || 0), 0));
const statusLabel = computed(() => (ORDER_STATUS_LABEL as any)[form.status] ?? '');
function sysPurchase(row: any) {
  const per = (Number(row.netUsage) || 0) * (1 + (Number(row.lossRate) || 0) / 100);
  let v = qtyTotal.value * per;
  v = row.unit && INT_UNITS.includes(row.unit) ? Math.ceil(v) : +v.toFixed(2);
  return v;
}
function deviated(row: any) {
  const sys = sysPurchase(row); const fin = Number(row.finalPurchase);
  return row.finalPurchase !== '' && sys > 0 && Math.abs(fin - sys) / sys > 0.1;
}
async function checkDeviation(row: any) {
  if (deviated(row)) {
    try {
      await ElMessageBox.confirm(`最终采购量偏离系统值超 ±10%（系统 ${sysPurchase(row)}，当前 ${row.finalPurchase}），确认？`, '二次确认', { type: 'warning' });
    } catch { row.finalPurchase = ''; }
  }
}

const formRef = ref<FormInstance>();
const saving = ref(false);
const selSizes = ref<any[]>([]); const selMats = ref<any[]>([]);
const importDialog = ref(false); const importQuoteId = ref<number>();
const rules: FormRules = {
  customerPo: [{ required: true, message: '请输入客户PO号', trigger: 'blur' }],
  styleNo: [{ required: true, message: '请输入客户款号', trigger: 'blur' }],
  deliveryDate: [{ required: true, message: '请选择约定交期', trigger: 'change' }],
};

function addSize() { form.sizes.push(emptySize()); }
function delSizes() { form.sizes = form.sizes.filter((r: any) => !selSizes.value.includes(r)); if (!form.sizes.length) form.sizes.push(emptySize()); }
function addMat() { form.materials.push(emptyMat()); }
function delMats() { form.materials = form.materials.filter((r: any) => !selMats.value.includes(r)); if (!form.materials.length) form.materials.push(emptyMat()); }

async function loadRefs() {
  const [qs, fs] = await Promise.all([quoteApi.list({ page: 1, size: 200 }), factoryApi.select()]);
  quotes.value = (qs as any).data?.items ?? (qs as any).items ?? [];
  factories.value = (((fs as any).data ?? fs) as any[]) ?? [];
}
async function load() {
  if (!editId.value) return;
  const res: any = await orderApi.get(editId.value);
  const d = res.data ?? res;
  const cells = d.matrix?.matrix_data?.rows;
  Object.assign(form, {
    orderNo: d.order_no, quoteId: d.quote_id ?? undefined, customerPo: d.customer_po ?? '', styleNo: d.style_no ?? '',
    unitPrice: d.unit_price ?? '', currency: d.currency ?? 'USD', deliveryDate: d.delivery_date ?? '',
    commissionRate: d.commission_rate ?? 0, factoryId: d.factory_id ?? undefined, middlemanName: d.middleman_name ?? '',
    buyerName: d.buyer_name ?? '', salesperson: d.salesperson ?? '', makeDate: d.make_date ?? '', splitMode: d.split_mode ?? 'NONE', status: d.status,
    sizes: Array.isArray(cells) && cells.length ? cells : [emptySize()],
    materials: d.materials?.length ? d.materials.map((m: any) => ({
      itemName: m.item_name, part: m.part, width: m.width, color: m.color, composition: m.composition,
      supplier: m.supplier, unit: m.unit, netUsage: m.net_usage, lossRate: m.loss_rate, splitMode: m.split_mode ?? 'NONE',
      finalPurchase: m.final_purchase ?? '', remark: m.remark,
    })) : [emptyMat()],
  });
}

function buildDto() {
  const num = (v: any) => (v === '' || v == null ? undefined : Number(v));
  const q = quotes.value.find((x) => x.id === form.quoteId);
  return {
    quote_id: form.quoteId, customer_id: q?.customer_id ?? form.customerId ?? 0,
    customer_po: form.customerPo, style_no: form.styleNo,
    unit_price: num(form.unitPrice), currency: form.currency, delivery_date: form.deliveryDate || undefined,
    commission_rate: num(form.commissionRate) ?? 0, factory_id: form.factoryId, salesperson: form.salesperson || undefined,
    split_mode: form.splitMode, qty_total: qtyTotal.value,
    matrix_data: { rows: form.sizes.filter((s: any) => s.qty) },
    materials: form.materials.filter((m: any) => m.itemName).map((m: any, i: number) => ({
      item_name: m.itemName, part: m.part, width: m.width, color: m.color, composition: m.composition,
      supplier: m.supplier, unit: m.unit, net_usage: num(m.netUsage), loss_rate: num(m.lossRate) ?? 3,
      split_mode: m.splitMode, final_purchase: num(m.finalPurchase), sort_order: i,
    })),
  };
}

async function save() {
  await formRef.value?.validate();
  const dto = buildDto();
  saving.value = true;
  try {
    if (editId.value) { await orderApi.update(editId.value, dto); ElMessage.success('更新成功'); }
    else {
      if (!form.quoteId) { ElMessage.warning('新建订单建议先关联报价并导入；已按当前信息创建'); }
      await orderApi.create(dto); ElMessage.success('创建成功');
    }
    router.push({ name: 'Orders' });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '保存失败（新建订单需先从报价导入带出客户）');
  } finally { saving.value = false; }
}
async function doImport() {
  if (!editId.value || !importQuoteId.value) return;
  try { await orderApi.importFromQuote(editId.value, importQuoteId.value); ElMessage.success('已从报价导入'); importDialog.value = false; load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '导入失败'); }
}
async function advance() {
  if (!editId.value) return;
  try { await orderApi.advance(editId.value); ElMessage.success('状态已推进'); load(); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '推进失败'); }
}
function goBack() { router.push({ name: 'Orders' }); }
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
.total-input :deep(.el-input__wrapper) { background: #EAF6F3; font-weight: 700; }
:deep(.dev-warn .el-input__wrapper) { box-shadow: 0 0 0 1px #C04042 inset; }
:deep(.section-block) { border: 1px solid var(--el-border-color-light); border-radius: 6px; overflow: hidden; }
:deep(.section-head) { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: #F5EDDC; border-bottom: 1px solid var(--el-border-color-light); }
:deep(.section-title) { font-weight: 600; color: #1E3A5F; }
:deep(.section-badge) { font-size: 12px; color: #C8901E; background: #fff; padding: 1px 8px; border-radius: 10px; }
:deep(.section-body) { padding: 14px; }
.subtable-ops { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.subtable-ops .hint, .hint { font-size: 12px; color: var(--el-text-color-secondary); }
.subtable-ops .hint { margin-left: auto; }
</style>
