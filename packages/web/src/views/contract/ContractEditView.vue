<template>
  <div class="edit-page" v-loading="loading">
    <!-- 工具栏：标题 + 状态 + 门户进度 + 操作按钮（设计稿 04 v1.3 编辑页顶栏） -->
    <div class="toolbar-card">
      <div class="head-row">
        <div class="head-left">
          <el-button link @click="goBack">← 返回列表</el-button>
          <span class="page-title">{{ pageTitle }}</span>
          <el-tag size="small" :type="portalTagType(form.portal_status)">{{ portalLabel(form.portal_status) }}</el-tag>
          <el-tag v-if="form.approval_status === 'PENDING'" type="warning" size="small">待审批</el-tag>
        </div>
        <div class="head-right">
          <el-button v-if="editable" type="primary" :loading="saving" @click="save">💾 保存</el-button>
          <el-button v-if="!editable && contractId" :loading="saving" @click="saveRemarkOnly">保存备注</el-button>
          <el-button v-if="editable" @click="importDialogVisible = true">{{ isProcess ? '🏭 选订单款号带入' : '🔵 选订单款号带入' }}</el-button>
          <el-button v-if="contractId && form.portal_status === 'DRAFT'" type="warning" plain @click="doPush">
            📤 {{ isProcess ? '推送工厂' : '推送供应商' }}
          </el-button>
          <el-button v-if="contractId" @click="doPrint">📄 生成 PDF</el-button>
          <el-button v-if="contractId && form.type === 'MATERIAL'" plain @click="goSupplement">🧩 补料</el-button>
          <el-button v-if="contractId" plain @click="goCopy">复制</el-button>
        </div>
      </div>
      <!-- 门户进度：待推送 ▸ 待盖章 ▸ 待发货 ▸ 待对账 ▸ 待开票（设计稿 E1） -->
      <el-steps :active="portalStep" simple class="portal-steps">
        <el-step title="待推送" /><el-step title="待盖章" /><el-step title="待发货" /><el-step title="待对账" /><el-step title="待开票" />
      </el-steps>
      <el-alert v-if="!editable && contractId" type="warning" :closable="false" show-icon
        title="合同已推送/盖章，关键字段已锁定（仅备注可改）；如需修改请先在列表「撤销推送」回草稿。" />
    </div>

    <RuleHint>合同分材料/加工两类,甲乙丙方按类型区分;<b>推送或盖章后关键字段锁定、仅备注可改</b>(需改先撤销推送回草稿);定金+中期+尾款须=100%;发货地址默认带加工厂地址、可改;<b>担保人身份证等敏感附件加密存储、限授权可见</b>。</RuleHint>
    <!-- ▣ 合同基础信息 -->
    <div class="section-card">
      <h3 class="sec-title">▣ 合同基础信息 <span class="sec-sub">{{ isProcess ? '受托方(加工厂) / 委托方(本司)' : '含甲方(供方) / 乙方(需方) / 丙方(担保)' }}</span></h3>
      <el-form :model="form" label-width="130px" :disabled="!editable">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="合同编号"><el-input :model-value="form.contract_no || '（保存后自动生成）'" disabled /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="合同类型"><el-input :model-value="typeLabel(form.type)" disabled /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="关联订单" required>
              <el-select v-model="form.order_id" filterable placeholder="选择订单" style="width:100%" :disabled="!!contractId || isSupplement" @change="onOrderChange">
                <el-option v-for="o in orders" :key="o.id" :label="`${o.order_no} · ${o.style_no || ''}`" :value="o.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item :label="isProcess ? '签订地址' : '签约地点'"><el-input v-model="form.sign_place" placeholder="默认本司地址" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item :label="isProcess ? '签订日期' : '签约日期'"><el-date-picker v-model="form.sign_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item :label="isProcess ? '受托方(加工厂)' : '甲方(供方)'" required>
              <el-select v-model="form.factory_id" filterable :placeholder="isProcess ? '从工厂资料选加工厂' : '从工厂资料选供应商'" style="width:100%">
                <el-option v-for="f in filteredFactories" :key="f.id" :label="`${f.factory_no} · ${f.name}`" :value="f.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item :label="isProcess ? '受托方地址' : '甲方住所'"><el-input :model-value="selectedFactory?.address || '—'" disabled /></el-form-item></el-col>
          <el-col :span="8"><el-form-item :label="isProcess ? '受托方代表/电话' : '甲方代表/电话'"><el-input :model-value="factoryContact" disabled /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item :label="isProcess ? '委托方(本司)' : '乙方(需方)'">
              <el-select v-model="form.company_id" placeholder="本司主体（多抬头）" style="width:100%">
                <el-option v-for="c in companies" :key="c.id" :label="c.name + (c.is_default ? '（默认）' : '')" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item :label="isProcess ? '委托方代表' : '乙方代表'"><el-input v-model="form.company_rep" placeholder="默认当前业务（登录人），可改" /></el-form-item></el-col>
          <el-col v-if="isProcess" :span="8"><el-form-item label="交货期限"><el-date-picker v-model="form.delivery_deadline" type="date" value-format="YYYY-MM-DD" style="width:100%" placeholder="默认=订单交期−10天" /></el-form-item></el-col>
          <el-col v-else :span="8"><el-form-item label="发货地址"><el-input v-model="form.ship_to_address" placeholder="默认该款对应加工厂地址，可调整/手填（v1.3）" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="担保人(丙方)"><el-input v-model="form.guarantor" placeholder="个人担保方，一般留空" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="担保人身份证照片">
              <div class="photo-cell">
                <el-image v-if="guarantorPhotoView" :src="guarantorPhotoView" :preview-src-list="[guarantorPhotoView]" fit="cover" class="thumb" />
                <el-upload :show-file-list="false" :http-request="(o: any) => uploadTo(o, (url) => (form.guarantor_id_photo = url), true)" accept="image/*" :disabled="!editable">
                  <el-button size="small" plain>📎 {{ form.guarantor_id_photo ? '重新上传' : '点选上传(选填)' }}</el-button>
                </el-upload>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="6"><el-form-item label="币种"><el-select v-model="form.currency" style="width:100%"><el-option label="CNY" value="CNY" /><el-option label="USD" value="USD" /></el-select></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="定金%"><el-input-number v-model="form.deposit_ratio" :min="0" :max="100" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="中期%"><el-input-number v-model="form.mid_ratio" :min="0" :max="100" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="尾款%"><el-input-number v-model="form.final_ratio" :min="0" :max="100" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="账期(天)"><el-input-number v-model="form.account_period_days" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="最后发货日"><el-date-picker v-model="form.last_ship_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="备注"><el-input v-model="form.remark" :disabled="false" /></el-form-item></el-col>
        </el-row>
        <div class="ratio-hint" :class="{ bad: ratioSum !== 100 }">定金+中期+尾款 = {{ ratioSum }}%（须=100%）</div>
      </el-form>
    </div>

    <!-- ▣ 关联款号（多选，D2） -->
    <div class="section-card">
      <h3 class="sec-title">▣ 关联款号（多选） <span class="sec-sub">同一订单内多选款号，带出对应{{ isProcess ? '款式' : '材料' }}</span></h3>
      <div class="style-tags">
        <el-tag v-for="s in styleNoList" :key="s" closable :disable-transitions="true" @close="removeStyleNo(s)" class="style-tag">☑ {{ s }}</el-tag>
        <el-input v-if="styleInputVisible" ref="styleInputRef" v-model="styleInputValue" size="small" style="width:160px" @keyup.enter="confirmStyleNo" @blur="confirmStyleNo" />
        <el-button v-else-if="editable" size="small" @click="showStyleInput">＋ 添加款号…</el-button>
      </div>
    </div>

    <!-- ▣ 货物明细 -->
    <div class="section-card">
      <h3 class="sec-title">▣ 货物明细
        <span class="sec-sub">{{ isProcess ? '款式/数量/交期，填单价算总价' : '按分色/分码出表 · 数量取订单采购量(含损耗) · 交货期限默认该款交期−45天' }}</span>
      </h3>
      <div v-if="editable" class="line-btns">
        <el-button size="small" @click="addLine">＋ 添加行</el-button>
        <el-button size="small" :disabled="!selectedLines.length" @click="removeSelectedLines">— 删除</el-button>
        <el-button size="small" type="primary" plain @click="importDialogVisible = true">📥 从订单带入</el-button>
      </div>
      <el-table :data="form.materials" border size="small" @selection-change="(v: any[]) => (selectedLines = v)">
        <el-table-column v-if="editable" type="selection" width="40" />
        <el-table-column type="index" label="#" width="44" />
        <template v-if="!isProcess">
          <el-table-column label="品名" min-width="130"><template #default="{ row }"><el-input v-model="row.item_name" size="small" :disabled="!editable" /></template></el-table-column>
          <el-table-column label="规格" min-width="110"><template #default="{ row }"><el-input v-model="row.spec" size="small" :disabled="!editable" /></template></el-table-column>
          <el-table-column label="颜色" width="90"><template #default="{ row }"><el-input v-model="row.color" size="small" :disabled="!editable" /></template></el-table-column>
          <el-table-column label="尺码/码" width="84"><template #default="{ row }"><el-input v-model="row.size" size="small" placeholder="—" :disabled="!editable" /></template></el-table-column>
        </template>
        <template v-else>
          <el-table-column label="货号" width="130"><template #default="{ row }"><el-input v-model="row.style_no" size="small" :disabled="!editable" /></template></el-table-column>
          <el-table-column label="品名及规格" min-width="160"><template #default="{ row }"><el-input v-model="row.item_name" size="small" :disabled="!editable" /></template></el-table-column>
        </template>
        <el-table-column label="单位" width="76"><template #default="{ row }"><el-input v-model="row.unit" size="small" :disabled="!editable" /></template></el-table-column>
        <el-table-column label="数量" width="110">
          <template #default="{ row }">
            <el-tooltip :content="`数量来源：${row.qty_source || '手填'}（可微调、不回写订单）`" placement="top">
              <el-input-number v-model="row.qty" :min="0" :precision="2" size="small" :controls="false" style="width:100%" :disabled="!editable" />
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column :label="isProcess ? '加工单价(RMB) ✏️' : '单价(元)'" width="150">
          <template #default="{ row }">
            <div style="display:flex;align-items:center;gap:2px">
              <el-input-number v-model="row.unit_price" :min="0" :precision="4" size="small" :controls="false" style="flex:1" :disabled="!editable" />
              <el-tooltip content="取历史同款价(最近合同,P3#41)" placement="top">
                <el-button v-if="editable" link size="small" @click="fetchPriceHint(row)">🕘</el-button>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="isProcess ? '总价(RMB)' : '小计(元)'" width="110" align="right">
          <template #default="{ row }">{{ lineAmount(row) }}</template>
        </el-table-column>
        <template v-if="!isProcess">
          <el-table-column label="款号" width="120"><template #default="{ row }"><el-input v-model="row.style_no" size="small" :disabled="!editable" /></template></el-table-column>
        </template>
        <el-table-column :label="isProcess ? '交期' : '交货期限'" width="140">
          <template #default="{ row }"><el-date-picker v-model="row.delivery_date" type="date" value-format="YYYY-MM-DD" size="small" style="width:100%" :disabled="!editable" /></template>
        </el-table-column>
        <el-table-column v-if="!isProcess" label="照片" width="96">
          <template #default="{ row }">
            <div class="photo-cell">
              <el-image v-if="row.photo_url" :src="row.photo_url" :preview-src-list="[row.photo_url]" fit="cover" class="thumb-sm" />
              <el-upload v-if="editable" :show-file-list="false" :http-request="(o: any) => uploadTo(o, (url) => (row.photo_url = url))" accept="image/*">
                <el-button size="small" link>📷</el-button>
              </el-upload>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="totals-row">
        <span v-if="isProcess">合计数量：<b>{{ totalQty }}</b>　</span>
        总价合计：<b class="grand">{{ form.currency }} {{ totalAmount.toFixed(2) }}</b>
      </div>
    </div>

    <!-- ▣ 价格包含项（加工合同，设计稿 D4） -->
    <div v-if="isProcess" class="section-card">
      <h3 class="sec-title">▣ 价格包含项（勾选） <span class="sec-sub">取自真实加工合同「以上价格包含…」写法；仅汇入 PDF 文字不改金额</span></h3>
      <el-checkbox-group v-model="form.price_includes" :disabled="!editable">
        <el-checkbox v-for="p in PRICE_INCLUDE_OPTIONS" :key="p" :value="p" :label="p" />
      </el-checkbox-group>
      <div class="price-extra">
        <span class="excl">☒ 胶袋（默认不含）</span>
        <span>增值税 <el-input-number v-model="form.vat_rate" :min="0" :max="100" :precision="2" size="small" :controls="false" style="width:80px" :disabled="!editable" /> %（含，不另计）</span>
        <el-input v-model="form.price_other" placeholder="其他（手填补充包含/不含说明）" style="width:320px" size="small" :disabled="!editable" />
      </div>
    </div>

    <!-- ▣ 合同条款（模板 · 可配置填空，设计稿 D3） -->
    <div class="section-card">
      <h3 class="sec-title">▣ 合同条款（模板 · 可配置） <span class="sec-sub">基础模板大部分固定，填空处可改；保存后随合同归档</span></h3>
      <div v-for="t in termDefs" :key="t.key" class="term-row">
        <div class="term-label">{{ t.label }} <el-tag v-if="t.critical" type="danger" size="small" effect="plain">关键</el-tag><el-tag v-else size="small" effect="plain" type="info">模板</el-tag></div>
        <el-input v-model="terms[t.key]" type="textarea" autosize :disabled="!editable" />
      </div>
      <div v-if="form.guarantor" class="term-row">
        <div class="term-label">丙方担保条款 <el-tag type="warning" size="small" effect="plain">自动</el-tag></div>
        <div class="term-auto">已填担保人「{{ form.guarantor }}」——生成 PDF 时自动插入丙方连带责任担保条款（设计稿 D7）。</div>
      </div>
    </div>

    <!-- ▣ 落款 · 盖章 -->
    <div class="section-card">
      <h3 class="sec-title">▣ 落款 · 盖章 <span class="sec-sub">电子章自动贴 PDF 落款（业务诉求）；也可上传纸质盖章合同照片</span></h3>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item :label="isProcess ? '受托方代表' : '甲方代表'">{{ selectedFactory?.contact_name || '—' }}</el-descriptions-item>
        <el-descriptions-item :label="isProcess ? '委托方代表' : '乙方代表'">{{ form.company_rep || '—' }}</el-descriptions-item>
        <el-descriptions-item label="签约时间">{{ form.sign_date || '—' }}</el-descriptions-item>
        <el-descriptions-item label="盖章方式">① 一键电子章(自动贴PDF落款)　② 上传纸质盖章合同照片</el-descriptions-item>
        <el-descriptions-item :label="isProcess ? '受托方盖章' : '甲方盖章'">
          <template v-if="form.stamped_at"><el-tag type="success" size="small">已盖章</el-tag> {{ form.stamped_by_supplier }} · {{ String(form.stamped_at).slice(0, 19) }}</template>
          <template v-else>🖋 {{ isProcess ? '加工厂' : '供应商' }}在门户「我要盖章」处加盖（电子章自动贴 / 上传照片）</template>
        </el-descriptions-item>
        <el-descriptions-item :label="isProcess ? '委托方盖章' : '乙方盖章'">✓ 本司电子章随 PDF 生成自动贴入落款</el-descriptions-item>
      </el-descriptions>
    </div>

    <!-- 选订单款号带入 -->
    <el-dialog v-model="importDialogVisible" :title="isProcess ? '选订单款号带入（款式/数量/交期）' : '选订单款号带入（材料明细 · 采购量含损耗）'" width="560px">
      <el-form label-width="90px">
        <el-form-item label="关联订单">
          <el-select v-model="importOrderId" filterable style="width:100%">
            <el-option v-for="o in orders" :key="o.id" :label="`${o.order_no} · ${o.style_no || ''}`" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="带入方式">
          <el-radio-group v-model="importMode">
            <el-radio value="replace">替换现有明细</el-radio>
            <el-radio value="append">追加到现有明细</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="doImport">带入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { errToast } from '@/api';
