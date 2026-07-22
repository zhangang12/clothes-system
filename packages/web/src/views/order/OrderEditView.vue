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
        <el-button v-if="editId && form.status === 'CONFIRMED'" type="warning" :icon="RefreshLeft" @click="revert">撤回下单</el-button>
        <el-dropdown v-if="editId" trigger="click" @command="onPrintOrder">
          <el-button :icon="Printer">打印<el-icon><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="customer">对客确认单（无成本）</el-dropdown-item>
              <el-dropdown-item command="factory">生产通知单（无客户/价格）</el-dropdown-item>
              <el-dropdown-item command="internal">内部单据（全量）</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown
          v-if="editId && ['CONFIRMED', 'CONTRACTED', 'PRODUCING'].includes(form.status)"
          trigger="click" @command="onGenContract"
        >
          <el-button type="warning" plain>生成合同<el-icon><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="material">材料合同（按供应商拆单）</el-dropdown-item>
              <el-dropdown-item command="process">加工合同（带入订单明细）</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 单据间快速跳转:上游报价 + 下游合同/结算/发票;只读查看时同样要显示(查看时更需跳转) -->
    <DocLinks :links="docLinks" :loading="docLinksLoading" />

    <el-alert
      v-if="flags.sourceQuoteChanged"
      type="warning" :closable="false" show-icon class="mark-alert"
      title="源报价已变更——转单后报价内容被修改过，可点「从报价导入」刷新明细（现有议价/矩阵会被覆盖，请核对）"
    />
    <el-alert
      v-if="flags.usageEstimated"
      type="warning" :closable="false" show-icon class="mark-alert"
      title="单耗为预估——关联样衣未填实测耗用，用料核算基于预估值，请在实测后复核"
    />

    <RuleHint><b>报价数量不导入订单</b>,请在「尺码数量搭配」矩阵补录,矩阵合计自动回填大货总数;材料供应商只能<b>从工厂库选(限面/辅料)</b>;最终采购量偏离系统值超±10%需二次确认;只有草稿状态可保存。</RuleHint>
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
              <el-select v-model="form.factoryId" filterable clearable placeholder="从委外加工商选(可后填)" style="width:100%">
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

      <!-- 尺码数量搭配（按 PO 号 · 可 Excel 导入，设计稿 03 v1.0 修订④） -->
      <section-block title="▣ 尺码数量搭配（按 PO 号 · 可 Excel 导入）" badge="行=款·色·尺码，列=各PO；总计回填大货总数">
        <div v-if="!readonly" class="subtable-ops">
          <el-button size="small" :icon="Plus" @click="addMatrixRow">加款·色·尺码行</el-button>
          <el-button size="small" :icon="Minus" :disabled="!selSizes.length" @click="delMatrixRows">删除行</el-button>
          <el-button size="small" @click="addPoCol">＋ 加 PO 列</el-button>
          <el-button size="small" type="primary" plain @click="excelDialog = true">📋 Excel 导入</el-button>
          <span class="hint">一个 PO = 一列（目的地/收货人作列头）；TOTAL QTY = 该款·色·码跨 PO 合计</span>
        </div>
        <div class="table-scroll">
          <el-table :data="form.matrix.rows" size="small" border show-summary v-keynav :summary-method="matrixSummary" @selection-change="(v: any[]) => selSizes = v">
            <el-table-column v-if="!readonly" type="selection" width="38" />
            <el-table-column label="款号" min-width="120"><template #default="{ row }"><el-input v-model="row.style_no" size="small" :disabled="readonly" /></template></el-table-column>
            <el-table-column label="颜色" width="110"><template #default="{ row }"><DictSelect v-model="row.color" type="color" size="small" placeholder="字典选" :disabled="readonly" /></template></el-table-column>
            <!-- 洗标号/Article：工厂据此区分标类（用户反馈①）。跟着颜色走，同色通常同一洗标号 -->
            <el-table-column label="洗标号/Article" width="130">
              <template #default="{ row }"><el-input v-model="row.article" size="small" placeholder="洗标号" :disabled="readonly" /></template>
            </el-table-column>
            <el-table-column label="尺码" width="100"><template #default="{ row }"><DictSelect v-model="row.size" type="size" size="small" placeholder="字典选" :disabled="readonly" /></template></el-table-column>
            <el-table-column v-for="(p, pi) in form.matrix.pos" :key="pi" :min-width="130" align="center">
              <template #header>
                <div class="po-head">
                  <el-input v-model="p.po_no" size="small" placeholder="PO号" :disabled="readonly" />
                  <DictSelect v-model="p.destination" type="destination" size="small" placeholder="目的地(台账可选)" :disabled="readonly" />
                  <DictSelect v-model="p.consignee" type="consignee" size="small" placeholder="收货人(台账可选)" :disabled="readonly" />
                  <el-button v-if="!readonly && form.matrix.pos.length > 1" link type="danger" size="small" @click="delPoCol(pi)">删列</el-button>
                </div>
              </template>
              <template #default="{ row }">
                <el-input v-model="row.qtys[pi]" size="small" type="number" :disabled="readonly" />
              </template>
            </el-table-column>
            <el-table-column label="TOTAL QTY" width="100" align="right">
              <template #default="{ row }"><b>{{ rowTotal(row) }}</b></template>
            </el-table-column>
          </el-table>
        </div>
        <!-- 总数量搭配（不分 PO，系统自动汇总） -->
        <div v-if="summaryRows.length" class="matrix-summary">
          <div class="summary-title">📊 总数量搭配（不分 PO · 系统按款·色·码汇总所有 PO）</div>
          <el-table :data="summaryRows" size="small" border>
            <el-table-column prop="style_no" label="款号" min-width="120" />
            <el-table-column prop="color" label="颜色" width="100" />
            <el-table-column prop="size" label="尺码" width="90" />
            <el-table-column prop="qty" label="数量" width="100" align="right" />
          </el-table>
        </div>
      </section-block>

      <!-- 附件档案 5 类 -->
      <section-block title="▣ 附件档案" badge="5 类 · 多文件">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="彩稿"><file-upload v-model="form.att1" multiple :disabled="readonly" accept="image/*,application/pdf" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="大货尺寸表"><file-upload v-model="form.att2" multiple :disabled="readonly" accept="image/*,application/pdf,.xlsx,.xls" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="大货纸板"><file-upload v-model="form.att3" multiple :disabled="readonly" accept="image/*,application/pdf" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="包装资料"><file-upload v-model="form.att4" multiple :disabled="readonly" accept="image/*,application/pdf" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="填充量"><file-upload v-model="form.att5" multiple :disabled="readonly" accept="image/*,application/pdf,.xlsx,.xls" /></el-form-item></el-col>
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
          <el-table :data="form.materials" size="small" border v-keynav @selection-change="(v: any[]) => selMats = v">
            <el-table-column type="expand" width="30">
              <template #default="{ row }">
                <div class="split-preview">
                  <template v-if="row.splitMode !== 'NONE'">
                    <div class="split-title">分{{ row.splitMode === 'BY_COLOR' ? '色' : '码' }}出量（{{ row.splitMode === 'BY_COLOR' ? '某色该料量=该色数量' : '某码该料量=该码数量' }}×单件耗用×(1+损耗率)；生成材料合同时按此分行）</div>
                    <el-table :data="splitPreview(row)" size="small" border style="max-width:560px">
                      <el-table-column prop="key" :label="row.splitMode === 'BY_COLOR' ? '颜色' : '尺码'" width="120" />
                      <el-table-column prop="groupQty" label="件数" width="100" align="right" />
                      <el-table-column prop="qty" label="该料采购量" width="130" align="right" />
                      <el-table-column prop="formula" label="公式" min-width="200" />
                    </el-table>
                    <div v-if="!splitPreview(row).length" class="hint">尺码数量搭配暂无{{ row.splitMode === 'BY_COLOR' ? '颜色' : '尺码' }}数据，先在上方矩阵填写</div>
                  </template>
                  <span v-else class="hint">该料不拆分（整单量核算）；选「按颜色/按尺码」后此处按矩阵出分行预览</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column type="selection" width="38" />
            <el-table-column label="品名" min-width="130" fixed><template #default="{ row }"><el-input v-model="row.itemName" size="small" /></template></el-table-column>
            <el-table-column label="部位" width="90"><template #default="{ row }"><el-input v-model="row.part" size="small" /></template></el-table-column>
            <el-table-column label="门幅/尺寸" width="100"><template #default="{ row }"><el-input v-model="row.width" size="small" /></template></el-table-column>
            <el-table-column label="颜色" width="90"><template #default="{ row }"><el-input v-model="row.color" size="small" /></template></el-table-column>
            <el-table-column label="成份" width="100"><template #default="{ row }"><el-input v-model="row.composition" size="small" /></template></el-table-column>
            <el-table-column label="供应商" min-width="130"><template #default="{ row }"><el-select v-model="row.supplier" size="small" filterable clearable placeholder="从工厂库选(面/辅料)" style="width:100%"><el-option v-for="f in supplierFactories" :key="f.id" :label="f.name" :value="f.name" /></el-select></template></el-table-column>
            <el-table-column label="单位" width="70"><template #default="{ row }"><el-input v-model="row.unit" size="small" /></template></el-table-column>
            <el-table-column label="单价(元)" width="90"><template #default="{ row }"><el-input v-model="row.unitPrice" size="small" type="number" /></template></el-table-column>
            <el-table-column label="取整" width="92"><template #default="{ row }"><el-select v-model="row.roundUp" size="small" style="width:100%" clearable placeholder="自动"><el-option label="强制取整" :value="1" /><el-option label="不取整" :value="0" /></el-select></template></el-table-column>
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

    <!-- Excel 导入尺码数量搭配（设计稿 03：4 步 · 含 PO 维度） -->
    <el-dialog v-model="excelDialog" title="Excel 导入尺码数量搭配" width="680px">
      <div class="excel-steps">
        <p>① 下载固定模板（列：款号/颜色/洗标号/尺码 + 各「PO号|目的地|收货人」列），用 Excel 打开按客户排期填好；旧版无洗标号的模板仍可导入；</p>
        <p>② 保存为 CSV（Excel 另存为 → CSV UTF-8）后上传；③ 系统校验（款号/尺码/数值，异常行红色标出）；④ 确认入库生成搭配表。</p>
      </div>
      <div class="excel-ops">
        <el-button size="small" @click="downloadTemplate">📥 下载模板（含当前矩阵）</el-button>
        <input ref="csvFileRef" type="file" accept=".csv,text/csv" style="display:none" @change="onCsvPicked" />
        <el-button size="small" type="primary" plain @click="csvFileRef?.click()">📤 上传 CSV</el-button>
      </div>
      <template v-if="excelPreview">
        <div class="excel-check" :class="{ bad: excelErrors.length }">
          {{ excelErrors.length ? `✗ 发现 ${excelErrors.length} 处异常，请修正后重新上传：` : `✓ 校验通过：${excelPreview.rows.length} 行 × ${excelPreview.pos.length} 个 PO，总计 ${excelTotal}` }}
        </div>
        <ul v-if="excelErrors.length" class="excel-errors"><li v-for="(e, i) in excelErrors.slice(0, 8)" :key="i">{{ e }}</li></ul>
        <el-table v-else :data="excelPreview.rows.slice(0, 6)" size="small" border>
          <el-table-column prop="style_no" label="款号" min-width="110" />
          <el-table-column prop="color" label="颜色" width="90" />
          <el-table-column prop="article" label="洗标号" width="110" />
          <el-table-column prop="size" label="尺码" width="80" />
          <el-table-column v-for="(p, pi) in excelPreview.pos" :key="pi" :label="p.po_no" width="100" align="right">
            <template #default="{ row }">{{ row.qtys[pi] || 0 }}</template>
          </el-table-column>
        </el-table>
      </template>
      <template #footer>
        <el-button @click="excelDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!excelPreview || !!excelErrors.length" @click="confirmExcel">确认入库</el-button>
      </template>
    </el-dialog>

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
import { errToast } from '@/api';
import { ref, reactive, computed, onMounted, h } from 'vue';
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { Back, Check, Plus, Minus, Download, Promotion, ArrowDown, Printer, RefreshLeft } from '@element-plus/icons-vue';
import { orderApi } from '@/api/order';
import DictSelect from '@/components/DictSelect.vue';
import { printOrder } from '@/utils/orderPrint';
import { contractApi } from '@/api/contract';
import { quoteApi } from '@/api/quote';
import { settlementApi } from '@/api/settlement';
import { exportInvoiceApi } from '@/api/exportInvoice';
import { factoryApi } from '@/api/factory';
import FileUpload from '@/components/FileUpload.vue';
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

