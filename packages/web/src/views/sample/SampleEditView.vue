<template>
  <div class="edit-page">
    <div class="toolbar">
      <div class="title-wrap">
        <el-button link :icon="Back" @click="goBack">返回</el-button>
        <span class="title">样衣管理 · {{ modeLabel }}</span>
        <el-tag size="small" effect="plain" type="info">{{ patternmaker ? '版师视图' : '业务视图' }}</el-tag>
        <el-tag v-if="form.sampleNo" size="small" type="primary">{{ form.sampleNo }}</el-tag>
        <el-tag v-if="statusLabel" size="small" :type="form.status === 'ORDERED' ? 'success' : 'warning'">{{ statusLabel }}</el-tag>
      </div>
      <div class="ops">
        <template v-if="patternmaker">
          <el-button v-if="!readonly" type="primary" :icon="Check" :loading="saving" @click="savePatternmaker">保存（版师）</el-button>
        </template>
        <template v-else>
          <el-button v-if="!readonly" type="primary" :icon="Check" :loading="saving" @click="save">保存</el-button>
          <el-button v-if="!readonly && editId" type="success" :icon="Promotion" @click="pushPatternmaker">推送版师</el-button>
          <el-button v-if="editId" :icon="CopyDocument" @click="copy">复制</el-button>
        </template>
      </div>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="104px" class="form-body">
      <!-- 基本信息 -->
      <section-block title="▣ 基本信息" badge="14 字段">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="样衣编号"><el-input v-model="form.sampleNo" readonly placeholder="保存后自动 S-YYYYMMDD-序号" /></el-form-item></el-col>
          <el-col :span="16">
            <el-form-item label="样衣类别" prop="categories" required>
              <el-checkbox-group v-model="categoryList" :disabled="bizDisabled">
                <el-checkbox v-for="c in sampleCategories" :key="c" :value="c" border size="small">{{ c }}</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="中间商" prop="middlemanId" required>
              <el-select v-model="form.middlemanId" filterable placeholder="选择中间商" style="width:100%" :disabled="bizDisabled">
                <el-option v-for="m in middlemen" :key="m.id" :label="`${m.customer_no} · ${m.name}`" :value="m.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="客户款号" prop="styleNo" required><el-input v-model="form.styleNo" :disabled="bizDisabled" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="关联最终买家">
              <el-select v-model="form.buyerId" filterable clearable placeholder="选择最终买家" style="width:100%" :disabled="bizDisabled">
                <el-option v-for="b in buyers" :key="b.id" :label="`${b.customer_no} · ${b.name}`" :value="b.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="制版师"><el-input v-model="form.patternmakerName" :disabled="bizDisabled" placeholder="从制版师字典选择" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="制单人员"><el-input v-model="form.maker" :disabled="bizDisabled" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="制单日期"><el-input v-model="form.makeDate" readonly /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="寄样日期"><el-date-picker v-model="form.shipSampleDate" type="date" value-format="YYYY-MM-DD" style="width:100%" :disabled="bizDisabled" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="收件人"><el-input v-model="form.recipient" :disabled="bizDisabled" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="文件位置"><el-input v-model="form.fileLocation" :disabled="bizDisabled" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="成衣备注"><el-input v-model="form.garmentRemark" type="textarea" :rows="2" :disabled="bizDisabled" /></el-form-item></el-col>
        </el-row>
      </section-block>

      <!-- 图片信息 -->
      <section-block title="▣ 图片信息" badge="3 字段">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="图片1"><el-input v-model="form.image1" :disabled="bizDisabled" placeholder="图片URL / 路径" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="图片2"><el-input v-model="form.image2" :disabled="bizDisabled" placeholder="图片URL / 路径" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="图片3"><el-input v-model="form.image3" :disabled="bizDisabled" placeholder="图片URL / 路径" /></el-form-item></el-col>
        </el-row>
      </section-block>

      <!-- 材料明细 -->
      <section-block title="▣ 材料明细" badge="17 字段">
        <div v-if="!readonly && !patternmaker" class="subtable-ops">
          <el-button size="small" :icon="Plus" @click="addMaterial">添加行</el-button>
          <el-button size="small" :icon="Minus" :disabled="!selMaterials.length" @click="removeMaterials">删除</el-button>
          <span class="hint">品名每款单独录入；「实际耗用」「拉链长度」由版师填</span>
        </div>
        <div class="table-scroll">
          <el-table :data="form.materials" size="small" border @selection-change="(v: any[]) => selMaterials = v">
            <el-table-column type="selection" width="38" />
            <el-table-column label="品名" min-width="130" fixed><template #default="{ row }"><el-input v-model="row.itemName" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="门幅" width="90"><template #default="{ row }"><el-input v-model="row.width" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="颜色" width="120"><template #default="{ row }"><el-input v-model="row.colors" size="small" :disabled="bizDisabled" placeholder="逗号分隔" /></template></el-table-column>
            <el-table-column label="部位" width="100"><template #default="{ row }"><el-input v-model="row.part" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="成份" width="120"><template #default="{ row }"><el-input v-model="row.composition" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="拉链长度" width="100"><template #default="{ row }"><el-input v-model="row.zipperLength" size="small" :disabled="!pmEnabled && bizDisabled" /></template></el-table-column>
            <el-table-column label="拉头" width="80"><template #default="{ row }"><el-input v-model="row.puller" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="数量" width="90"><template #default="{ row }"><el-input v-model="row.qty" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="尺寸" width="110"><template #default="{ row }"><el-input v-model="row.size" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="参考价格" width="100"><template #default="{ row }"><el-input v-model="row.refPrice" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="实际耗用" width="100"><template #default="{ row }"><el-input v-model="row.actualUsage" size="small" :disabled="!pmEnabled && bizDisabled" /></template></el-table-column>
            <el-table-column label="供应商" min-width="140">
              <template #default="{ row }">
                <el-select v-model="row.supplierId" size="small" filterable clearable style="width:100%" :disabled="bizDisabled" @change="(v: number) => onSupplier(row, v)">
                  <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="备注" min-width="110"><template #default="{ row }"><el-input v-model="row.remark" size="small" :disabled="bizDisabled" /></template></el-table-column>
          </el-table>
        </div>
      </section-block>

      <!-- 寄样跟踪 -->
      <section-block title="▣ 寄样跟踪" badge="8 字段">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="材料寄出单号"><el-input v-model="form.materialShipNo" :disabled="bizDisabled" placeholder="填入触发推送版师" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="材料寄出日期"><el-input v-model="form.materialShipDate" readonly placeholder="自动" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="寄回快递单号"><el-input v-model="form.returnNo" :disabled="!pmEnabled" placeholder="版师填" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="寄回日期"><el-input v-model="form.returnDate" readonly placeholder="自动" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="件数"><el-input v-model="form.pieceCount" type="number" :disabled="!pmEnabled" placeholder="版师填" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="工时单价(CNY)"><el-input v-model="form.laborUnitPrice" type="number" :disabled="!pmEnabled" placeholder="版师填" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="工时金额(CNY)"><el-input :model-value="laborAmount" readonly placeholder="= 件数 × 单价" /></el-form-item></el-col>
        </el-row>
        <div class="hint">💡 版师填「件数 + 工时单价」保存后自动生成对账单 → 联动付款申请。</div>
      </section-block>

      <!-- 变更记录 -->
      <section-block v-if="editId" title="▣ 变更记录" badge="">
        <el-timeline v-if="versions.length">
          <el-timeline-item v-for="v in versions" :key="v.id" :timestamp="v.created_at" size="small">
            {{ actionLabel(v.action) }}{{ v.remark ? ` · ${v.remark}` : '' }}
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="暂无变更记录" :image-size="60" />
      </section-block>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { Back, Check, Plus, Minus, Promotion, CopyDocument } from '@element-plus/icons-vue';