import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { contractApi } from '@/api/contract';
import { factoryApi } from '@/api/factory';
import { orderApi } from '@/api/order';
import { companyApi } from '@/api/company';
import { uploadApi } from '@/api/upload';
import { signedUrl } from '@/utils/secureFile';
import { printContract } from '@/utils/contractPrint';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const contractId = ref<number | null>(route.params.id ? Number(route.params.id) : null);
const loading = ref(false);
const saving = ref(false);

// 价格包含项选项（设计稿 04 v1.3 加工合同：真实合同写法）
const PRICE_INCLUDE_OPTIONS = ['工缴', '裁剪', '线', '后道', '运费', '纸箱', '拷贝纸', '干燥剂', '运杂费', '进仓费'];

// 条款模板（设计稿 D3：材料/加工各一套，可配置填空）
const MATERIAL_TERMS = [
  { key: 'quality', label: '第二条 质量标准', critical: false, def: '颜色：同确认样；成份：按封样；缩水率：≤3%；交货前提交 5 份样品双方签字封存。' },
  { key: 'delivery_method', label: '第三条 交货方式', critical: false, def: '由甲方运送至乙方指定地点，运费由甲方承担。' },
  { key: 'acceptance', label: '第四条 货物验收', critical: false, def: '乙方享有自主验货权；质量异议期限：6 个月。' },
  { key: 'settlement', label: '第五条 货款结算', critical: true, def: '按本合同约定账期结算（发货日 + 账期天数 = 付款到期日）。' },
  { key: 'breach', label: '第六条 违约责任', critical: false, def: '逾期交货每天 5‰，逾期超 7 天可解约；逾期付款每天 5‰。' },
  { key: 'dispute', label: '第七~八条 争议解决 / 其他', critical: false, def: '协商不成提交签订地仲裁/法院；本协议一式贰份，双方各执壹份。' },
];
const PROCESS_TERMS = [
  { key: 'price_clause', label: '加工费及价格', critical: true, def: '以上加工单价已包含「价格包含项」勾选内容，增值税含税不另计；不含项以勾选为准。' },
  { key: 'packaging', label: '包装/质量/交货', critical: false, def: '按客户要求及书面指示；受托方按委托方书面通知交至指定地点。' },
  { key: 'quality', label: '产品质量', critical: false, def: '符合品种/规格/花色/尺码规定；内在品质负责期 6 个月。' },
  { key: 'settlement', label: '结算方式', critical: true, def: '货物送达并审核无误后按账期付款；凭工厂发票 + 入库单结算。' },
  { key: 'breach_misc', label: '违约 / 变更 / 争议 / 份数', critical: false, def: '不能交货违约金 5%；委托方所在地法院管辖；一式两份各执一份。' },
];

