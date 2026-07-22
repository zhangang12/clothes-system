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
          <el-button v-if="!readonly && editId && ['SAMPLING', 'SHIPPED'].includes(form.status)" type="warning" plain @click="markShipped">标记已寄出</el-button>
          <el-button v-if="!readonly && editId && ['RECONCILED', 'DONE'].includes(form.status)" type="success" plain @click="markComplete">标记完成</el-button>
          <el-button v-if="editId" :icon="CopyDocument" @click="copy">复制</el-button>
        </template>
        <el-button v-if="editId" :icon="Printer" @click="print">打印/PDF</el-button>
        <el-button v-if="editId" :icon="Download" @click="exportExcel">导出Excel</el-button>
        <el-button v-if="editId && isAdmin" type="danger" plain :icon="Delete" @click="removeSample">删除</el-button>
      </div>
    </div>

    <!-- 关联单据快速跳转:下游·由本样衣生成的报价单(反查见 loadRelatedQuotes;版师视图不查,报价对版师不可见) -->
    <DocLinks :links="docLinks" />

    <RuleHint>品名<b>文本录入、不从库导入</b>;颜色可点「加颜色列」动态扩列;<b>参考价格对版师脱敏</b>;实际耗用/拉链长度/工时由版师在工作台填写;填「材料寄出单号」即自动推送版师转打样中。</RuleHint>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="104px" class="form-body">
      <!-- 基本信息 -->
      <section-block title="▣ 基本信息" badge="16 字段">
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
          <el-col :span="8"><el-form-item label="样衣尺码"><el-input v-model="form.sampleSize" :disabled="bizDisabled" placeholder="如 38码 / S/M/L" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="样衣数量"><el-input v-model="form.sampleQty" type="number" :min="0" :disabled="bizDisabled" placeholder="件" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="关联最终买家">
              <el-select v-model="form.buyerId" filterable clearable placeholder="选择最终买家" style="width:100%" :disabled="bizDisabled">
                <el-option v-for="b in buyers" :key="b.id" :label="`${b.customer_no} · ${b.name}`" :value="b.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="制版师">
              <el-select v-if="!pmLoadFailed" v-model="form.patternmakerId" filterable clearable placeholder="选择制版师" style="width:100%" :disabled="bizDisabled" @change="onPatternmaker">
                <el-option v-for="u in pmUsers" :key="u.id" :label="u.real_name || u.username" :value="u.id" />
              </el-select>
              <el-input v-else v-model="form.patternmakerName" :disabled="bizDisabled" placeholder="制版师姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="制单人员"><el-input v-model="form.maker" :disabled="bizDisabled" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="制单日期"><el-input v-model="form.makeDate" readonly /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="寄样日期"><el-date-picker v-model="form.shipSampleDate" type="date" value-format="YYYY-MM-DD" style="width:100%" :disabled="bizDisabled" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="收件人"><el-input v-model="form.recipient" :disabled="bizDisabled" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="文件位置"><el-input v-model="form.fileLocation" :disabled="bizDisabled" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="成衣备注"><el-input v-model="form.garmentRemark" type="textarea" :rows="2" :disabled="bizDisabled" /></el-form-item></el-col>
        </el-row>
      </section-block>

      <!-- 图片信息 -->
      <section-block title="▣ 图片信息 / 资料附件" badge="3 槽·每槽多图+附件">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="图片1">
              <file-upload v-model="form.image1" multiple :limit="6" list-type="text"
                accept="image/*,.pdf,.xls,.xlsx" :disabled="bizDisabled"
                tip="多张图片 / PDF / Excel（首张图片带入报价/订单）" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="图片2">
              <file-upload v-model="form.image2" multiple :limit="6" list-type="text"
                accept="image/*,.pdf,.xls,.xlsx" :disabled="bizDisabled"
                tip="多张图片 / PDF / Excel（首张图片带入报价）" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="图片3">
              <file-upload v-model="form.image3" multiple :limit="6" list-type="text"
                accept="image/*,.pdf,.xls,.xlsx" :disabled="bizDisabled"
                tip="多张图片 / PDF / Excel（点文件即可下载）" />
            </el-form-item>
          </el-col>
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
            <el-table-column label="安排日期" width="130"><template #default="{ row }"><el-date-picker v-model="row.arrangeDate" type="date" value-format="YYYY-MM-DD" size="small" style="width:100%" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="门幅" width="90"><template #default="{ row }"><el-input v-model="row.width" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="颜色" width="120"><template #default="{ row }"><el-input v-model="row.colors" size="small" :disabled="bizDisabled" placeholder="逗号分隔" /></template></el-table-column>
            <el-table-column label="部位" width="100"><template #default="{ row }"><el-input v-model="row.part" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="成份" width="120"><template #default="{ row }"><el-input v-model="row.composition" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="码带" width="90"><template #default="{ row }"><el-input v-model="row.codeBand" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="拉链长度" width="100"><template #default="{ row }"><el-input v-model="row.zipperLength" size="small" :disabled="!pmEnabled && bizDisabled" /></template></el-table-column>
            <el-table-column label="拉头" width="80"><template #default="{ row }"><el-input v-model="row.puller" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="数量" width="90"><template #default="{ row }"><el-input v-model="row.qty" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="尺寸" width="110"><template #default="{ row }"><el-input v-model="row.size" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <!-- 参考价格属敏感字段:版师视图隐藏(对外/版师脱敏) -->
            <el-table-column v-if="!patternmaker" label="参考价格" width="100"><template #default="{ row }"><el-input v-model="row.refPrice" size="small" :disabled="bizDisabled" /></template></el-table-column>
            <el-table-column label="实际耗用" width="100"><template #default="{ row }"><el-input v-model="row.actualUsage" size="small" :disabled="!pmEnabled && bizDisabled" /></template></el-table-column>
            <el-table-column label="供应商" min-width="140">
              <template #default="{ row }">
                <el-select v-model="row.supplierId" size="small" filterable clearable style="width:100%" :disabled="bizDisabled" @change="(v: number) => onSupplier(row, v)">
                  <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="图片" width="88">
              <template #default="{ row }">
                <div class="mat-photo">
                  <el-image v-if="row.image" :src="row.image" :preview-src-list="[row.image]" fit="cover" class="mat-thumb" />
                  <el-upload v-if="!bizDisabled || pmEnabled" :show-file-list="false" :http-request="(o: any) => uploadMatImage(o, row)" accept="image/*">
                    <el-button size="small" link>📷</el-button>
                  </el-upload>
                </div>
              </template>
            </el-table-column>
            <el-table-column v-if="!patternmaker && editId" label="采购" width="86" align="center">
              <template #default="{ row }">
                <el-tooltip content="为该行生成无合同费用对账单(打样材料,金额=数量×参考价)" placement="top">
                  <el-button link type="warning" size="small" :disabled="!row.id" @click="doPurchase(row)">🟠生成采购</el-button>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="备注" min-width="110"><template #default="{ row }"><el-input v-model="row.remark" size="small" :disabled="bizDisabled" /></template></el-table-column>
          </el-table>
        </div>
      </section-block>

      <!-- 寄样跟踪(多轮) -->
      <section-block title="▣ 寄样跟踪" badge="多轮">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="材料寄出单号"><el-input v-model="form.materialShipNo" :disabled="bizDisabled" placeholder="填入触发推送版师" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="材料寄出日期"><el-input v-model="form.materialShipDate" readonly placeholder="自动" /></el-form-item></el-col>
        </el-row>
        <RuleHint tone="teal">样衣一轮打不完可分<b>多轮寄样</b>:每轮填 尺码/数量/寄样日期/单号;<b>寄回日期、工价单价由版师填</b>;各轮金额=数量×单价,<b>工价合计=各轮之和</b>自动进对账。</RuleHint>
        <div v-if="!readonly" class="subtable-ops">
          <el-button size="small" :icon="Plus" @click="addRound">加一轮</el-button>
          <el-button size="small" :icon="Minus" :disabled="!selectedRounds.length" @click="removeRounds">删除</el-button>
          <span class="hint">工价合计 ¥{{ shipRoundsTotal }}（{{ form.shipRounds.length }} 轮 · 共 {{ shipRoundsQty }} 件）</span>
        </div>
        <el-table :data="form.shipRounds" size="small" border @selection-change="(v: any[]) => selectedRounds = v">
          <el-table-column type="selection" width="40" />
          <el-table-column label="轮次" width="60"><template #default="{ $index }">{{ $index + 1 }}</template></el-table-column>
          <el-table-column label="尺码" min-width="90"><template #default="{ row }"><el-input v-model="row.size" size="small" :disabled="bizDisabled" placeholder="如 38码" /></template></el-table-column>
          <el-table-column label="数量(件)" width="96"><template #default="{ row }"><el-input v-model="row.qty" type="number" :min="0" size="small" :disabled="bizDisabled" @input="onRoundCalc(row)" /></template></el-table-column>
          <el-table-column label="寄样日期" width="150"><template #default="{ row }"><el-date-picker v-model="row.shipDate" type="date" value-format="YYYY-MM-DD" size="small" style="width:100%" :disabled="bizDisabled" /></template></el-table-column>
          <el-table-column label="寄样单号" min-width="110"><template #default="{ row }"><el-input v-model="row.shipNo" size="small" :disabled="bizDisabled" /></template></el-table-column>
          <el-table-column label="寄回日期" width="150"><template #default="{ row }"><el-date-picker v-model="row.returnDate" type="date" value-format="YYYY-MM-DD" size="small" style="width:100%" :disabled="!pmEnabled" placeholder="版师填" /></template></el-table-column>
          <el-table-column label="工价单价" width="100"><template #default="{ row }"><el-input v-model="row.laborUnitPrice" type="number" :min="0" size="small" :disabled="!pmEnabled" placeholder="版师填" @input="onRoundCalc(row)" /></template></el-table-column>
          <el-table-column label="工价金额" width="100"><template #default="{ row }"><el-input :model-value="roundAmount(row)" size="small" readonly /></template></el-table-column>
          <el-table-column label="备注" min-width="90"><template #default="{ row }"><el-input v-model="row.remark" size="small" /></template></el-table-column>
        </el-table>
        <el-row :gutter="16" style="margin-top:12px">
          <el-col :span="24">
            <el-form-item label="样衣意见附件">
              <file-upload v-model="form.feedbackAttachments" multiple accept="image/*,.pdf" :disabled="readonly" tip="客户反馈图/PDF,可多文件(业务/版师均可上传)" />
            </el-form-item>
          </el-col>
        </el-row>
        <div class="hint">💡 版师填各轮「数量 + 工价单价」保存后,工价合计自动生成对账单 → 联动付款申请。</div>
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
import { errToast } from '@/api';
import { ref, reactive, computed, onMounted, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { Back, Check, Plus, Minus, Promotion, CopyDocument, Printer, Delete, Download } from '@element-plus/icons-vue';
import { sampleApi } from '@/api/sample';
import { quoteApi } from '@/api/quote';
import { uploadApi } from '@/api/upload';
import { useAuthStore } from '@/stores/auth';
import { customerApi } from '@/api/customer';
import { factoryApi } from '@/api/factory';
import FileUpload from '@/components/FileUpload.vue';
import type { DocLink } from '@/components/DocLinks.vue'; // 仅取类型:组件已全局注册
import { printSample } from '@/utils/samplePrint';
import { exportSampleExcel } from '@/utils/sampleExcel';
import { SAMPLE_CATEGORIES, SAMPLE_STATUS_LABEL, QUOTE_STATUS_LABEL, UserRole } from '@i9/types';

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
const authStore = useAuthStore();
const patternmaker = computed(() => !!route.meta.patternmaker);
const editId = computed(() => (route.params.id ? Number(route.params.id) : null));
const modeLabel = computed(() => (readonly.value ? '查看' : patternmaker.value ? '版师编辑' : editId.value ? '编辑' : '新建'));
const bizDisabled = computed(() => readonly.value || patternmaker.value); // 业务字段：查看/版师视图只读
const pmEnabled = computed(() => patternmaker.value && !readonly.value);  // 版师字段：仅版师视图可编辑
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));

