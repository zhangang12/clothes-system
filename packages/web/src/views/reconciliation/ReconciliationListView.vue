<template>
  <div class="page-container">
    <RuleHint>一张对账单<b>只能含同一类型合同</b>(材料或加工),不可混;补料合同对账可勾「并入原合同」;含票时<b>发票金额须=对账金额</b>(±0.01);累计实发超合同量时,复核确认须由业务填超发原因放行。</RuleHint>
    <el-card class="search-card">
      <el-form :model="query" inline>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="对账单号 / 款号" clearable style="width:180px" @clear="load" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.type" clearable placeholder="全部" style="width:120px" @change="load">
            <el-option label="合同对账" value="CONTRACT" />
            <el-option label="非合同对账" value="NO_CONTRACT" />
            <el-option label="工时对账" value="LABOR" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width:110px" @change="load">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="待复核" value="PENDING" />
            <el-option label="已确认" value="CONFIRMED" />
            <el-option label="已付款" value="PAID" />
          </el-select>
        </el-form-item>
        <el-form-item label="工厂">
          <div style="width:200px"><factory-select v-model="query.factory_id" placeholder="按名称筛选工厂" @update:model-value="load" /></div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="load">搜索</el-button>
          <el-button :icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <template #header>
        <div class="card-header">
          <span>对账单列表</span>
          <div>
            <el-button v-if="canBusiness" :icon="Coin" @click="openLabor">生成工时对账</el-button>
            <el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreate">新建对账单</el-button>
          </div>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="reconcile_no" label="对账单编号" width="180" />
        <el-table-column prop="style_no" label="款号" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.style_no || '—' }}</template>
        </el-table-column>
        <el-table-column label="发货批次" width="86" align="center">
          <template #default="{ row }">{{ row.shipment_count ? `${row.shipment_count} 批` : '—' }}</template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="typeTag(row.type)">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="工厂/版师" width="110" align="center">
          <template #default="{ row }">
            {{ row.type === 'LABOR' ? (row.patternmaker_name || '版师#' + row.patternmaker_id) : (row.factory_name || (row.factory_id ? '工厂#' + row.factory_id : '—')) }}
          </template>
        </el-table-column>
        <el-table-column prop="total_amount" label="对账金额" width="120" align="right">
          <template #default="{ row }">{{ (+row.total_amount).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="tax_rate" label="税率%" width="75" align="right">
          <template #default="{ row }">{{ row.tax_rate != null ? row.tax_rate + '%' : '--' }}</template>
        </el-table-column>
        <el-table-column prop="tax_amount" label="税额" width="100" align="right">
          <template #default="{ row }">{{ row.tax_amount != null ? (+row.tax_amount).toFixed(2) : '--' }}</template>
        </el-table-column>
        <el-table-column prop="has_invoice" label="含发票" width="75" align="center">
          <template #default="{ row }">
            <el-link v-if="row.invoice_url" type="primary" @click.stop="preview?.open(row.invoice_url, `发票 ${row.invoice_no || row.reconcile_no || ''}`)">查看</el-link>
            <el-tag v-else size="small" :type="row.has_invoice ? 'success' : 'info'">
              {{ row.has_invoice ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" fixed="right">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="150">
          <template #default="{ row }">{{ fmtDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row)">详情</el-button>
            <el-button link size="small" @click="exportRow(row)">导出Excel</el-button>
            <!-- 已确认才给：后端 createPaymentRequest 也只放行 CONFIRMED，这里提前挡掉无谓的往返 -->
            <el-button
              v-if="row.status === 'CONFIRMED' && canCreatePayment"
              link type="primary" size="small"
              @click="goCreatePayment(row)"
            >生成付款申请</el-button>
            <el-button
              v-if="row.status === 'DRAFT' && canEdit"
              link type="warning" size="small"
              @click="doSubmit(row)"
            >提交复核</el-button>
            <el-button
              v-if="row.status === 'PENDING' && canReview"
              link type="success" size="small"
              @click="doConfirm(row)"
            >复核确认</el-button>
            <el-button
              v-if="row.status === 'PENDING' && canReview"
              link type="danger" size="small"
              @click="doReject(row)"
            >整单退回</el-button>
            <!-- 无权复核时也把入口和原因露出来（2026-08-11 群里问「这个待复核从哪复核」）：
                 此前非主管看到的操作列只有「详情/导出Excel」，既找不到入口、也不知道该找谁 -->
            <el-tooltip v-if="row.status === 'PENDING' && !canReview" placement="top"
              content="复核确认需要主管或管理员操作，请转交他们处理">
              <span><el-button link size="small" disabled>复核确认（需主管）</el-button></span>
            </el-tooltip>
            <!-- 同理：草稿要先提交复核，无权时说清楚 -->
            <el-tooltip v-if="row.status === 'DRAFT' && !canEdit" placement="top"
              content="提交复核需要业务/财务/管理员操作">
              <span><el-button link size="small" disabled>提交复核（无权限）</el-button></span>
            </el-tooltip>
            <!-- 改草稿（2026-08-11 ZYT：草稿能不能改/删）。只放开发票/税率/说明，
                 批次与费用行是结构性的、改动牵扯占用释放与金额重算，建错了删掉重建更稳 -->
            <el-button
              v-if="row.status === 'DRAFT'"
              link type="primary" size="small"
              @click="openEditDraft(row)"
            >修改</el-button>
            <!-- 无权删除时说清是谁的活，别只留一个看不见的入口 -->
            <el-tooltip v-if="row.status === 'DRAFT' && !isAdmin" placement="top"
              content="删除对账单需要管理员操作；你可以先「修改」，或请管理员删除">
              <span><el-button link size="small" disabled>删除（需管理员）</el-button></span>
            </el-tooltip>
            <el-popconfirm v-if="row.status === 'DRAFT' && isAdmin" title="确认删除？" @confirm="doRemove(row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @change="load"
        />
      </div>
    </el-card>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="对账单详情" width="800px">
      <template v-if="detailData">
        <DocLinks :links="detailLinks" style="margin-bottom:12px" />
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="对账单编号">{{ detailData.reconcile_no }}</el-descriptions-item>
          <el-descriptions-item label="款号">{{ detailData.style_no || '—' }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ typeLabel(detailData.type) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTagType(detailData.status)" size="small">{{ statusLabel(detailData.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="detailData.type === 'LABOR' ? '版师' : '工厂'">
            {{ detailData.type === 'LABOR'
              ? (detailData.patternmaker_name || (detailData.patternmaker_id ? '版师#' + detailData.patternmaker_id : '--'))
              : (detailData.factory_name || (detailData.factory_id ? '工厂#' + detailData.factory_id : '--')) }}
          </el-descriptions-item>
          <el-descriptions-item label="来源合同">
            <el-link v-if="detailData.contract_id" type="primary" @click="goContract(detailData.contract_id)">
              {{ detailData.contract_no || `合同#${detailData.contract_id}` }}
            </el-link>
            <span v-else>--</span>
          </el-descriptions-item>
          <el-descriptions-item label="对账金额">{{ (+detailData.total_amount).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="税率">{{ detailData.tax_rate != null ? detailData.tax_rate + '%' : '--' }}</el-descriptions-item>
          <el-descriptions-item label="税额">{{ detailData.tax_amount != null ? (+detailData.tax_amount).toFixed(2) : '--' }}</el-descriptions-item>
          <el-descriptions-item label="发票号">{{ detailData.invoice_no ?? '--' }}</el-descriptions-item>
          <el-descriptions-item label="发票金额">{{ detailData.invoice_amount != null ? (+detailData.invoice_amount).toFixed(2) : '--' }}</el-descriptions-item>
          <el-descriptions-item label="发票差额">{{ detailData.invoice_diff != null ? (+detailData.invoice_diff).toFixed(2) : '--' }}</el-descriptions-item>
          <!-- 供应商上传的发票文件此前只入库、界面上没有任何入口（2026-08-08 King：「供应商上传发票后，在哪里看到呀？」）。
               在页面内预览（PDF 走 iframe）：开新标签页是否内联由浏览器说了算，国产浏览器多半直接下载。
               预览组件内部会换短时签名链接——供应商上传一律落 private/，裸 URL 点开必 403 -->
          <el-descriptions-item label="发票附件">
            <el-link v-if="detailData.invoice_url" type="primary" :icon="Paperclip" @click="preview?.open(detailData.invoice_url, `发票 ${detailData.invoice_no || ''}`)">查看 / 下载</el-link>
            <span v-else>--</span>
          </el-descriptions-item>
          <el-descriptions-item label="确认时间">{{ detailData.confirmed_at ?? '--' }}</el-descriptions-item>
          <el-descriptions-item v-if="detailData.review_remark" label="退回批注" :span="3">
            <span style="color:var(--el-color-danger)">{{ detailData.review_remark }}</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="detailData.over_reason" label="超发放行原因" :span="3">
            <span style="color:var(--el-color-warning)">⚠️ {{ detailData.over_reason }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <template v-if="detailData.type === 'LABOR'">
          <el-divider>工时明细（多款合并）</el-divider>
          <el-table :data="detailData.laborItems ?? []" border size="small">
            <el-table-column prop="sample_no" label="样衣编号" width="120" />
            <el-table-column prop="style_no" label="客户款号" />
            <el-table-column prop="piece_count" label="件数" width="80" align="right" />
            <el-table-column prop="labor_unit_price" label="工时单价" width="100" align="right">
              <template #default="{ row }">{{ row.labor_unit_price != null ? (+row.labor_unit_price).toFixed(2) : '--' }}</template>
            </el-table-column>
            <el-table-column prop="labor_amount" label="工时金额" width="110" align="right">
              <template #default="{ row }">{{ row.labor_amount != null ? (+row.labor_amount).toFixed(2) : '--' }}</template>
            </el-table-column>
          </el-table>
        </template>
        <template v-else-if="detailData.type === 'NO_CONTRACT'">
          <el-divider>费用明细（无合同空白对账单{{ detailData.sub_type ? '·' + subTypeLabel(detailData.sub_type) : '' }}）</el-divider>
          <el-table :data="detailData.expenseItems ?? []" border size="small">
            <el-table-column prop="expense_name" label="费用项目/事由" />
            <el-table-column prop="style_no" label="相关款号" width="110"><template #default="{ row }">{{ row.style_no || '—' }}</template></el-table-column>
            <el-table-column prop="amount" label="金额" width="120" align="right"><template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template></el-table-column>
            <el-table-column prop="attach_url" label="附件" width="90"><template #default="{ row }"><el-link v-if="row.attach_url" :href="row.attach_url" target="_blank" type="primary">查看</el-link><span v-else>—</span></template></el-table-column>
          </el-table>
        </template>
        <template v-else>
          <!-- 有扣款才显示这一块，没有的单据不平白多一张空表 -->
          <template v-if="(detailData.expenseItems ?? []).length">
            <el-divider>费用 / 扣款调整（合同保持原样，调整只发生在对账）</el-divider>
            <el-table :data="detailData.expenseItems" border size="small">
              <el-table-column prop="expense_name" label="事由" min-width="180" />
              <el-table-column prop="style_no" label="相关款号" width="110"><template #default="{ row }">{{ row.style_no || '—' }}</template></el-table-column>
              <el-table-column prop="amount" label="金额" width="120" align="right">
                <template #default="{ row }"><span :class="+row.amount < 0 ? 'ded-minus' : 'ded-plus'">{{ (+row.amount).toFixed(2) }}</span></template>
              </el-table-column>
              <el-table-column label="附件" width="110">
                <template #default="{ row }">
                  <template v-if="row.attach_url">
                    <el-link v-for="(u, i) in String(row.attach_url).split(',').filter(Boolean)" :key="i"
                      type="primary" style="margin-right:6px" @click="preview?.open(u, '扣款附件')">图{{ i + 1 }}</el-link>
                  </template>
                  <span v-else>—</span>
                </template>
              </el-table-column>
            </el-table>
            <div class="labor-sum">
              发货金额 ¥{{ (Number(detailData.total_amount) - detailDeductionTotal).toFixed(2) }}
              <span :class="detailDeductionTotal < 0 ? 'ded-minus' : 'ded-plus'">
                {{ detailDeductionTotal < 0 ? '− 扣款' : '＋ 费用' }} ¥{{ Math.abs(detailDeductionTotal).toFixed(2) }}
              </span>
              ＝ 对账金额 <b>¥{{ Number(detailData.total_amount).toFixed(2) }}</b>
            </div>
          </template>
          <el-divider>出货明细（一单多合同·批次可跳来源合同）</el-divider>
          <el-table :data="shipmentDetailRows" border size="small" :row-class-name="shipRowClass">
            <el-table-column prop="shipment_id" label="出货单ID" width="90" />
            <el-table-column prop="contract_id" label="来源合同" min-width="140">
              <template #default="{ row }">
                <!-- 出货明细行没带 contract_no（后端未 join）：等于本单合同的显示合同号，
                     跨合同的少数行才回退 #id。仍是可点链接，跳到对应合同。 -->
                <el-link v-if="row.contract_id" type="primary" @click="goContract(row.contract_id)">
                  {{ String(row.contract_id) === String(detailData.contract_id) && detailData.contract_no
                    ? detailData.contract_no : ('#' + row.contract_id) }}
                </el-link>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <el-table-column prop="style_no" label="款号" width="90">
              <template #default="{ row }">{{ row.style_no ?? '—' }}</template>
            </el-table-column>
            <el-table-column prop="item_name" label="品名">
              <template #default="{ row }">
                <!-- 逐品名行缩进显示；批次没按行填报时仍是整批一行（品名即发货单号）-->
                <span :style="row._sub ? 'padding-left:14px;color:var(--el-text-color-regular)' : ''">
                  {{ row._sub ? '└ ' : '' }}{{ row.item_name ?? '—' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="snapshot_unit_price" label="单价" width="100" align="right">
              <template #default="{ row }">{{ (+row.snapshot_unit_price).toFixed(4) }}</template>
            </el-table-column>
            <el-table-column prop="qty" label="数量" width="80" align="right" />
            <el-table-column prop="amount" label="金额" width="110" align="right">
              <template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template>
            </el-table-column>
          </el-table>
        </template>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button type="primary" :disabled="!detailData" @click="exportDetail">导出Excel</el-button>
      </template>
    </el-dialog>

    <!-- 生成工时对账弹窗：勾选同一版师的已对账样衣 -->
    <el-dialog v-model="laborVisible" title="生成工时对账（勾选多款样衣·同一版师）" width="820px">
      <el-alert
        type="info" :closable="false" show-icon style="margin-bottom:12px"
        title="仅显示「已对账」状态的样衣；一张工时对账单需为同一版师，勾选后合并金额生成待复核对账单。"
      />
      <el-table
        :data="laborSamples" v-loading="laborLoading" border size="small"
        max-height="420" @selection-change="onLaborSelect"
      >
        <el-table-column type="selection" width="46" />
        <el-table-column prop="sample_no" label="样衣编号" width="130" />
        <el-table-column prop="style_no" label="客户款号" width="120" />
        <el-table-column prop="patternmaker_name" label="版师" width="100">
          <template #default="{ row }">{{ row.patternmaker_name || ('#' + (row.patternmaker_id ?? '')) }}</template>
        </el-table-column>
        <el-table-column prop="piece_count" label="件数" width="70" align="right" />
        <el-table-column prop="labor_unit_price" label="工时单价" width="90" align="right">
          <template #default="{ row }">{{ row.labor_unit_price != null ? (+row.labor_unit_price).toFixed(2) : '--' }}</template>
        </el-table-column>
        <el-table-column prop="labor_amount" label="工时金额" width="100" align="right">
          <template #default="{ row }">{{ row.labor_amount != null ? (+row.labor_amount).toFixed(2) : '--' }}</template>
        </el-table-column>
      </el-table>
      <div class="labor-sum">已选 {{ laborSelection.length }} 款 · 合计工时金额 ¥{{ laborTotal.toFixed(2) }}</div>
      <template #footer>
        <el-button @click="laborVisible = false">取消</el-button>
        <el-button type="primary" :loading="laborSaving" :disabled="!laborSelection.length" @click="doGenerateLabor">生成工时对账单</el-button>
      </template>
    </el-dialog>

    <!-- 新建对账单弹窗 -->
    <el-dialog v-model="createVisible" title="新建对账单" width="800px" @closed="resetCreateForm">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="类型" prop="type">
              <el-select v-model="createForm.type" style="width:100%">
                <el-option label="合同对账" value="CONTRACT" />
                <el-option label="非合同对账" value="NO_CONTRACT" />
              </el-select>
            </el-form-item>
          </el-col>
          <!-- 无合同:直接按名称选工厂;合同对账:搜款号→选合同,自动带出工厂(免填数字ID) -->
          <template v-if="createForm.type === 'NO_CONTRACT'">
            <el-col :span="8">
              <el-form-item label="工厂" prop="factory_id">
                <factory-select v-model="createForm.factory_id" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="费用类型">
                <el-select v-model="createForm.subType" style="width:100%">
                  <el-option label="费用" value="EXPENSE" />
                  <el-option label="现金无票" value="CASH_NO_INVOICE" />
                  <el-option label="预付款" value="PREPAY" />
                </el-select>
              </el-form-item>
            </el-col>
          </template>
          <template v-else>
            <el-col :span="8">
              <el-form-item label="款号">
                <el-input v-model="styleSearch" placeholder="输入款号回车搜合同" clearable @keyup.enter="searchContracts" @clear="onClearStyle">
                  <template #append><el-button :loading="contractLoading" @click="searchContracts">搜合同</el-button></template>
                </el-input>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="选合同" prop="contract_id">
                <el-select v-model="createForm.contract_id" filterable clearable placeholder="先搜款号,再选合同" style="width:100%" @change="onPickContract">
                  <el-option v-for="c in styleContracts" :key="c.id" :label="contractLabel(c)" :value="c.id" />
                </el-select>
              </el-form-item>
            </el-col>
          </template>
        </el-row>
        <!-- 合同对账:选中合同后展示带出的工厂 + 补料并入原合同 -->
        <el-row v-if="createForm.type !== 'NO_CONTRACT'" :gutter="16">
          <el-col :span="24">
            <div class="picked-bar">
              <span v-if="createForm.contract_id">选中合同带出工厂：<b>{{ pickedFactoryName || ('工厂#' + createForm.factory_id) }}</b></span>
              <span v-else class="muted">尚未选择合同（先在上方搜款号）</span>
              <el-checkbox v-model="createForm.merge_into_parent" style="margin-left:16px">补料对账并入原合同（仅补料合同可勾，货款归母合同名下）</el-checkbox>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="税率%">
              <el-input-number v-model="createForm.tax_rate" :min="0" :max="100" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="发票号">
              <el-input v-model="createForm.invoice_no" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="发票金额">
              <el-input-number v-model="createForm.invoice_amount" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="createForm.description" type="textarea" :rows="2" />
        </el-form-item>

        <!-- 合同对账：出货明细（一单多合同：每批次可填各自来源合同/款号；仅同一类型合同） -->
        <template v-if="createForm.type !== 'NO_CONTRACT'">
          <el-divider>出货明细（一单多合同：每批次可填各自来源合同/款号；仅限同一类型合同）</el-divider>
          <div v-for="(s, idx) in createForm.shipments" :key="idx" class="item-row">
            <el-row :gutter="8" align="middle">
              <el-col :span="3"><el-input-number v-model="s.shipment_id" :min="1" :controls="false" placeholder="出货单ID" style="width:100%" /></el-col>
              <el-col :span="3">
                <el-select v-model="s.contract_id" filterable clearable placeholder="合同" style="width:100%">
                  <el-option v-for="c in styleContracts" :key="c.id" :label="c.contract_no" :value="c.id" />
                </el-select>
              </el-col>
              <el-col :span="3"><el-input v-model="s.style_no" placeholder="款号" /></el-col>
              <el-col :span="4"><el-input v-model="s.item_name" placeholder="品名" /></el-col>
              <el-col :span="4"><el-input-number v-model="s.snapshot_unit_price" :min="0" :precision="4" :controls="false" placeholder="单价" style="width:100%" /></el-col>
              <el-col :span="3"><el-input-number v-model="s.qty" :min="0" :precision="2" :controls="false" placeholder="数量" style="width:100%" /></el-col>
              <el-col :span="2"><span class="amount">{{ s.snapshot_unit_price && s.qty ? (s.snapshot_unit_price * s.qty).toFixed(2) : '--' }}</span></el-col>
              <el-col :span="2"><el-button link type="danger" @click="removeShipment(idx)">删</el-button></el-col>
            </el-row>
          </div>
          <el-button style="width:100%;margin-top:8px" @click="addShipment">+ 添加出货行</el-button>

          <!-- 扣款明细（#74）：已确认合同要打折/次品退货时，合同不动，在这里扣 -->
          <el-divider>费用 / 扣款调整（可不填）</el-divider>
          <div class="adj-hint">
            <b>加钱填正数</b>：运费、版费、打样费等对方垫付的；
            <b>减钱填负数</b>：打折、次品退货、短装扣款。合同不用改，调整只发生在对账。
          </div>
          <div v-for="(d, idx) in createForm.deductions" :key="'d' + idx" class="item-row">
            <el-row :gutter="8" align="top">
              <el-col :span="7"><el-input v-model="d.reason" placeholder="事由，如：运费 / 次品退货 20 件" /></el-col>
              <el-col :span="5">
                <el-input-number v-model="d.amount" :precision="2" :controls="false" placeholder="加钱正数/减钱负数" style="width:100%" />
              </el-col>
              <el-col :span="4"><el-input v-model="d.style_no" placeholder="相关款号(可空)" /></el-col>
              <el-col :span="6"><file-upload v-model="d.attach_url" :limit="3" multiple tip="照片/说明" /></el-col>
              <el-col :span="2"><el-button link type="danger" @click="removeDeduction(idx)">删</el-button></el-col>
            </el-row>
          </div>
          <el-button style="width:100%;margin-top:8px" @click="addDeduction">+ 添加费用 / 扣款行</el-button>
          <!-- 金额构成必须当场算给业务看：只显示一个总额，扣错了没人发现 -->
          <div v-if="createForm.deductions.length" class="labor-sum">
            发货金额 ¥{{ shipGoodsTotal.toFixed(2) }}
            <span :class="deductionTotal < 0 ? 'ded-minus' : 'ded-plus'">
              {{ deductionTotal < 0 ? '− 扣款' : '＋ 费用' }} ¥{{ Math.abs(deductionTotal).toFixed(2) }}
            </span>
            ＝ 对账金额 <b>¥{{ (shipGoodsTotal + deductionTotal).toFixed(2) }}</b>
          </div>
        </template>

        <!-- 无合同空白对账单：费用明细（费用项目/事由·金额·相关款号可空·附件） -->
        <template v-else>
          <el-divider>费用明细（无合同空白对账单：费用项目/金额/相关款号/附件）</el-divider>
          <div v-for="(e, idx) in createForm.expenses" :key="idx" class="item-row">
            <el-row :gutter="8" align="middle">
              <el-col :span="8"><el-input v-model="e.expense_name" placeholder="费用项目/事由" /></el-col>
              <el-col :span="5"><el-input-number v-model="e.amount" :min="0" :precision="2" :controls="false" placeholder="金额" style="width:100%" /></el-col>
              <el-col :span="5"><el-input v-model="e.style_no" placeholder="相关款号(可空)" /></el-col>
              <el-col :span="4"><el-input v-model="e.attach_url" placeholder="附件URL(可空)" /></el-col>
              <el-col :span="2"><el-button link type="danger" @click="removeExpense(idx)">删</el-button></el-col>
            </el-row>
          </div>
          <el-button style="width:100%;margin-top:8px" @click="addExpense">+ 添加费用行</el-button>
          <div class="labor-sum">合计费用 ¥{{ expenseTotal.toFixed(2) }}</div>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreate">保存</el-button>
      </template>
    </el-dialog>
  </div>

    <!-- 发票等附件在页面内预览，不再靠浏览器开新标签（2026-08-10 King：能不能直接点开，不要下载）-->
    <!-- 改草稿：只放开非结构性字段 -->
    <el-dialog v-model="editDraftVisible" title="修改对账单草稿" width="460px" destroy-on-close>
      <el-form label-width="92px">
        <el-form-item label="发票号"><el-input v-model="editDraftForm.invoice_no" placeholder="没有就留空" /></el-form-item>
        <el-form-item label="发票金额"><el-input-number v-model="editDraftForm.invoice_amount" :min="0" :precision="2" :controls="false" style="width:100%" /></el-form-item>
        <el-form-item label="税率(%)"><el-input-number v-model="editDraftForm.tax_rate" :min="0" :max="100" :precision="2" :controls="false" style="width:100%" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="editDraftForm.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <div class="hint">批次和费用明细属于结构性内容，改动牵扯批次占用与金额重算——需要改这些请删掉草稿重新建。</div>
      <template #footer>
        <el-button @click="editDraftVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingDraft" @click="doSaveDraft">保存</el-button>
      </template>
    </el-dialog>

    <FilePreviewDialog ref="preview" />
</template>

<script setup lang="ts">
import { errToast } from '@/api';
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fmtDateTime } from '@/utils/format';
import { Search, Refresh, Plus, Coin, Paperclip } from '@element-plus/icons-vue';
import FilePreviewDialog from '@/components/FilePreviewDialog.vue';
import FileUpload from '@/components/FileUpload.vue';
import type { FormInstance, FormRules } from 'element-plus';
import { reconciliationApi } from '@/api/reconciliation';
import { exportReconciliationExcel } from '@/utils/reconciliationExcel';
import { sampleApi } from '@/api/sample';
import { contractApi } from '@/api/contract';
import { paymentRequestApi } from '@/api/payment';
import type { DocLink } from '@/components/DocLinks.vue';
import FactorySelect from '@/components/FactorySelect.vue';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const preview = ref<any>(null);
// 改草稿
const editDraftVisible = ref(false);
const savingDraft = ref(false);
const editDraftId = ref<number | null>(null);
const editDraftForm = reactive<any>({ invoice_no: '', invoice_amount: undefined, tax_rate: undefined, description: '' });
function openEditDraft(row: any) {
  editDraftId.value = row.id;
  Object.assign(editDraftForm, {
    invoice_no: row.invoice_no ?? '',
    invoice_amount: row.invoice_amount != null ? +row.invoice_amount : undefined,
    tax_rate: row.tax_rate != null ? +row.tax_rate : undefined,
    description: row.description ?? '',
  });
  editDraftVisible.value = true;
}
async function doSaveDraft() {
  if (!editDraftId.value) return;
  savingDraft.value = true;
  try {
    await reconciliationApi.updateDraft(editDraftId.value, { ...editDraftForm });
    ElMessage.success('已保存');
    editDraftVisible.value = false;
    load();
  } finally { savingDraft.value = false; }
}

/**
 * 出货明细摊成「逐品名」行（2026-08-11 King：合同里多个品名、单价不同，
 * 要按数量×单价一行一行列，不要一个平均价）。
 *
 * 对账行是**按发货批次**存的，单价取批次锁价——一个批次含多个品名时那就是加权平均
 * （实证 DZ-MNA263M525-001：9941 × 15.3130，实际是 4 条不同单价的料，合计分毫不差）。
 * 逐品名数据在批次的 items 里（后端详情已带出）。
 * 【两种都要兼容】门户发货时「按物料行填写实发数」是可选的，只有部分批次有 items；
 * 没有的批次照旧整批一行，不要因为摊开而把它们弄丢。
 */
const shipRowClass = ({ row }: { row: any }) => (row?._sub ? 'ship-sub' : '');
const shipmentDetailRows = computed(() => {
  const out: any[] = [];
  for (const s of (detailData.value?.shipments ?? []) as any[]) {
    const items: any[] = s.items ?? [];
    if (!items.length) { out.push(s); continue; }
    // 批次汇总行保留（看得到这一批总额），其下挂逐品名行
    out.push({ ...s, _batch: true });
    for (const it of items) {
      out.push({
        _sub: true,
        shipment_id: '', contract_id: null, style_no: '',
        item_name: it.item_name,
        snapshot_unit_price: it.unit_price,
        qty: it.qty,
        amount: it.amount ?? (+it.unit_price || 0) * (+it.qty || 0),
      });
    }
  }
  return out;
});
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));

// 合同号可点跳合同页（对账付款串流程 B7/C12）。原先跳的是 Contracts?open=<id> 让列表开弹框，
// 但多页签以 fullPath 为键、标题取 meta.title，?open=3 与 ?open=7 会开出两个都叫「合同管理」
// 的页签、分不清；改跳合同自己的 :id 路由，页签能自动带出「#id」。
function goContract(contractId: number) {
  detailVisible.value = false;
  router.push({ name: 'ContractEdit', params: { id: contractId } });
}
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.FINANCE) || authStore.hasRole(UserRole.BUSINESS));
const canReview = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.SUPERVISOR));
// 与付款页「新建付款申请」同一套口径（后端 POST /payments/requests 放行 ADMIN/FINANCE/BUSINESS）
const canCreatePayment = computed(() => authStore.hasRole(UserRole.ADMIN)
  || authStore.hasRole(UserRole.FINANCE) || authStore.hasRole(UserRole.BUSINESS));

/**
 * 从对账单直接去建付款申请，把对账单/工厂/金额/款号都带过去（2026-08-08 King 反馈）。
 * 金额优先取发票金额——他的原话是「按发票生成付款申请单」，有票就以票面为准；
 * 没票才退回对账金额。真正的校验仍在后端（状态闸门、工厂一致性、累计超付拦截）。
 */
function goCreatePayment(row: any) {
  router.push({
    path: '/payments',
    query: {
      tab: 'request', create: '1',
      reconcile_id: String(row.id),
      type: row.type ?? 'CONTRACT',
      ...(row.factory_id != null ? { factory_id: String(row.factory_id) } : {}),
      amount: String(row.invoice_amount ?? row.total_amount ?? ''),
      ...(row.style_no ? { related_style_no: String(row.style_no) } : {}),
    },
  });
}
const canBusiness = computed(() =>
  authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.FINANCE) || authStore.hasRole(UserRole.BUSINESS));