const form = reactive<any>({
  contract_no: '', type: (route.query.type as string) || 'MATERIAL', parent_id: route.query.parent_id ? Number(route.query.parent_id) : undefined,
  order_id: route.query.order_id ? Number(route.query.order_id) : undefined,
  factory_id: undefined, company_id: undefined, company_rep: authStore.realName || '',
  sign_place: '', sign_date: new Date().toISOString().slice(0, 10),
  guarantor: '', guarantor_id_photo: '', ship_to_address: '', delivery_deadline: '',
  currency: 'CNY', deposit_ratio: 30, mid_ratio: 40, final_ratio: 30,
  account_period_days: 90, last_ship_date: '', remark: '',
  style_nos: '', price_includes: [...PRICE_INCLUDE_OPTIONS], vat_rate: 13, price_other: '',
  portal_status: 'DRAFT', approval_status: 'NONE', stamped_at: null, stamped_by_supplier: '',
  materials: [] as any[],
});
const terms = reactive<Record<string, string>>({});

const isProcess = computed(() => form.type === 'PROCESS');
const isSupplement = computed(() => form.type === 'SUPPLEMENT');
const editable = computed(() => form.portal_status === 'DRAFT');
const pageTitle = computed(() =>
  ({ MATERIAL: '材料合同 · 编辑（原料/辅料购销协议）', PROCESS: '生产加工合同 · 编辑（委托加工合同）', SUPPLEMENT: '补料合同 · 编辑' } as any)[form.type] ?? '合同编辑');