const sampleCategories = SAMPLE_CATEGORIES;
const middlemen = ref<any[]>([]);
const buyers = ref<any[]>([]);
const factories = ref<any[]>([]);
const versions = ref<any[]>([]);
const pmUsers = ref<any[]>([]);       // 制版师用户(role=PATTERNMAKER)
const pmLoadFailed = ref(false);      // 加载失败降级为文本输入

const emptyMaterial = () => ({ itemName: '', arrangeDate: '', width: '', colors: '', part: '', composition: '', codeBand: '', zipperLength: '', puller: '', qty: '', size: '', refPrice: '', actualUsage: '', supplierId: undefined, supplierName: '', image: '', remark: '' });
const form = reactive<any>({
  sampleNo: '', categories: '', middlemanId: undefined, styleNo: '', sampleSize: '', sampleQty: '', buyerId: undefined,
  patternmakerId: undefined, patternmakerName: '', maker: authStore.realName || '', makeDate: new Date().toISOString().slice(0, 10),
  shipSampleDate: '', recipient: '', fileLocation: '', garmentRemark: '', feedbackAttachments: '',
  image1: '', image2: '', image3: '', materialShipNo: '', materialShipDate: '',
  returnNo: '', returnDate: '', pieceCount: '', laborUnitPrice: '', status: '',
  materials: [emptyMaterial()],
  shipRounds: [] as any[],
});