function statusLabel(s: string) {
  return { DRAFT: '草稿', PENDING: '待复核', CONFIRMED: '已确认', PAID: '已付款' }[s] ?? s;
}
function statusTagType(s: string): any {
  return { DRAFT: 'info', PENDING: 'warning', CONFIRMED: 'primary', PAID: 'success' }[s] ?? 'info';
}
function typeLabel(t: string) {
  return { CONTRACT: '合同对账', NO_CONTRACT: '非合同对账', LABOR: '工时对账' }[t] ?? t;
}
function subTypeLabel(s: string) {
  return { EXPENSE: '费用', CASH_NO_INVOICE: '现金无票', PREPAY: '预付款' }[s] ?? s;
}
function typeTag(t: string): any {
  return { CONTRACT: '', NO_CONTRACT: 'warning', LABOR: 'success' }[t] ?? 'info';
}

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const query = reactive({
  page: 1, size: 20, keyword: '',
  type: undefined as string | undefined,
  status: undefined as string | undefined,
  factory_id: undefined as number | undefined,
});

async function load() {
  loading.value = true;
  try {
    const res = await reconciliationApi.list(query);
    list.value = res?.data ?? [];
    total.value = res?.data?.total ?? res?.total ?? 0;
  } finally { loading.value = false; }
}