// 三套脱敏打印(P3#32)。弹窗被浏览器拦截时 printOrder 会抛错,须 catch 提示用户允许弹窗(同报价/样衣侧)
async function onPrintOrder(mode: string) {
  if (!editId.value) return;
  try { const res: any = await orderApi.get(editId.value); printOrder(res.data ?? res, mode as any); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? e?.message ?? '打印失败'); }
}

// 生成合同入口（设计稿 合同 A1 主流程:订单侧拆单）
async function onGenContract(cmd: string) {
  if (cmd === 'process') {
    router.push({ path: '/contracts/new', query: { type: 'PROCESS', order_id: editId.value } });
    return;
  }
  try {
    await ElMessageBox.confirm(
      '将按订单「用料核算」中的供应商分组，每个供应商各生成一张材料合同草稿（分色/分码材料按尺码矩阵拆行）。',
      '生成材料合同', { type: 'info', confirmButtonText: '生成', cancelButtonText: '取消' },
    );
  } catch { return; }
  try {
    const res: any = await contractApi.generateFromOrder(Number(editId.value));
    const d = res?.data ?? res;
    const unmatched: string[] = d?.unmatched ?? [];
    if (d?.created) ElMessage.success(`已生成 ${d.created} 张材料合同草稿`);
    if (unmatched.length) {
      ElMessageBox.alert(
        `以下供应商未在工厂库中登记，对应材料未生成合同：${unmatched.join('、')}。请先在基础资料·工厂库补录后重试。`,
        '部分供应商未匹配', { type: 'warning' },
      );
    } else if (!d?.created) {
      ElMessage.warning('没有可生成的材料行');
    }
    if (d?.created) router.push({ path: '/contracts', query: { order_id: editId.value } });
  } catch (e: any) {
    errToast(e?.response?.data?.msg ?? e?.response?.data?.msg ?? '生成失败');
  }
}
// 只读=查看路由,或订单非草稿(非草稿仅可看不可改,与后端"只有草稿可编辑"一致,防误操作)
const readonly = computed(() => !!route.meta.readonly || (!!editId.value && !!form.status && form.status !== 'DRAFT'));
const editId = computed(() => (route.params.id ? Number(route.params.id) : null));
const modeLabel = computed(() => (readonly.value ? '查看' : editId.value ? '编辑' : '新建'));