const emptyRound = () => ({ size: '', qty: '', shipDate: '', shipNo: '', returnDate: '', laborUnitPrice: '', laborAmount: '', remark: '' });

const categoryList = computed({
  get: () => (form.categories ? String(form.categories).split(',').filter(Boolean) : []),
  set: (v: string[]) => { form.categories = v.join(','); },
});
const laborAmount = computed(() => {
  const p = Number(form.pieceCount), u = Number(form.laborUnitPrice);
  return p && u ? (p * u).toFixed(2) : (form.laborAmount ?? '');
});
const statusLabel = computed(() => (SAMPLE_STATUS_LABEL as any)[form.status] ?? '');

// 寄样多轮:每轮金额=数量×单价;合计供顶层展示(后端亦 Σ 回填对账)
const roundAmount = (row: any) => {
  const q = Number(row.qty), u = Number(row.laborUnitPrice);
  return q && u ? (q * u).toFixed(2) : '';
};
const onRoundCalc = (row: any) => { row.laborAmount = roundAmount(row); };
const shipRoundsTotal = computed(() => form.shipRounds.reduce((s: number, r: any) => s + (Number(roundAmount(r)) || 0), 0).toFixed(2));
const shipRoundsQty = computed(() => form.shipRounds.reduce((s: number, r: any) => s + (Number(r.qty) || 0), 0));