function reset() {
  Object.assign(query, { keyword: '', type: undefined, status: undefined, factory_id: undefined, page: 1 });
  load();
}

onMounted(async () => {
  await load();
  // 别的单据跳过来(/reconciliations/:id/view):自动打开该对账单详情。
  // 该单可能不在当前页,故列表里找不到就只按 id 开,工厂名由详情接口自己带。
  const rid = Number(route.params.id);
  if (rid) {
    try { await viewDetail(list.value.find((r: any) => r.id === rid) ?? { id: rid }); }
    catch (e: any) { errToast(e?.response?.data?.msg ?? '对账单不存在或已删除'); }
  }
});

// Detail
const detailVisible = ref(false);
const detailData = ref<any>(null);

// 下游·付款申请。付款模块没有详情页(只有列表),故 chip 落到付款列表并按本对账单过滤，
// 而不是硬造一个详情路由。上游合同链接不在这里，见「来源合同」那行的 goContract。
const detailPRs = ref<any[]>([]);
const detailLinks = computed<DocLink[]>(() =>
  detailPRs.value.map((p) => ({
    key: p.id,
    text: `付款申请 ${p.pr_no}`,
    type: p.approval_status === 'PAID' ? 'success' : 'warning',
    to: { name: 'Payments', query: { tab: 'request', reconcile_id: String(detailData.value?.id ?? '') } },
  })),
);
async function loadDetailLinks(reconcileId: number) {
  detailPRs.value = [];
  // 反查失败不能带崩详情弹框——关联链接是附加信息，不是主内容
  try {
    const res: any = await paymentRequestApi.list({ reconcile_id: reconcileId, page: 1, size: 50 });
    // 再筛一道防串单：付款列表原先无 query DTO、不做白名单校验，后端万一没接住
    // reconcile_id 会静默回全量——那会把别家的付款申请挂到这张对账单上，比不显示更糟
    detailPRs.value = ((res?.data ?? []) as any[]).filter((p) => Number(p.reconcile_id) === Number(reconcileId));
  } catch { /* 反查失败宁可不显示，也不显示错的关联 */ }
}
// 详情接口不回 factory_name(仅列表补名),合并列表行的工厂名,供弹框导出用。
// 行上没有时不能覆盖——否则会把详情自己的 factory_name 抹成 undefined。
async function viewDetail(row: any) {
  const res = await reconciliationApi.get(row.id);
  const detail = res?.data ?? res;
  detailData.value = { ...detail, ...(row.factory_name ? { factory_name: row.factory_name } : {}) };
  detailVisible.value = true;
  void loadDetailLinks(row.id); // 不 await：关联单据是附加信息，不该拖住弹框打开
}
// 导出 Excel(取详情含发货/工时/费用明细;.xls)
async function exportRow(row: any) {
  try {
    const res: any = await reconciliationApi.get(row.id);
    exportReconciliationExcel({ ...(res.data ?? res), factory_name: row.factory_name });
  } catch (e: any) { errToast(e?.response?.data?.msg ?? e?.message ?? '导出失败'); }
}
// 弹框内导出(复用已取的详情,不再请求)
function exportDetail() {
  try { exportReconciliationExcel(detailData.value); }
  catch (e: any) { errToast(e?.message ?? '导出失败'); }
}