import { sampleApi } from '@/api/sample';
import { customerApi } from '@/api/customer';
import { factoryApi } from '@/api/factory';
import { SAMPLE_CATEGORIES, SAMPLE_STATUS_LABEL } from '@i9/types';

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
const patternmaker = computed(() => !!route.meta.patternmaker);
const editId = computed(() => (route.params.id ? Number(route.params.id) : null));
const modeLabel = computed(() => (readonly.value ? '查看' : patternmaker.value ? '版师编辑' : editId.value ? '编辑' : '新建'));
const bizDisabled = computed(() => readonly.value || patternmaker.value); // 业务字段：查看/版师视图只读
const pmEnabled = computed(() => patternmaker.value && !readonly.value);  // 版师字段：仅版师视图可编辑

const sampleCategories = SAMPLE_CATEGORIES;
const middlemen = ref<any[]>([]);
const buyers = ref<any[]>([]);
const factories = ref<any[]>([]);
const versions = ref<any[]>([]);

const emptyMaterial = () => ({ itemName: '', width: '', colors: '', part: '', composition: '', codeBand: '', zipperLength: '', puller: '', qty: '', size: '', refPrice: '', actualUsage: '', supplierId: undefined, supplierName: '', remark: '' });
const form = reactive<any>({
  sampleNo: '', categories: '', middlemanId: undefined, styleNo: '', buyerId: undefined,
  patternmakerName: '', maker: '', makeDate: new Date().toISOString().slice(0, 10),
  shipSampleDate: '', recipient: '', fileLocation: '', garmentRemark: '',
  image1: '', image2: '', image3: '', materialShipNo: '', materialShipDate: '',
  returnNo: '', returnDate: '', pieceCount: '', laborUnitPrice: '', status: '',
  materials: [emptyMaterial()],
});