const formRef = ref<FormInstance>();
const saving = ref(false);
const selMaterials = ref<any[]>([]);
const selectedRounds = ref<any[]>([]);
function addRound() { form.shipRounds.push(emptyRound()); }
function removeRounds() {
  form.shipRounds = form.shipRounds.filter((r: any) => !selectedRounds.value.includes(r));
}
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
// 行级生成采购(样衣稿🟠按钮 B方案):打样材料→无合同对账单,直接进对账付款
async function doPurchase(row: any) {
  if (!row.id) { ElMessage.warning('新加的行请先保存样衣后再生成采购'); return; }
  if (!(Number(row.qty) > 0) || !(Number(row.refPrice) > 0)) {
    ElMessage.warning('请先填写该行的 数量 与 参考价格'); return;
  }
  try {
    await ElMessageBox.confirm(
      `将为「${row.itemName}」生成打样材料对账单：${row.qty} × ${row.refPrice} = ${(Number(row.qty) * Number(row.refPrice)).toFixed(2)} 元（供应商：${row.supplierName || '未选'}），进入对账→付款流程。`,
      '生成采购', { confirmButtonText: '生成', cancelButtonText: '取消', type: 'info' },
    );
  } catch { return; }
  try {
    const res: any = await sampleApi.purchaseMaterial(Number(editId.value), row.id);
    const d = res?.data ?? res;
    ElMessage.success(`已生成对账单 ${d.reconcile_no ?? ''}，可在「对账管理」提交复核`);
  } catch (e: any) {
    errToast(e?.response?.data?.msg ?? e?.response?.data?.msg ?? '生成失败');
  }
}