const typeLabel = (t: string) => ({ MATERIAL: '材料合同', PROCESS: '生产加工合同', SUPPLEMENT: '补料合同' } as any)[t] ?? t;
const portalLabel = (s: string) => ({ DRAFT: '草稿', PUSHED: '已推送', STAMPED: '已盖章', SHIPPING: '出货中', RECONCILED: '已对账' } as any)[s] ?? s;
const portalTagType = (s: string): any => ({ DRAFT: 'info', PUSHED: 'warning', STAMPED: 'primary', SHIPPING: 'success', RECONCILED: 'success' } as any)[s] ?? 'info';
const portalStep = computed(() => ({ DRAFT: 0, PUSHED: 1, STAMPED: 2, SHIPPING: 3, RECONCILED: 4 } as any)[form.portal_status] ?? 0);
const termDefs = computed(() => (isProcess.value ? PROCESS_TERMS : MATERIAL_TERMS));

// 引用数据
const factories = ref<any[]>([]);
const orders = ref<any[]>([]);
const companies = ref<any[]>([]);
// 甲方按工厂类型过滤（设计稿 B2）：材料合同=材料供应商(面/辅料)；加工合同=委外加工商；含附加身份
const filteredFactories = computed(() => {
  const want = isProcess.value ? ['OUTSOURCE'] : ['FABRIC', 'ACCESSORY'];
  return factories.value.filter((f: any) => {
    const types = [f.type, ...String(f.extra_types || '').split(',')].filter(Boolean);
    return types.some((t: string) => want.includes(t) || t === 'OTHER');
  });
});
const selectedFactory = computed(() => factories.value.find((f: any) => f.id === form.factory_id));
// 发货地址默认自动带加工厂地址(P3#31/rev2合同#1):为空时选厂即填,可改
watch(() => form.factory_id, () => {
  if (!form.ship_to_address && selectedFactory.value?.address) {
    form.ship_to_address = selectedFactory.value.address;
  }
});
const factoryContact = computed(() => {
  const f = selectedFactory.value;
  return f ? [f.contact_name, f.contact_phone].filter(Boolean).join(' / ') || '—' : '—';
});
const ratioSum = computed(() => (+form.deposit_ratio || 0) + (+form.mid_ratio || 0) + (+form.final_ratio || 0));