const categoryList = computed({
  get: () => (form.categories ? String(form.categories).split(',').filter(Boolean) : []),
  set: (v: string[]) => { form.categories = v.join(','); },
});
const laborAmount = computed(() => {
  const p = Number(form.pieceCount), u = Number(form.laborUnitPrice);
  return p && u ? (p * u).toFixed(2) : (form.laborAmount ?? '');
});
const statusLabel = computed(() => (SAMPLE_STATUS_LABEL as any)[form.status] ?? '');

const formRef = ref<FormInstance>();
const saving = ref(false);
const selMaterials = ref<any[]>([]);
const rules: FormRules = {
  styleNo: [{ required: true, message: '请输入客户款号', trigger: 'blur' }],
  middlemanId: [{ required: true, message: '请选择中间商', trigger: 'change' }],
  categories: [{ validator: (_r, _v, cb) => (categoryList.value.length ? cb() : cb(new Error('请选择样衣类别'))), trigger: 'change' }],
};

function addMaterial() { form.materials.push(emptyMaterial()); }
function removeMaterials() {
  form.materials = form.materials.filter((m: any) => !selMaterials.value.includes(m));
  if (!form.materials.length) form.materials.push(emptyMaterial());
}
function onSupplier(row: any, id: number) { row.supplierName = factories.value.find((f) => f.id === id)?.name ?? ''; }
const actionLabel = (a: string) => ({ PUSH: '推送版师', PATTERNMAKER_SAVE: '版师保存', SHIP: '已寄出', COMPLETE: '已完成', COPY: '复制' } as any)[a] ?? a;

async function loadRefs() {
  const [ms, bs, fs] = await Promise.all([
    customerApi.list({ page: 1, size: 200, type: 'MIDDLEMAN' }),
    customerApi.list({ page: 1, size: 200, type: 'BUYER' }),
    factoryApi.select(),
  ]);
  middlemen.value = (ms as any).data?.items ?? (ms as any).items ?? [];
  buyers.value = (bs as any).data?.items ?? (bs as any).items ?? [];
  factories.value = (((fs as any).data ?? fs) as any[]) ?? [];
}

async function load() {
  if (!editId.value) return;
  const res: any = await sampleApi.get(editId.value);
  const d = res.data ?? res;
  Object.assign(form, {
    sampleNo: d.sample_no, categories: d.categories ?? '', middlemanId: d.customer_id, styleNo: d.style_no,
    buyerId: d.buyer_id ?? undefined, patternmakerName: d.patternmaker_name ?? '', maker: d.maker ?? '',
    makeDate: d.make_date ?? '', shipSampleDate: d.ship_sample_date ?? '', recipient: d.recipient ?? '',
    fileLocation: d.file_location ?? '', garmentRemark: d.garment_remark ?? '',
    image1: d.image1 ?? '', image2: d.image2 ?? '', image3: d.image3 ?? '',
    materialShipNo: d.material_ship_no ?? '', materialShipDate: d.material_ship_date ?? '',
    returnNo: d.return_no ?? '', returnDate: d.return_date ?? '', pieceCount: d.piece_count ?? '',
    laborUnitPrice: d.labor_unit_price ?? '', laborAmount: d.labor_amount ?? '', status: d.status,
    materials: d.materials?.length ? d.materials.map((m: any) => ({
      id: m.id, itemName: m.item_name, width: m.width, colors: m.colors, part: m.part,
      composition: m.composition, codeBand: m.code_band, zipperLength: m.zipper_length, puller: m.puller,
      qty: m.qty, size: m.size, refPrice: m.ref_price, actualUsage: m.actual_usage,
      supplierId: m.supplier_id ?? undefined, supplierName: m.supplier_name, remark: m.remark,
    })) : [emptyMaterial()],
  });
  const vs: any = await sampleApi.getVersionHistory(editId.value);
  versions.value = (vs.data ?? vs) ?? [];
}