function onSupplier(row: any, id: number) { row.supplierName = factories.value.find((f) => f.id === id)?.name ?? ''; }
function onPatternmaker(id?: number) {
  const u = pmUsers.value.find((x) => x.id === id);
  form.patternmakerName = u ? (u.real_name || u.username) : '';
}
const actionLabel = (a: string) => ({ CREATE: '创建', UPDATE: '修改', PUSH: '推送版师', PATTERNMAKER_SAVE: '版师保存', SHIP: '已寄出', COMPLETE: '已完成', COPY: '复制' } as any)[a] ?? a;

// 下游·报价单 chips(1:N)
const relatedQuotes = ref<Array<{ id: number; no: string; status: string }>>([]);
const docLinks = computed<DocLink[]>(() => {
  if (!editId.value) return []; // 新建页没有关联单据可列
  return relatedQuotes.value.map((q) => ({
    key: `quote-${q.id}`,
    type: q.status === 'ORDERED' ? 'success' : 'primary',
    text: `报价单 ${q.no}${(QUOTE_STATUS_LABEL as any)[q.status] ? ` · ${(QUOTE_STATUS_LABEL as any)[q.status]}` : ''}`,
    to: { name: 'QuoteEdit', params: { id: q.id } },
  }));
});

// 反查下游报价单：后端无「按样衣查报价」端点，故借款号(style_no)模糊搜一批，再按 sample_id 精确过滤。
// 精确过滤兜底 → 不会串到别的样衣；只可能漏（报价款号事后被改），宁漏不错。
// 同一款号下的不同sample_id会被滤掉，故不会把别张样衣的报价单挂到这张上。
// 版师视图跳过（报价对版师不可见，会 403）
async function loadRelatedQuotes() {
  relatedQuotes.value = [];
  if (!editId.value || !form.styleNo || patternmaker.value) return;
  try {
    const res: any = await quoteApi.list({ style_no: form.styleNo, page: 1, size: 100 });
    relatedQuotes.value = (((res?.data ?? []) as any[]) ?? [])
      .filter((q) => q?.quote_no && String(q.sample_id) === String(editId.value))
      .map((q) => ({ id: q.id, no: q.quote_no, status: q.status }));
  } catch { relatedQuotes.value = []; /* 反查失败就不显示这组 chip,不阻断页面 */ }
}