// 关联款号（逗号分隔字符串 ↔ 标签数组）
const styleNoList = computed(() => String(form.style_nos || '').split(',').map((s: string) => s.trim()).filter(Boolean));
const styleInputVisible = ref(false);
const styleInputValue = ref('');
const styleInputRef = ref();
function showStyleInput() { styleInputVisible.value = true; nextTick(() => styleInputRef.value?.focus()); }
function confirmStyleNo() {
  const v = styleInputValue.value.trim();
  if (v && !styleNoList.value.includes(v)) form.style_nos = [...styleNoList.value, v].join(',');
  styleInputVisible.value = false; styleInputValue.value = '';
}
function removeStyleNo(s: string) {
  if (!editable.value) return;
  form.style_nos = styleNoList.value.filter((x: string) => x !== s).join(',');
}

// 货物明细
const selectedLines = ref<any[]>([]);
// 历史同款价提示(P3#41/CON C3半):同款号+品名最近合同单价,点击带入
async function fetchPriceHint(row: any) {
  const styleNo = row.style_no || styleNoList.value[0] || '';
  if (!styleNo) { ElMessage.warning('请先填写款号'); return; }
  try {
    const res: any = await contractApi.priceHint(styleNo, row.item_name || undefined);
    const hints = res?.data ?? [];
    if (!hints.length) { ElMessage.info('无历史同款价格记录'); return; }
    const h = hints[0];
    await ElMessageBox.confirm(
      `历史价:${(+h.unit_price).toFixed(4)}（${h.contract_no} · ${h.item_name}）,带入当前行?`,
      '历史同款价', { confirmButtonText: '带入', cancelButtonText: '取消', type: 'info' },
    );
    row.unit_price = +h.unit_price;
  } catch { /* 取消 */ }
}