async function doSubmit(row: any) {
  await reconciliationApi.submit(row.id);
  ElMessage.success('已提交主管复核');
  load();
}

async function doConfirm(row: any) {
  try {
    await reconciliationApi.confirm(row.id);
    ElMessage.success('主管复核已确认');
    load();
  } catch (e: any) {
    const msg = String(e?.response?.data?.msg ?? e?.response?.data?.msg ?? '');
    // 超发闸门(P2#28):累计实发超合同量→业务填写放行原因留痕后确认
    if (msg.startsWith('OVER_SHIP:')) {
      try {
        const { value } = await ElMessageBox.prompt(
          `${msg.slice('OVER_SHIP:'.length)}`, '超发确认放行',
          { inputPlaceholder: '请填写超发放行原因（留痕）', inputPattern: /\S+/, inputErrorMessage: '原因必填', type: 'warning' },
        );
        await reconciliationApi.confirm(row.id, value);
        ElMessage.success('已确认（超发原因已留痕）');
        load();
      } catch { /* 取消 */ }
      return;
    }
    ElMessage.error(msg || '复核确认失败');
  }
}

async function doReject(row: any) {
  try {
    const { value } = await ElMessageBox.prompt('请填写退回原因（批注）', '整单退回', {
      confirmButtonText: '确认退回', cancelButtonText: '取消', inputType: 'textarea',
    });
    await reconciliationApi.reject(row.id, value);
    ElMessage.success('已整单退回，业务员可修改后重新提交');
    load();
  } catch (e: any) {
    if (e !== 'cancel') errToast(e?.response?.data?.msg ?? '退回失败');
  }
}