async function loadRefs() {
  const [ms, bs, fs] = await Promise.all([
    customerApi.list({ page: 1, size: 100, type: 'MIDDLEMAN' }),
    customerApi.list({ page: 1, size: 100, type: 'BUYER' }),
    factoryApi.select(),
  ]);
  middlemen.value = (ms as any).data ?? [];
  buyers.value = (bs as any).data ?? [];
  factories.value = (((fs as any).data ?? fs) as any[]) ?? [];
  // 制版师下拉(role=PATTERNMAKER);加载失败/无数据 → 降级为文本输入
  try {
    const us: any = await sampleApi.listPatternmakers();
    // id 归一成数字:主键 bigint 经 mysql2 出来是字符串,而 load() 回显用 Number(d.patternmaker_id),
    // 两边类型不一致时 el-select 匹配不到选项 → 回显裸 ID(归一惯例同 FactorySelect)
    pmUsers.value = (((us.data ?? us) ?? []) as any[]).map((u) => ({ ...u, id: Number(u.id) }));
    if (!pmUsers.value.length) pmLoadFailed.value = true;
  } catch { pmLoadFailed.value = true; }
}

// 选项 size:100 截断兜底:当前选中值可能不在已载入的前 100 条选项里 → 按 id 单独补拉入选项,避免回显裸 ID;
// 补拉失败(机密未授权/记录已删)则维持原样,最多回显裸 ID,与修复前行为一致,不阻断页面
async function ensureRefOption(options: any[], id: unknown) {
  if (id === null || id === undefined || id === '') return;
  if (options.some((o) => String(o.id) === String(id))) return;
  try {
    const res: any = await customerApi.get(Number(id));
    const c = res.data ?? res;
    if (c?.id !== null && c?.id !== undefined) options.unshift(c);
  } catch { /* 无选项可补,维持现状 */ }
}

async function load() {
  if (!editId.value) return;
  const res: any = await sampleApi.get(editId.value);
  const d = res.data ?? res;
  Object.assign(form, {
    sampleNo: d.sample_no, categories: d.categories ?? '', middlemanId: d.customer_id, styleNo: d.style_no,
    sampleSize: d.sample_size ?? '', sampleQty: d.sample_qty ?? '',
    buyerId: d.buyer_id ?? undefined, patternmakerId: d.patternmaker_id != null ? Number(d.patternmaker_id) : undefined,
    patternmakerName: d.patternmaker_name ?? '', maker: d.maker ?? '',
    makeDate: d.make_date ?? '', shipSampleDate: d.ship_sample_date ?? '', recipient: d.recipient ?? '',
    fileLocation: d.file_location ?? '', garmentRemark: d.garment_remark ?? '', feedbackAttachments: d.feedback_attachments ?? '',
    image1: d.image1 ?? '', image2: d.image2 ?? '', image3: d.image3 ?? '',
    materialShipNo: d.material_ship_no ?? '', materialShipDate: d.material_ship_date ?? '',
    returnNo: d.return_no ?? '', returnDate: d.return_date ?? '', pieceCount: d.piece_count ?? '',
    laborUnitPrice: d.labor_unit_price ?? '', laborAmount: d.labor_amount ?? '', status: d.status,
    materials: d.materials?.length ? d.materials.map((m: any) => ({
      id: m.id, itemName: m.item_name, arrangeDate: m.arrange_date ?? '', image: m.image ?? '', width: m.width, colors: m.colors, part: m.part,
      composition: m.composition, codeBand: m.code_band, zipperLength: m.zipper_length, puller: m.puller,
      qty: m.qty, size: m.size, refPrice: m.ref_price, actualUsage: m.actual_usage,
      supplierId: m.supplier_id ?? undefined, supplierName: m.supplier_name, remark: m.remark,
    })) : [emptyMaterial()],
    // 寄样多轮(后端已把存量单值合成第一轮)
    shipRounds: (d.shipRounds ?? []).map((r: any) => ({
      size: r.size ?? '', qty: r.qty ?? '', shipDate: r.ship_date ?? '', shipNo: r.ship_no ?? '',
      returnDate: r.return_date ?? '', laborUnitPrice: r.labor_unit_price ?? '',
      laborAmount: r.labor_amount ?? '', remark: r.remark ?? '',
    })),
  });
  // 中间商/买家下拉 size:100 截断兜底:当前选中值不在选项里时单独按 id 补拉(见 ensureRefOption)
  await Promise.all([
    ensureRefOption(middlemen.value, form.middlemanId),
    ensureRefOption(buyers.value, form.buyerId),
  ]);
  void loadRelatedQuotes(); // 不 await:关联单据反查不该拖住主表单
  const vs: any = await sampleApi.getVersionHistory(editId.value);
  versions.value = (vs.data ?? vs) ?? [];
}