const lineAmount = (row: any) => (((+row.qty || 0) * (+row.unit_price || 0))).toFixed(2);
const totalAmount = computed(() => form.materials.reduce((s: number, m: any) => s + (+m.qty || 0) * (+m.unit_price || 0), 0));
const totalQty = computed(() => form.materials.reduce((s: number, m: any) => s + (+m.qty || 0), 0));
function addLine() {
  form.materials.push({ item_name: '', spec: '', color: '', size: '', style_no: styleNoList.value[0] || '', unit: isProcess.value ? '件' : '', qty: undefined, unit_price: undefined, delivery_date: form.delivery_deadline || '', photo_url: '', qty_source: '' });
}
function removeSelectedLines() {
  form.materials = form.materials.filter((m: any) => !selectedLines.value.includes(m));
  selectedLines.value = [];
}

// 从订单带入（设计稿：材料=用料核算采购量含损耗；加工=款式/大货数/交期−10天）
const importDialogVisible = ref(false);
const importing = ref(false);
const importOrderId = ref<number | undefined>(undefined);
const importMode = ref<'replace' | 'append'>('replace');
function minusDays(d: string | null | undefined, days: number): string {
  if (!d) return '';
  const t = new Date(String(d).slice(0, 10));
  if (isNaN(t.getTime())) return '';
  t.setDate(t.getDate() - days);
  return t.toISOString().slice(0, 10);
}
async function doImport() {
  if (!importOrderId.value) { ElMessage.warning('请选择订单'); return; }
  importing.value = true;
  try {
    const res: any = await orderApi.get(importOrderId.value);
    const od = res.data ?? res;
    if (!form.order_id) form.order_id = od.id;
    if (od.style_no && !styleNoList.value.includes(od.style_no)) form.style_nos = [...styleNoList.value, od.style_no].join(',');
    let lines: any[] = [];
    if (isProcess.value) {
      const dd = minusDays(od.delivery_date, 10);
      if (!form.delivery_deadline) form.delivery_deadline = dd;
      lines = [{ item_name: od.style_name || '加工费', style_no: od.style_no || '', unit: '件', qty: +od.qty_total || 0, unit_price: undefined, delivery_date: dd, qty_source: '大货数' }];
    } else {
      const dd = minusDays(od.delivery_date, 45);
      lines = (od.materials ?? []).map((m: any) => ({
        item_name: m.item_name,
        spec: [m.width, m.composition].filter(Boolean).join(' / '),
        color: m.color || '', size: '', style_no: od.style_no || '',
        unit: m.unit || '', qty: +(m.final_purchase ?? m.total_purchase) || 0,
        unit_price: +m.unit_price || 0, delivery_date: dd, photo_url: '', qty_source: '采购量含损耗',
      }));
      if (!lines.length) { ElMessage.warning('该订单无用料核算记录，无可带入的材料'); return; }
    }
    form.materials = importMode.value === 'replace' ? lines : [...form.materials, ...lines];
    importDialogVisible.value = false;
    ElMessage.success(`已带入 ${lines.length} 行（数量来源：${isProcess.value ? '大货数' : '采购量含损耗'}，可微调、不回写订单）`);
  } catch (e: any) { errToast(e?.response?.data?.msg ?? '带入失败'); }
  finally { importing.value = false; }
}
function onOrderChange(id: number) {
  const o = orders.value.find((x: any) => x.id === id);
  if (o?.style_no && !styleNoList.value.length) form.style_nos = o.style_no;
}

// 担保人身份证属敏感附件:缩略图/预览用短时签名链接(入库仍存原始URL)
const guarantorPhotoView = ref('');
watch(() => form.guarantor_id_photo, async (u) => {
  guarantorPhotoView.value = u ? await signedUrl(u) : '';
}, { immediate: true });

// 上传（担保人身份证 / 材料照片）
async function uploadTo(option: any, apply: (url: string) => void, sensitive = false) {
  try {
    const res: any = await uploadApi.upload(option.file as File, { sensitive });
    const url = (res.data ?? res)?.url;
    if (url) { apply(url); ElMessage.success('上传成功'); }
    option.onSuccess?.(res);
  } catch (e: any) { errToast(e?.response?.data?.msg ?? '上传失败'); option.onError?.(e); }
}