async function doRemove(id: number) {
  await reconciliationApi.remove(id);
  ElMessage.success('删除成功');
  load();
}

// Create
const createVisible = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({
  type: 'CONTRACT',
  subType: 'EXPENSE',
  factory_id: undefined as number | undefined,
  contract_id: undefined as number | undefined,
  merge_into_parent: false,
  tax_rate: undefined as number | undefined,
  invoice_no: '',
  invoice_amount: undefined as number | undefined,
  description: '',
  shipments: [] as any[],
  expenses: [] as any[],
  deductions: [] as any[],
});
const expenseTotal = computed(() => createForm.expenses.reduce((s: number, e: any) => s + (+e.amount || 0), 0));
// 扣款明细（#74）：金额带符号，扣款为负；界面填什么、库里存什么、导出显示什么，三处一致
const deductionTotal = computed(() => createForm.deductions.reduce((s: number, d: any) => s + (+d.amount || 0), 0));
const shipGoodsTotal = computed(() => createForm.shipments.reduce(
  (s: number, x: any) => s + (+x.snapshot_unit_price || 0) * (+x.qty || 0), 0));
function addDeduction() { createForm.deductions.push({ reason: '', amount: undefined, style_no: '', attach_url: '' }); }
function removeDeduction(idx: number) { createForm.deductions.splice(idx, 1); }
// 详情页的扣款合计：明细表在合同类对账里就是扣款（无合同类型走上面的费用分支）
const detailDeductionTotal = computed(() => (detailData.value?.expenseItems ?? [])
  .reduce((s: number, e: any) => s + (+e.amount || 0), 0));