const quotes = ref<any[]>([]);
const factories = ref<any[]>([]);
const supplierFactories = ref<any[]>([]);
const INT_UNITS = ['个', '条', '只', '件', '粒', '套', '对', 'pcs', 'PCS', 'PC'];

// 尺码数量搭配矩阵（设计稿 03：行=款·色·尺码，列=各 PO（PO号/目的地/收货人），格=数量）
const emptyPo = () => ({ po_no: '', destination: '', consignee: '' });
const emptyMatrixRow = (poCount: number) => ({ style_no: '', color: '', article: '', size: '', qtys: Array(poCount).fill('') });
const emptyMat = () => ({ itemName: '', part: '', width: '', color: '', composition: '', supplier: '', unit: '', unitPrice: '', netUsage: '', lossRate: 3, splitMode: 'NONE', finalPurchase: '', roundUp: null, remark: '' });
const form = reactive<any>({
  orderNo: '', quoteId: undefined, customerPo: '', styleNo: '', unitPrice: '', currency: 'USD',
  deliveryDate: '', commissionRate: 0, factoryId: undefined, middlemanName: '', buyerName: '',
  salesperson: '', makeDate: new Date().toISOString().slice(0, 10), splitMode: 'NONE', status: '',
  att1: '', att2: '', att3: '', att4: '', att5: '',
  matrix: { pos: [emptyPo()], rows: [emptyMatrixRow(1)] }, materials: [emptyMat()],
});