// 保存（新建 / 草稿编辑）
function buildDto(): Record<string, unknown> {
  const dto: Record<string, unknown> = {
    factory_id: form.factory_id, currency: form.currency,
    deposit_ratio: +form.deposit_ratio, mid_ratio: +form.mid_ratio, final_ratio: +form.final_ratio,
    account_period_days: form.account_period_days,
    sign_place: form.sign_place || undefined, sign_date: form.sign_date || undefined,
    company_id: form.company_id || undefined, company_rep: form.company_rep || undefined,
    guarantor: form.guarantor || undefined, guarantor_id_photo: form.guarantor_id_photo || undefined,
    delivery_deadline: form.delivery_deadline || undefined,
    ship_to_address: form.ship_to_address || undefined,
    last_ship_date: form.last_ship_date || undefined,
    style_nos: form.style_nos || undefined,
    remark: form.remark || undefined,
    terms_json: { ...terms },
    materials: form.materials.map((m: any, idx: number) => ({
      item_name: m.item_name, spec: m.spec || undefined, color: m.color || undefined, size: m.size || undefined,
      style_no: m.style_no || undefined, delivery_date: m.delivery_date || undefined, photo_url: m.photo_url || undefined,
      unit: m.unit || undefined, qty: +m.qty || 0, unit_price: +m.unit_price || 0,
      qty_source: m.qty_source || undefined, sort_order: idx,
    })),
  };
  if (isProcess.value) {
    dto.price_includes = form.price_includes;
    dto.vat_rate = +form.vat_rate;
    dto.price_other = form.price_other || undefined;
  }
  return dto;
}
function validateForm(): string | null {
  if (!form.factory_id) return isProcess.value ? '请选择受托方（加工厂）' : '请选择甲方（供方）';
  if (!form.order_id) return '请选择关联订单';
  if (!styleNoList.value.length) return '至少关联 1 个款号';
  if (!form.materials.length) return '货物明细至少 1 行';
  const bad = form.materials.find((m: any) => !m.item_name || !(+m.qty > 0));
  if (bad) return '货物明细：品名必填、数量须大于 0';
  if (ratioSum.value !== 100) return '定金+中期+尾款须等于 100%';
  return null;
}
async function save() {
  const err = validateForm();
  if (err) { ElMessage.warning(err); return; }
  saving.value = true;
  try {
    if (contractId.value) {
      await contractApi.update(contractId.value, buildDto());
      ElMessage.success('保存成功');
      await loadDetail(contractId.value);
    } else {
      const dto = { ...buildDto(), type: form.type, order_id: form.order_id, parent_id: form.parent_id };
      const res: any = await contractApi.create(dto);
      const created = res.data ?? res;
      ElMessage.success(`创建成功：${created.contract_no}`);
      contractId.value = created.id;
      router.replace(`/contracts/${created.id}/edit`);
      await loadDetail(created.id);
    }
  } catch (e: any) { errToast(e?.response?.data?.msg ?? '保存失败'); }
  finally { saving.value = false; }
}
async function saveRemarkOnly() {
  if (!contractId.value) return;
  saving.value = true;
  try { await contractApi.update(contractId.value, { remark: form.remark || '' }); ElMessage.success('备注已保存（其余字段已锁定）'); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '保存失败'); }
  finally { saving.value = false; }
}

async function doPush() {
  if (!contractId.value) return;
  try {
    await contractApi.push(contractId.value);
    ElMessage.success(`已推送至${isProcess.value ? '工厂' : '供应商'}门户`);
    await loadDetail(contractId.value);
  } catch (e: any) {
    const msg = e?.response?.data?.msg ?? '推送失败';
    if (String(msg).includes('审批')) { ElMessage.warning(msg + '（已转入待审批，主管审批通过后可推送）'); await loadDetail(contractId.value); }
    else ElMessage.error(msg);
  }
}
async function doPrint() {
  if (!contractId.value) return;
  try {
    const res: any = await contractApi.get(contractId.value);
    const detail = res.data ?? res;
    let company: any = companies.value.find((c: any) => c.id === detail.company_id)
      ?? companies.value.find((c: any) => c.is_default) ?? null;
    printContract(detail, selectedFactory.value ?? factories.value.find((f: any) => f.id === detail.factory_id), company ?? undefined);
  } catch (e: any) { ElMessage.error(e?.message ?? '生成失败'); }
}
function goSupplement() { router.push(`/contracts/new?type=SUPPLEMENT&parent_id=${contractId.value}&copy_from=${contractId.value}`); }
function goCopy() { router.push(`/contracts/new?type=${form.type}&copy_from=${contractId.value}`); }
function goBack() { router.push('/contracts'); }