const createRules: FormRules = {
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
};

// 款号→合同(合同对账):搜款号列出该款所有合同,选中即带出工厂/合同ID(免手填数字ID)
const styleSearch = ref('');
const styleContracts = ref<any[]>([]);
const contractLoading = ref(false);
const pickedFactoryName = ref('');
const contractLabel = (c: any) =>
  `${c.contract_no} · ${c.factory_name || ('工厂#' + c.factory_id)} · ${typeLabel(c.type)}`
  + (c.total_amount != null ? ` · ¥${Number(c.total_amount).toFixed(2)}` : '');
async function searchContracts() {
  const s = styleSearch.value.trim();
  if (!s) { ElMessage.warning('请输入款号'); return; }
  contractLoading.value = true;
  try {
    const res: any = await contractApi.byStyle(s);
    styleContracts.value = (res.data ?? res) ?? [];
    if (!styleContracts.value.length) ElMessage.info('该款号下未找到合同');
  } catch (e: any) {
    errToast(e?.response?.data?.msg ?? '查询合同失败');
  } finally { contractLoading.value = false; }
}
function onPickContract(id?: number) {
  const c = styleContracts.value.find((x) => x.id === id);
  createForm.factory_id = c ? Number(c.factory_id) : undefined;
  pickedFactoryName.value = c?.factory_name ?? '';
}
function onClearStyle() { styleContracts.value = []; }