function buildDto() {
  return {
    categories: form.categories, middlemanId: form.middlemanId, styleNo: form.styleNo,
    buyerId: form.buyerId, patternmakerName: form.patternmakerName || undefined, maker: form.maker || undefined,
    shipSampleDate: form.shipSampleDate || undefined, recipient: form.recipient || undefined,
    fileLocation: form.fileLocation || undefined, garmentRemark: form.garmentRemark || undefined,
    image1: form.image1 || undefined, image2: form.image2 || undefined, image3: form.image3 || undefined,
    materials: form.materials.filter((m: any) => m.itemName).map((m: any, i: number) => ({ ...m, sortOrder: i })),
  };
}

async function save() {
  await formRef.value?.validate();
  const dto = buildDto();
  if (!dto.materials.length) { ElMessage.error('材料明细至少 1 行且品名必填'); return; }
  saving.value = true;
  try {
    if (editId.value) { await sampleApi.update(editId.value, dto); ElMessage.success('更新成功'); }
    else { await sampleApi.create(dto); ElMessage.success('创建成功'); }
    router.push({ name: 'Samples' });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '保存失败');
  } finally { saving.value = false; }
}

async function pushPatternmaker() {
  if (!editId.value) return;
  try {
    await sampleApi.push(editId.value, { patternmakerName: form.patternmakerName || undefined, materialShipNo: form.materialShipNo || undefined });
    ElMessage.success('已推送版师工作台（状态→打样中）');
    load();
  } catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '推送失败'); }
}

async function savePatternmaker() {
  if (!editId.value) return;
  saving.value = true;
  try {
    await sampleApi.patternmakerSave(editId.value, {
      materials: form.materials.filter((m: any) => m.id).map((m: any) => ({ id: m.id, actualUsage: m.actualUsage === '' ? undefined : Number(m.actualUsage), zipperLength: m.zipperLength })),
      returnNo: form.returnNo || undefined,
      pieceCount: form.pieceCount === '' ? undefined : Number(form.pieceCount),
      laborUnitPrice: form.laborUnitPrice === '' ? undefined : Number(form.laborUnitPrice),
    });
    ElMessage.success('版师保存成功');
    router.push({ name: 'Samples' });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '保存失败');
  } finally { saving.value = false; }
}

async function copy() {
  if (!editId.value) return;
  try { const r: any = await sampleApi.copy(editId.value); ElMessage.success('已复制'); router.push({ name: 'SampleEdit', params: { id: (r.data ?? r).id } }); }
  catch (e: any) { ElMessage.error(e?.response?.data?.message ?? '复制失败'); }
}
function goBack() { router.push({ name: 'Samples' }); }

onMounted(async () => { await loadRefs(); await load(); });
</script>

<style scoped>
.edit-page { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.toolbar { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center;
  background: var(--el-bg-color); padding: 10px 14px; border: 1px solid var(--el-border-color-light); border-radius: 6px; }
.title-wrap { display: flex; align-items: center; gap: 10px; }
.title { font-size: 16px; font-weight: 600; color: #1E3A5F; }
.ops { display: flex; gap: 8px; }
.form-body { display: flex; flex-direction: column; gap: 14px; }
.table-scroll { overflow-x: auto; }
:deep(.section-block) { border: 1px solid var(--el-border-color-light); border-radius: 6px; overflow: hidden; }
:deep(.section-head) { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: #F5EDDC; border-bottom: 1px solid var(--el-border-color-light); }
:deep(.section-title) { font-weight: 600; color: #1E3A5F; }
:deep(.section-badge) { font-size: 12px; color: #C8901E; background: #fff; padding: 1px 8px; border-radius: 10px; }
:deep(.section-body) { padding: 14px; }
.subtable-ops { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.subtable-ops .hint, .hint { font-size: 12px; color: var(--el-text-color-secondary); }
.subtable-ops .hint { margin-left: auto; }
</style>