// 装载
async function loadRefs() {
  const [fs, os, cs] = await Promise.all([
    factoryApi.select(),
    orderApi.list({ page: 1, size: 100 }),
    companyApi.list().catch(() => ({ data: [] })),
  ]);
  factories.value = (((fs as any).data ?? fs) as any[]) ?? [];
  orders.value = (os as any).data ?? [];
  companies.value = ((cs as any).data ?? []) as any[];
  if (!form.company_id) form.company_id = companies.value.find((c: any) => c.is_default)?.id ?? companies.value[0]?.id;
}
function applyDetail(d: any, opts: { asCopy?: boolean; zeroQty?: boolean } = {}) {
  const keep = ['factory_id', 'order_id', 'currency', 'deposit_ratio', 'mid_ratio', 'final_ratio', 'account_period_days',
    'sign_place', 'company_id', 'company_rep', 'guarantor', 'guarantor_id_photo', 'delivery_deadline',
    'ship_to_address', 'style_nos', 'price_other', 'remark'];
  for (const k of keep) if (d[k] != null) (form as any)[k] = d[k];
  form.deposit_ratio = +d.deposit_ratio; form.mid_ratio = +d.mid_ratio; form.final_ratio = +d.final_ratio;
  form.vat_rate = d.vat_rate != null ? +d.vat_rate : form.vat_rate;
  form.price_includes = Array.isArray(d.price_includes) ? d.price_includes : form.price_includes;
  form.last_ship_date = d.last_ship_date ? String(d.last_ship_date).slice(0, 10) : '';
  form.sign_date = opts.asCopy ? new Date().toISOString().slice(0, 10) : (d.sign_date ? String(d.sign_date).slice(0, 10) : form.sign_date);
  form.delivery_deadline = d.delivery_deadline ? String(d.delivery_deadline).slice(0, 10) : form.delivery_deadline;
  if (!opts.asCopy) {
    form.contract_no = d.contract_no; form.type = d.type; form.parent_id = d.parent_id ?? undefined;
    form.portal_status = d.portal_status; form.approval_status = d.approval_status;
    form.stamped_at = d.stamped_at; form.stamped_by_supplier = d.stamped_by_supplier;
  }
  const tj = d.terms_json && typeof d.terms_json === 'object' ? d.terms_json : {};
  for (const t of (form.type === 'PROCESS' ? PROCESS_TERMS : MATERIAL_TERMS)) terms[t.key] = tj[t.key] ?? t.def;
  form.materials = (d.materials ?? []).map((m: any) => ({
    item_name: m.item_name, spec: m.spec || '', color: m.color || '', size: m.size || '',
    style_no: m.style_no || '', unit: m.unit || '',
    qty: opts.zeroQty ? 0 : +m.qty, unit_price: +m.unit_price,
    delivery_date: m.delivery_date ? String(m.delivery_date).slice(0, 10) : '',
    photo_url: m.photo_url || '', qty_source: m.qty_source || '',
  }));
}
async function loadDetail(id: number) {
  const res: any = await contractApi.get(id);
  applyDetail(res.data ?? res);
}
onMounted(async () => {
  loading.value = true;
  try {
    await loadRefs();
    // 条款默认模板
    for (const t of termDefs.value) if (terms[t.key] == null) terms[t.key] = t.def;
    if (contractId.value) {
      await loadDetail(contractId.value);
    } else if (route.query.copy_from) {
      // 复制 / 补料（设计稿：补料=复制合同，编号补料-原合同号，数量默认0可改）
      const res: any = await contractApi.get(Number(route.query.copy_from));
      applyDetail(res.data ?? res, { asCopy: true, zeroQty: form.type === 'SUPPLEMENT' });
      if (form.type === 'SUPPLEMENT') ElMessage.info('补料合同：已复制原合同基础信息与材料清单，各行数量默认 0，请按实际补料量填写');
    }
    if (!form.company_rep) form.company_rep = authStore.realName || '';
  } finally { loading.value = false; }
});
</script>

<style scoped>
.edit-page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.toolbar-card, .section-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 6px; padding: 12px 16px; }
.head-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.head-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.head-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.page-title { font-size: 16px; font-weight: 600; color: #1E3A5F; }
.portal-steps { margin-top: 10px; }
.sec-title { margin: 0 0 12px; font-size: 14px; color: #1E3A5F; }
.sec-sub { font-size: 12px; color: var(--el-text-color-secondary); font-weight: 400; margin-left: 8px; }
.ratio-hint { font-size: 12px; color: #3E8E7E; margin: 2px 0 0 130px; }
.ratio-hint.bad { color: #C04042; font-weight: 600; }
.style-tags { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.style-tag { font-size: 13px; }
.line-btns { margin-bottom: 8px; display: flex; gap: 8px; }
.totals-row { margin-top: 10px; text-align: right; font-size: 13px; color: var(--el-text-color-regular); }
.totals-row .grand { color: #C04042; font-size: 16px; }
.price-extra { margin-top: 10px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; font-size: 13px; }
.price-extra .excl { color: #C04042; }
.term-row { margin-bottom: 12px; }
.term-label { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
.term-auto { font-size: 13px; color: #B8860B; background: var(--el-fill-color-light); border-radius: 4px; padding: 8px 10px; }
.photo-cell { display: flex; align-items: center; gap: 6px; }
.thumb { width: 56px; height: 40px; border-radius: 4px; border: 1px solid var(--el-border-color); }
.thumb-sm { width: 36px; height: 28px; border-radius: 3px; border: 1px solid var(--el-border-color); }
</style>