function openCreate() { createVisible.value = true; }
function resetCreateForm() {
  Object.assign(createForm, {
    type: 'CONTRACT', subType: 'EXPENSE', factory_id: undefined, contract_id: undefined,
    tax_rate: undefined, invoice_no: '', invoice_amount: undefined, description: '', shipments: [], expenses: [], deductions: [], merge_into_parent: false,
  });
  styleSearch.value = '';
  styleContracts.value = [];
  pickedFactoryName.value = '';
}
function addShipment() {
  // 默认带上已选合同 + 搜索款号,便于「一单多合同」逐行填
  createForm.shipments.push({ shipment_id: undefined, contract_id: createForm.contract_id, style_no: styleSearch.value.trim(), item_name: '', snapshot_unit_price: undefined, qty: undefined });
}
function removeShipment(idx: number) { createForm.shipments.splice(idx, 1); }
function addExpense() {
  createForm.expenses.push({ expense_name: '', amount: undefined, style_no: '', attach_url: '' });
}
function removeExpense(idx: number) { createForm.expenses.splice(idx, 1); }

async function doCreate() {
  await createFormRef.value?.validate();
  const isNoContract = createForm.type === 'NO_CONTRACT';
  if (isNoContract) {
    if (!createForm.factory_id) { ElMessage.warning('请选择工厂'); return; }
    if (!createForm.expenses.length) { ElMessage.warning('请至少添加一条费用明细'); return; }
  } else {
    if (!createForm.contract_id) { ElMessage.warning('请先搜款号并选择合同'); return; }
    if (!createForm.shipments.length) { ElMessage.warning('请至少添加一条出货明细'); return; }
  }
  // 扣款行：点了「添加扣款行」又没填的空行直接丢掉，别拿去撞后端校验；填了一半的拦下来说清楚
  const deductions = (createForm.deductions as any[]).filter((d) => d.reason?.trim() || d.amount != null);
  for (const d of deductions) {
    if (!d.reason?.trim()) { ElMessage.warning('每行都要写清事由（如「运费」「次品退货 20 件」），否则事后没人说得清这笔钱是怎么回事'); return; }
    if (!d.amount) { ElMessage.warning('金额不能为空或 0：加钱（运费/版费）填正数，减钱（打折/退货）填负数'); return; }
  }
  saving.value = true;
  try {
    await reconciliationApi.create({ ...createForm, deductions } as any);
    ElMessage.success('创建成功');
    createVisible.value = false;
    load();
  } finally { saving.value = false; }
}