function buildDto() {
  return {
    categories: form.categories, middlemanId: form.middlemanId, styleNo: form.styleNo,
    sampleSize: form.sampleSize || undefined,
    sampleQty: form.sampleQty === '' || form.sampleQty === null ? undefined : Number(form.sampleQty),
    buyerId: form.buyerId, patternmakerId: form.patternmakerId || undefined,
    patternmakerName: form.patternmakerName || undefined, maker: form.maker || undefined,
    shipSampleDate: form.shipSampleDate || undefined, recipient: form.recipient || undefined,
    fileLocation: form.fileLocation || undefined, garmentRemark: form.garmentRemark || undefined,
    feedbackAttachments: form.feedbackAttachments ?? '',
    image1: form.image1 || undefined, image2: form.image2 || undefined, image3: form.image3 || undefined,
    materials: form.materials.filter((m: any) => m.itemName).map((m: any, i: number) => ({ ...m, sortOrder: i })),
    shipRounds: buildRounds(),
  };
}

// 寄样多轮序列化(空行剔除;数字规整;金额=数量×单价)
function buildRounds() {
  return form.shipRounds
    .filter((r: any) => r.size || r.qty !== '' || r.shipDate || r.shipNo || r.laborUnitPrice !== '')
    .map((r: any, i: number) => ({
      sortOrder: i, roundNo: i + 1, size: r.size || undefined,
      qty: r.qty === '' || r.qty == null ? undefined : Number(r.qty),
      shipDate: r.shipDate || undefined, shipNo: r.shipNo || undefined,
      returnDate: r.returnDate || undefined,
      laborUnitPrice: r.laborUnitPrice === '' || r.laborUnitPrice == null ? undefined : Number(r.laborUnitPrice),
      laborAmount: Number(roundAmount(r)) || undefined, remark: r.remark || undefined,
    }));
}

async function save() {
  await formRef.value?.validate();
  const dto = buildDto();
  if (!dto.materials.length) { ElMessage.error('材料明细至少 1 行且品名必填'); return; }
  saving.value = true;
  try {
    let id = editId.value;
    if (id) { await sampleApi.update(id, dto); ElMessage.success('更新成功'); }
    else { const r: any = await sampleApi.create(dto); id = Number((r.data ?? r)?.id); ElMessage.success('创建成功'); }
    // 设计稿页面事件:填「材料寄出单号」保存即自动推送版师(待派单 → 打样中)
    const wasPending = editId.value ? form.status === 'PENDING' : true; // 新建后必为待派单
    if (id && form.materialShipNo && wasPending) {
      try {
        await sampleApi.push(id, { materialShipNo: form.materialShipNo });
        ElMessage.success('已自动推送版师(打样中)');
        if (editId.value) { await load(); return; } // 停留当前页并刷新
      } catch (e: any) {
        errToast(e?.response?.data?.msg ?? '自动推送版师失败');
      }
    }
    router.push({ name: 'Samples' });
  } catch (e: any) {
    errToast(e?.response?.data?.msg ?? '保存失败');
  } finally { saving.value = false; }
}