const rowTotal = (row: any) => (row.qtys ?? []).reduce((s: number, q: any) => s + (Number(q) || 0), 0);
const qtyTotal = computed(() => form.matrix.rows.reduce((s: number, r: any) => s + rowTotal(r), 0));
// 表尾：各 PO 合计 + 总计（设计稿：改动实时重算）
// 固定列数不手写死，以模板列定义为单一来源：「各PO合计」放「款号」列下，PO 列从「尺码」列之后开始。
// （曾因模板新增「洗标号/Article」列而此处写死的 3/4 未同步，整行错位一列——增删固定列务必只改模板）
function matrixSummary({ columns }: any) {
  const labelIdx = columns.findIndex((c: any) => c.label === '款号');
  const poStart = columns.findIndex((c: any) => c.label === '尺码') + 1;
  return columns.map((_: any, i: number) => {
    if (i === labelIdx) return '各PO合计';
    if (i < poStart) return '';
    if (i === columns.length - 1) return String(qtyTotal.value);
    const pi = i - poStart;
    return String(form.matrix.rows.reduce((s: number, r: any) => s + (Number(r.qtys?.[pi]) || 0), 0));
  });
}
// 总数量搭配（不分 PO）：按款·色·码汇总所有 PO（设计稿：回填大货总数量）
const summaryRows = computed(() => {
  const map = new Map<string, any>();
  for (const r of form.matrix.rows) {
    const qty = rowTotal(r);
    if (!qty) continue;
    const key = `${r.style_no}|${r.color}|${r.size}`;
    const cur = map.get(key) ?? { style_no: r.style_no, color: r.color, size: r.size, qty: 0 };
    cur.qty += qty;
    map.set(key, cur);
  }
  return [...map.values()];
});
// 分色/分码出量预览（设计稿：某色该料量 = 该色数量×单件耗用×(1+损耗率)；整数类向上取整）
function splitPreview(mat: any) {
  const dim = mat.splitMode === 'BY_COLOR' ? 'color' : 'size';
  const groups = new Map<string, number>();
  for (const r of form.matrix.rows) {
    const key = String(r[dim] ?? '').trim();
    const qty = rowTotal(r);
    if (!key || !qty) continue;
    groups.set(key, (groups.get(key) ?? 0) + qty);
  }
  const per = Number(mat.netUsage) || 0;
  const loss = 1 + (Number(mat.lossRate) || 0) / 100;
  const shouldRound = mat.roundUp === 1 || mat.roundUp === 0 ? mat.roundUp === 1 : !!(mat.unit && INT_UNITS.includes(mat.unit));
  return [...groups].map(([key, groupQty]) => {
    let qty = groupQty * per * loss;
    qty = shouldRound ? Math.ceil(qty) : +qty.toFixed(2);
    return { key, groupQty, qty, formula: `${groupQty} × ${per} × ${loss.toFixed(2)}${shouldRound ? ' ↑取整' : ''}` };
  });
}
const statusLabel = computed(() => (ORDER_STATUS_LABEL as any)[form.status] ?? '');
function sysPurchase(row: any) {
  const per = (Number(row.netUsage) || 0) * (1 + (Number(row.lossRate) || 0) / 100);
  let v = qtyTotal.value * per;
  const shouldRound = row.roundUp === 1 || row.roundUp === 0
    ? row.roundUp === 1
    : !!(row.unit && INT_UNITS.includes(row.unit));
  v = shouldRound ? Math.ceil(v) : +v.toFixed(2);
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

function addMatrixRow() { form.matrix.rows.push(emptyMatrixRow(form.matrix.pos.length)); }
function delMatrixRows() {
  form.matrix.rows = form.matrix.rows.filter((r: any) => !selSizes.value.includes(r));
  if (!form.matrix.rows.length) form.matrix.rows.push(emptyMatrixRow(form.matrix.pos.length));
}
function addPoCol() {
  form.matrix.pos.push(emptyPo());
  for (const r of form.matrix.rows) r.qtys.push('');
}
function delPoCol(pi: number) {
  form.matrix.pos.splice(pi, 1);
  for (const r of form.matrix.rows) r.qtys.splice(pi, 1);
}
function addMat() { form.materials.push(emptyMat()); }
function delMats() { form.materials = form.materials.filter((r: any) => !selMats.value.includes(r)); if (!form.materials.length) form.materials.push(emptyMat()); }

async function loadRefs() {
  // 生产工厂只选「委外加工商」(设计稿 订单 B3)；材料供应商从工厂库全量点选(设计稿 订单 B9)
  const [qs, fs, allF] = await Promise.all([
    quoteApi.list({ page: 1, size: 100 }),
    factoryApi.select('OUTSOURCE'),
    factoryApi.select('FABRIC,ACCESSORY'), // 材料供应商只可从工厂库点选且限面/辅料(总览走查P1#13)
  ]);
  quotes.value = (qs as any).data ?? [];
  factories.value = (((fs as any).data ?? fs) as any[]) ?? [];
  supplierFactories.value = (((allF as any).data ?? allF) as any[]) ?? [];
}
const flags = reactive({ sourceQuoteChanged: false, usageEstimated: false });

// —— 关联单据(单据间快速跳转)——
const quoteNo = ref('');
const relContracts = ref<any[]>([]);
const relSettlements = ref<any[]>([]);
const relInvoices = ref<any[]>([]);
const docLinksLoading = ref(false);

const docLinks = computed(() => {
  const out: Array<{ key: string; text: string; to: RouteLocationRaw; type: 'primary' | 'success' | 'warning' | 'info' }> = [];
  // 上游·报价:quote_no 拿不到也要出链接,退化成 ID 兜底(合同无 /view 路由,ContractEdit 兼作查看)
  if (form.quoteId) {
    out.push({
      key: `q${form.quoteId}`, type: 'primary',
      text: quoteNo.value ? `报价 ${quoteNo.value}` : `报价 #${form.quoteId}`,
      to: { name: 'QuoteEdit', params: { id: form.quoteId } },
    });
  }
  // 下游·合同:一张订单可有多张(材料/加工/补料)
  for (const c of relContracts.value) {
    out.push({
      key: `c${c.id}`, type: 'warning',
      text: `合同 ${c.contract_no || `#${c.id}`}`,
      to: { name: 'ContractEdit', params: { id: c.id } },
    });
  }
  for (const s of relSettlements.value) {
    out.push({
      key: `s${s.id}`, type: 'success',
      text: `结算 ${s.settlement_no || `#${s.id}`}`,
      to: { name: 'SettlementView', params: { id: s.id } },
    });
  }
  for (const i of relInvoices.value) {
    out.push({
      key: `i${i.id}`, type: 'info',
      text: `发票 ${i.invoice_no || `#${i.id}`}`,
      to: { name: 'ExportInvoiceView', params: { id: i.id } },
    });
  }
  return out;
});

// 三组下游反查并发发出且各自独立降级:某组失败/后端过滤未就绪只丢该组 chip,不拖垮其它组与主表单
async function loadDocLinks() {
  if (!editId.value) return; // 新建页没有关联单据
  const id = editId.value;
  docLinksLoading.value = true;
  try {
    // 列表响应被 ResponseInterceptor 展开({items,total,...} → data=items),故数组取 res.data
    const rows = (r: PromiseSettledResult<any>) =>
      (r.status === 'fulfilled' && Array.isArray(r.value?.data) ? r.value.data : []);
    const [cs, ss, is] = await Promise.allSettled([
      contractApi.list({ order_id: id, page: 1, size: 100 }),
      settlementApi.list({ order_id: id, page: 1, size: 100 }),
      exportInvoiceApi.list({ order_id: id, page: 1, size: 100 }),
    ]);
    // 后端若尚未支持 ?order_id= 会返回全量,故再按 order_id 兜一道(字段缺失的行放行)
    const mine = (r: any) => r?.order_id == null || +r.order_id === id;
    relContracts.value = rows(cs).filter(mine);
    relSettlements.value = rows(ss).filter(mine);
    // 发票的 order_id 挂在款项行上(一票多款),主表无此列,故按 items 判定
    relInvoices.value = rows(is).filter((v: any) =>
      !Array.isArray(v?.items) || v.items.some((it: any) => +it.order_id === id));
  } finally {
    docLinksLoading.value = false;
  }
}

async function load() {
  if (!editId.value) return;
  const res: any = await orderApi.get(editId.value);
  const d = res.data ?? res;
  flags.sourceQuoteChanged = !!d.source_quote_changed;
  flags.usageEstimated = !!d.usage_estimated;
  quoteNo.value = d.quote_no ?? '';
  // 矩阵装载：新结构 {pos,rows(qtys[])} 直接用；旧平铺行 {style,color,size,po,dest,qty} 自动升级为 PO 列
  const md = d.matrix?.matrix_data;
  let matrix = { pos: [emptyPo()], rows: [emptyMatrixRow(1)] };
  if (Array.isArray(md?.pos) && Array.isArray(md?.rows)) {
    matrix = {
      pos: md.pos.length ? md.pos : [emptyPo()],
      rows: md.rows.length
        ? md.rows.map((r: any) => ({ style_no: r.style_no ?? '', color: r.color ?? '', article: r.article ?? '', size: r.size ?? '', qtys: [...(r.qtys ?? [])].concat(Array(Math.max(0, (md.pos.length || 1) - (r.qtys?.length ?? 0))).fill('')) }))
        : [emptyMatrixRow(md.pos.length || 1)],
    };
  } else if (Array.isArray(md?.rows) && md.rows.length) {
    const poNames: string[] = [...new Set(md.rows.map((r: any) => String(r.po || '').trim()))] as string[];
    const pos = poNames.map((p) => ({ po_no: p || '（未填PO）', destination: md.rows.find((r: any) => (r.po || '') === p)?.dest ?? '', consignee: '' }));
    matrix = {
      pos: pos.length ? pos : [emptyPo()],
      rows: md.rows.map((r: any) => {
        const qtys = Array(Math.max(pos.length, 1)).fill('');
        const pi = Math.max(0, poNames.indexOf(String(r.po || '').trim()));
        qtys[pi] = r.qty ?? '';
        return { style_no: r.style ?? r.style_no ?? '', color: r.color ?? '', article: r.article ?? '', size: r.size ?? '', qtys };
      }),
    };
  }
  Object.assign(form, {
    orderNo: d.order_no, quoteId: d.quote_id ?? undefined, customerPo: d.customer_po ?? '', styleNo: d.style_no ?? '',
    unitPrice: d.unit_price ?? '', currency: d.currency ?? 'USD', deliveryDate: d.delivery_date ?? '',
    commissionRate: d.commission_rate ?? 0, factoryId: d.factory_id ?? undefined, middlemanName: d.middleman_name ?? '',
    buyerName: d.buyer_name ?? '', salesperson: d.salesperson ?? '', makeDate: d.make_date ?? '', splitMode: d.split_mode ?? 'NONE', status: d.status,
    att1: d.att_artwork ?? '', att2: d.att_sizechart ?? '', att3: d.att_board ?? '', att4: d.att_packing ?? '', att5: d.att_filling ?? '',
    matrix,
    materials: d.materials?.length ? d.materials.map((m: any) => ({
      itemName: m.item_name, part: m.part, width: m.width, color: m.color, composition: m.composition,
      supplier: m.supplier, unit: m.unit, unitPrice: m.unit_price ?? '', netUsage: m.net_usage, lossRate: m.loss_rate, splitMode: m.split_mode ?? 'NONE',
      finalPurchase: m.final_purchase ?? '', roundUp: m.round_up ?? null, remark: m.remark,
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
    att_artwork: form.att1 || undefined, att_sizechart: form.att2 || undefined, att_board: form.att3 || undefined,
    att_packing: form.att4 || undefined, att_filling: form.att5 || undefined,
    matrix_data: {
      pos: form.matrix.pos.map((p: any) => ({ po_no: p.po_no, destination: p.destination, consignee: p.consignee })),
      rows: form.matrix.rows
        .filter((r: any) => rowTotal(r) > 0 || r.style_no || r.color || r.size || r.article)
        .map((r: any) => ({ style_no: r.style_no, color: r.color, article: r.article, size: r.size, qtys: r.qtys.map((q: any) => Number(q) || 0) })),
    },
    materials: form.materials.filter((m: any) => m.itemName).map((m: any, i: number) => ({
      item_name: m.itemName, part: m.part, width: m.width, color: m.color, composition: m.composition,
      supplier: m.supplier, unit: m.unit, unit_price: num(m.unitPrice), net_usage: num(m.netUsage), loss_rate: num(m.lossRate) ?? 3,
      split_mode: m.splitMode, final_purchase: num(m.finalPurchase),
      round_up: m.roundUp === 1 || m.roundUp === 0 ? m.roundUp : undefined, sort_order: i,
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
    errToast(e?.response?.data?.msg ?? '保存失败（新建订单需先从报价导入带出客户）');
  } finally { saving.value = false; }
}
// ===== Excel(CSV) 导入尺码数量搭配（设计稿 03：模板→上传→校验→确认入库） =====
const excelDialog = ref(false);
const csvFileRef = ref<HTMLInputElement>();
const excelPreview = ref<{ pos: any[]; rows: any[] } | null>(null);
const excelErrors = ref<string[]>([]);
const excelTotal = computed(() => (excelPreview.value?.rows ?? []).reduce((s: number, r: any) => s + rowTotal(r), 0));
const csvCell = (v: any) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function downloadTemplate() {
  const pos = form.matrix.pos.filter((p: any) => p.po_no) .length ? form.matrix.pos : [{ po_no: 'PO-0001', destination: '目的地', consignee: '收货人' }];
  const head = ['款号', '颜色', '洗标号', '尺码', ...pos.map((p: any) => `${p.po_no || 'PO'}|${p.destination || ''}|${p.consignee || ''}`)];
  const dataRows = form.matrix.rows.filter((r: any) => r.style_no || rowTotal(r) > 0);
  const body = (dataRows.length ? dataRows : [{ style_no: form.styleNo || 'KH-0001', color: '黑色', article: '', size: 'S', qtys: [] }])
    .map((r: any) => [r.style_no, r.color, r.article ?? '', r.size, ...pos.map((_: any, pi: number) => r.qtys?.[pi] ?? '')]);
  const csv = '﻿' + [head, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `尺码数量搭配-${form.styleNo || '模板'}.csv`; a.click();
  URL.revokeObjectURL(url);
}
// 轻量 CSV 解析（支持引号包裹/转义引号）
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let cur = ''; let row: string[] = []; let inQ = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}
function onCsvPicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    excelErrors.value = []; excelPreview.value = null;
    const grid = parseCsv(String(reader.result ?? ''));
    if (grid.length < 2) { excelErrors.value = ['文件为空或只有表头']; return; }
    const head = grid[0].map((h) => h.trim());
    // 洗标号是后加的列：新模板为 款号/颜色/洗标号/尺码+PO…，老模板(无洗标号)仍须能导入，
    // 否则客户手里已有的模板文件一夜作废。据表头自适应固定列数。
    const hasArticle = head[2] === '洗标号' || head[2] === '洗标号/Article';
    const FIXED = hasArticle ? 4 : 3;
    const sizeIdx = hasArticle ? 3 : 2;
    if (head[0] !== '款号' || head[1] !== '颜色' || head[sizeIdx] !== '尺码') {
      excelErrors.value = [`表头须为 款号/颜色/洗标号/尺码（或旧版 款号/颜色/尺码），当前:${head.slice(0, FIXED).join('/')}，请用「下载模板」的格式`]; return;
    }
    const pos = head.slice(FIXED).map((h, i) => {
      const [po_no, destination = '', consignee = ''] = h.split('|').map((x) => x.trim());
      if (!po_no) excelErrors.value.push(`第 ${i + FIXED + 1} 列 PO 表头为空（格式:PO号|目的地|收货人）`);
      return { po_no, destination, consignee };
    });
    if (!pos.length) { excelErrors.value.push('至少需要 1 个 PO 列'); return; }
    const rows = grid.slice(1).map((cells, ri) => {
      const style_no = (cells[0] ?? '').trim(); const color = (cells[1] ?? '').trim();
      const article = hasArticle ? (cells[2] ?? '').trim() : '';
      const size = (cells[sizeIdx] ?? '').trim();
      if (!style_no) excelErrors.value.push(`第 ${ri + 2} 行：款号为空`);
      if (!size) excelErrors.value.push(`第 ${ri + 2} 行：尺码为空`);
      const qtys = pos.map((_, pi) => {
        const raw = (cells[pi + FIXED] ?? '').trim();
        if (raw === '') return 0;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
          excelErrors.value.push(`第 ${ri + 2} 行「${pos[pi].po_no}」列：数量“${raw}”须为非负整数`);
          return 0;
        }
        return n;
      });
      return { style_no, color, article, size, qtys };
    });
    if (!rows.some((r) => rowTotal(r) > 0)) excelErrors.value.push('至少 1 个数量格需大于 0');
    excelPreview.value = { pos, rows };
  };
  reader.readAsText(file, 'utf-8');
  (e.target as HTMLInputElement).value = '';
}
function confirmExcel() {
  if (!excelPreview.value || excelErrors.value.length) return;
  form.matrix.pos = excelPreview.value.pos;
  form.matrix.rows = excelPreview.value.rows.map((r) => ({ ...r, qtys: [...r.qtys] }));
  excelDialog.value = false; excelPreview.value = null;
  ElMessage.success(`已生成搭配表：${form.matrix.rows.length} 行 × ${form.matrix.pos.length} 个 PO，总计 ${qtyTotal.value}（已回填大货总数量）`);
}

async function doImport() {
  if (!editId.value || !importQuoteId.value) return;
  try { await orderApi.importFromQuote(editId.value, importQuoteId.value); ElMessage.success('已从报价导入'); importDialog.value = false; load(); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '导入失败'); }
}
async function advance() {
  if (!editId.value) return;
  try { await orderApi.advance(editId.value); ElMessage.success('状态已推进'); load(); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '推进失败'); }
}
// 撤回下单（已下单→草稿，可再编辑；已生成合同起不可撤回——后端拦截）
async function revert() {
  if (!editId.value) return;
  try {
    await ElMessageBox.confirm('撤回后订单回到草稿可修改，重新下单需重走审批校验。确认撤回？', '撤回下单', { type: 'warning' });
  } catch { return; }
  try { await orderApi.revert(editId.value); ElMessage.success('已撤回为草稿，可直接修改'); load(); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? '撤回失败'); }
}
function goBack() { router.push({ name: 'Orders' }); }
// 关联单据不阻塞主表单:不 await,拉回来再渲染 chip
onMounted(async () => { await loadRefs(); await load(); void loadDocLinks(); });
</script>

<style scoped>
.edit-page { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.mark-alert { margin-bottom: 8px; }
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
:deep(.section-badge) { font-size: 13px; color: #C8901E; background: #fff; padding: 1px 8px; border-radius: 10px; }
:deep(.section-body) { padding: 14px; }
.subtable-ops { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.po-head { display: flex; flex-direction: column; gap: 3px; padding: 4px 0; }
.matrix-summary { margin-top: 12px; }
.summary-title { font-size: 14px; font-weight: 600; color: #1E3A5F; margin-bottom: 6px; }
.split-preview { padding: 8px 12px; }
.split-title { font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.excel-steps p { font-size: 14px; color: var(--el-text-color-regular); margin: 4px 0; }
.excel-ops { display: flex; gap: 8px; margin: 10px 0; }
.excel-check { font-size: 14px; color: #3E8E7E; font-weight: 600; margin-bottom: 6px; }
.excel-check.bad { color: #C04042; }
.excel-errors { margin: 0 0 8px; padding-left: 18px; font-size: 13px; color: #C04042; }
.subtable-ops .hint, .hint { font-size: 13px; color: var(--el-text-color-secondary); }
.subtable-ops .hint { margin-left: auto; }
</style>