// 生成工时对账：勾选已对账样衣（同一版师）合并
const laborVisible = ref(false);
const laborLoading = ref(false);
const laborSaving = ref(false);
const laborSamples = ref<any[]>([]);
const laborSelection = ref<any[]>([]);
const laborTotal = computed(() =>
  laborSelection.value.reduce((s, x) => s + (+x.labor_amount || 0), 0));

async function openLabor() {
  laborVisible.value = true;
  laborSelection.value = [];
  laborLoading.value = true;
  try {
    // 仅拉「已对账」样衣（版师已填件数+单价、工时金额生成）
    const res = await sampleApi.list({ status: 'RECONCILED', page: 1, size: 100 });
    const items = res?.data ?? [];
    laborSamples.value = items.filter((s: any) => +s.labor_amount > 0);
  } finally { laborLoading.value = false; }
}
function onLaborSelect(rows: any[]) { laborSelection.value = rows; }

async function doGenerateLabor() {
  if (!laborSelection.value.length) return;
  const makerIds = Array.from(new Set(laborSelection.value.map((s) => s.patternmaker_id)));
  if (makerIds.length > 1) {
    ElMessage.warning('一张工时对账单需为同一版师，请勿跨版师勾选');
    return;
  }
  laborSaving.value = true;
  try {
    await reconciliationApi.generateLabor(laborSelection.value.map((s) => s.id));
    ElMessage.success('工时对账单已生成（草稿·待提交复核）');
    laborVisible.value = false;
    query.type = 'LABOR';
    load();
  } finally { laborSaving.value = false; }
}
</script>

<style scoped>
.adj-hint { font-size: 12px; color: var(--el-text-color-secondary); margin: -4px 0 8px; line-height: 1.7; }
.ded-minus { color: var(--el-color-danger); font-weight: 600; }
.ded-plus { color: var(--el-color-success); font-weight: 600; }
/* 逐品名行淡一点，跟批次汇总行区分开 */
:deep(.el-table .ship-sub) > td { background: var(--el-fill-color-lighter); }

.page-container { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.search-card :deep(.el-card__body) { padding: 16px 16px 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
.item-row { margin-bottom: 8px; }
.amount { font-size: 13px; color: #909399; }
.labor-sum { margin-top: 10px; text-align: right; font-weight: 600; color: var(--el-color-primary); }
.picked-bar { display: flex; align-items: center; margin-bottom: 12px; font-size: 14px; color: var(--el-text-color-regular); }
.picked-bar .muted { color: var(--el-text-color-placeholder); }
</style>