// 标记已寄出 / 标记完成(此前接口在但界面无入口,已寄出/已完成两态在 UI 不可达)
async function markShipped() {
  if (!editId.value) return;
  try { await sampleApi.ship(editId.value); ElMessage.success('已标记寄出'); load(); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '操作失败'); }
}
async function markComplete() {
  if (!editId.value) return;
  try { await sampleApi.complete(editId.value); ElMessage.success('样衣已完成'); load(); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '操作失败'); }
}
// 材料行图片上传(设计稿:每行材料图片)
async function uploadMatImage(option: any, row: any) {
  try {
    const res: any = await uploadApi.upload(option.file as File);
    row.image = (res.data ?? res)?.url ?? '';
    option.onSuccess?.(res);
  } catch (e: any) { ElMessage.error('上传失败'); option.onError?.(e); }
}
async function pushPatternmaker() {
  if (!editId.value) return;
  try {
    await sampleApi.push(editId.value, { patternmakerName: form.patternmakerName || undefined, materialShipNo: form.materialShipNo || undefined });
    ElMessage.success('已推送版师工作台（状态→打样中）');
    load();
  } catch (e: any) { errToast(e?.response?.data?.msg ?? '推送失败'); }
}

async function savePatternmaker() {
  if (!editId.value) return;
  // 软校验:实际耗用全空时提醒确认(可继续保存)
  const noUsage = form.materials.every((m: any) => m.actualUsage === '' || m.actualUsage === null || m.actualUsage === undefined);
  if (noUsage) {
    try { await ElMessageBox.confirm('实际耗用尚未填写,确认保存?', '提示', { type: 'warning' }); } catch { return; }
  }
  saving.value = true;
  try {
    await sampleApi.patternmakerSave(editId.value, {
      materials: form.materials.filter((m: any) => m.id).map((m: any) => ({ id: m.id, actualUsage: m.actualUsage === '' ? undefined : Number(m.actualUsage), zipperLength: m.zipperLength })),
      returnNo: form.returnNo || undefined,
      // 版师按轮填工价(#5):提交多轮,后端 Σ 回填顶层工价 → 生成对账单
      shipRounds: buildRounds(),
      feedbackAttachments: form.feedbackAttachments ?? '',
    });
    ElMessage.success('版师保存成功');
    router.push({ name: 'Samples' });
  } catch (e: any) {
    errToast(e?.response?.data?.msg ?? '保存失败');
  } finally { saving.value = false; }
}

async function copy() {
  if (!editId.value) return;
  try { const r: any = await sampleApi.copy(editId.value); ElMessage.success('已复制'); router.push({ name: 'SampleEdit', params: { id: (r.data ?? r).id } }); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '复制失败'); }
}
// 删除(仅管理员;仅待派单可删,被报价引用后端拦截)
async function removeSample() {
  if (!editId.value) return;
  try { await ElMessageBox.confirm('确认删除该样衣?仅「待派单」状态可删,此操作不可恢复。', '删除样衣', { type: 'warning' }); } catch { return; }
  try { await sampleApi.remove(editId.value); ElMessage.success('已删除'); router.push({ name: 'Samples' }); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '删除失败'); }
}
// 打印/PDF(A4;材料明细脱敏,不含参考价格)
async function print() {
  if (!editId.value) return;
  try { const res: any = await sampleApi.get(editId.value); printSample(res.data ?? res); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? e?.message ?? '打印失败'); }
}
// 导出 Excel(基本信息+材料明细,.xls)
async function exportExcel() {
  if (!editId.value) return;
  try { const res: any = await sampleApi.get(editId.value); exportSampleExcel(res.data ?? res); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? e?.message ?? '导出失败'); }
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
:deep(.section-badge) { font-size: 13px; color: #C8901E; background: #fff; padding: 1px 8px; border-radius: 10px; }
:deep(.section-body) { padding: 14px; }
.subtable-ops { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.subtable-ops .hint, .hint { font-size: 13px; color: var(--el-text-color-secondary); }
.subtable-ops .hint { margin-left: auto; }
.mat-photo { display: flex; align-items: center; gap: 4px; }
.mat-thumb { width: 32px; height: 26px; border-radius: 3px; border: 1px solid var(--el-border-color); }
</style>
