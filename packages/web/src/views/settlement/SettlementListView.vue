<template>
  <div class="page-container">
    <el-card class="search-card">
      <el-form :model="query" inline>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="结算单号 / 款号" clearable style="width:180px" @clear="load" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width:110px" @change="load">
            <el-option label="待收汇" value="DRAFT" />
            <el-option label="已结算" value="CONFIRMED" />
          </el-select>
        </el-form-item>
        <el-form-item label="订单ID">
          <el-input-number v-model="query.order_id" :min="1" :controls="false" placeholder="订单ID" style="width:100px" @change="load" />
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
          <span>结算单列表</span>
          <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate">新建结算单</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="settlement_no" label="结算单编号" width="180" />
        <el-table-column prop="order_id" label="订单ID" width="80" align="center" />
        <el-table-column prop="style_no" label="款号" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.style_no || '—' }}</template>
        </el-table-column>
        <el-table-column prop="settle_amount" label="结算金额" width="120" align="right">
          <template #default="{ row }">{{ (+(row.settle_amount ?? row.revenue ?? 0)).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="goods_amount_tax" label="总货款(含税)" width="120" align="right">
          <template #default="{ row }">{{ (+(row.goods_amount_tax ?? row.total_cost ?? 0)).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="gross_margin" label="毛利率" width="90" align="right">
          <template #default="{ row }">{{ row.gross_margin != null ? (+row.gross_margin).toFixed(2) + '%' : '—' }}</template>
        </el-table-column>
        <el-table-column prop="net_profit" label="含退税净利" width="120" align="right">
          <template #default="{ row }">
            <span v-if="row.net_profit == null" class="muted">—</span>
            <span v-else :class="{ 'text-danger': +row.net_profit < 0, 'text-success': +row.net_profit > 0 }">
              {{ (+row.net_profit).toFixed(2) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="130">
          <template #default="{ row }">
            <el-tag :type="row.status === 'CONFIRMED' ? 'success' : 'info'" size="small">
              {{ row.status === 'CONFIRMED' ? '已结算' : '待收汇' }}
            </el-tag>
            <el-tag v-if="+(row.needs_recalc ?? 0)" type="warning" size="small" style="margin-left:4px">待重算</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="confirmed_at" label="确认时间" width="160">
          <template #default="{ row }">{{ row.confirmed_at ?? '--' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row.id)">详情</el-button>
            <el-button
              v-if="row.status === 'DRAFT' && canEdit"
              link type="success" size="small"
              @click="doConfirm(row)"
            >确认</el-button>
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
    <el-dialog v-model="detailVisible" title="结算单详情" width="900px" destroy-on-close>
      <template v-if="detailData">
        <div class="detail-toolbar" v-if="detailData.status === 'DRAFT' && canEdit">
          <el-button size="small" type="primary" @click="openEdit">编辑（补收汇/汇率/费用）</el-button>
          <el-button size="small" :loading="refreshing" @click="doRefreshCost">刷新付款汇总</el-button>
          <span class="hint-inline">重取出货件数并按本订单对账付款重建成本快照</span>
        </div>
        <div class="detail-toolbar" v-if="detailData.status === 'CONFIRMED' && isAdmin">
          <el-popconfirm title="红冲重开：本单退回草稿重算，当前数字将以版本快照留痕。确认？" width="300" @confirm="doReopen">
            <template #reference><el-button size="small" type="danger" plain>红冲重开</el-button></template>
          </el-popconfirm>
        </div>
        <el-alert
          v-if="+(detailData.needs_recalc ?? 0)"
          type="warning" :closable="false" show-icon style="margin-bottom:10px"
          title="待重算——确认后上游对账/付款发生变动，成本口径可能已过期；草稿态点「刷新付款汇总」重算，已确认态请先红冲重开"
        />
        <el-alert
          v-if="detailData.status === 'DRAFT' && !+(detailData.profit_ready ?? 0)"
          type="warning" :closable="false" show-icon style="margin-bottom:10px"
          title="收汇金额与结算汇率尚未齐备——毛利/净利暂不生成（防误导性负毛利），补齐后方可确认结算"
        />
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="结算单编号">{{ detailData.settlement_no }}</el-descriptions-item>
          <el-descriptions-item label="订单ID">{{ detailData.order_id }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="detailData.status === 'CONFIRMED' ? 'success' : 'info'" size="small">
              {{ detailData.status === 'CONFIRMED' ? '已结算' : '待收汇' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="款号">{{ detailData.style_no || '—' }}</el-descriptions-item>
          <el-descriptions-item label="出货件数">{{ detailData.shipped_qty ?? 0 }}</el-descriptions-item>
          <el-descriptions-item label="结算汇率">
            {{ detailData.exchange_rate != null ? (+detailData.exchange_rate).toFixed(4) : '—' }}
            <span v-if="hasRatedReceipts" class="muted">（逐笔加权平均）</span>
          </el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">成本明细（对账付款汇总）</el-divider>
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="总货款(含税)">{{ money(detailData.goods_amount_tax ?? detailData.total_cost) }}</el-descriptions-item>
          <el-descriptions-item label="总货款(不含税)">{{ money(detailData.goods_amount_extax) }}</el-descriptions-item>
          <el-descriptions-item label="未付·不计入">
            <span v-if="+(detailData.unpaid_count ?? 0) > 0" class="unpaid-grey">
              {{ money(detailData.unpaid_goods_tax) }}（{{ detailData.unpaid_count }} 笔已确认未付）
            </span>
            <span v-else class="muted">无</span>
          </el-descriptions-item>
          <el-descriptions-item label="成本单价(含税)">{{ num4(detailData.cost_per_unit_tax) }}</el-descriptions-item>
          <el-descriptions-item label="成本单价(不含税)">{{ num4(detailData.cost_per_unit_extax ?? detailData.cost_per_unit) }}</el-descriptions-item>
          <el-descriptions-item label="美金单价">{{ num4(detailData.usd_unit_price) }}</el-descriptions-item>
        </el-descriptions>
        <div class="hint-inline" style="margin-top:4px">总货款仅汇总【已付款】对账；有票行按各行税率换算不含税，无票行按含税全额计入。</div>

        <el-divider content-position="left">财务收汇 · 毛利对比</el-divider>
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="发票金额$">{{ money(detailData.invoice_amount_usd) }}</el-descriptions-item>
          <el-descriptions-item label="实际收汇$">{{ money(detailData.receipt_usd) }}</el-descriptions-item>
          <el-descriptions-item label="结算金额¥">{{ money(detailData.settle_amount ?? detailData.revenue) }}</el-descriptions-item>
          <el-descriptions-item label="毛利">
            <span v-if="!+(detailData.profit_ready ?? 0)" class="muted">待补收汇/汇率</span>
            <span v-else>{{ money(detailData.gross_profit) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="毛利率">
            <span v-if="!+(detailData.profit_ready ?? 0)" class="muted">—</span>
            <span v-else>{{ detailData.gross_margin != null ? `${(+detailData.gross_margin).toFixed(2)}%` : '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="财务及管理费">{{ money(detailData.finance_fee) }}</el-descriptions-item>
          <el-descriptions-item label="期间费用合计">{{ money(periodFeeTotal(detailData)) }}</el-descriptions-item>
          <el-descriptions-item label="出口退税">{{ money(detailData.tax_refund) }}<el-tag size="small" :type="detailData.refund_status === 'RECEIVED' ? 'success' : 'info'" style="margin-left:6px">{{ detailData.refund_status === 'RECEIVED' ? '已到账' : '预估' }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="保本汇率(含税/不含税)">
            {{ num4(detailData.breakeven_rate_tax) }} / {{ num4(detailData.breakeven_rate_extax) }}
          </el-descriptions-item>
          <el-descriptions-item label="含退税净利">
            <span v-if="!+(detailData.profit_ready ?? 0)" class="muted">待补收汇/汇率</span>
            <span v-else :class="{ 'text-danger': +detailData.net_profit < 0, 'text-success': +detailData.net_profit > 0 }">
              {{ (+detailData.net_profit).toFixed(2) }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="不含退税净利">
            <span v-if="!+(detailData.profit_ready ?? 0)" class="muted">待补收汇/汇率</span>
            <span v-else :class="{ 'text-danger': +detailData.net_profit_ex_refund < 0, 'text-success': +detailData.net_profit_ex_refund > 0 }">
              {{ (+detailData.net_profit_ex_refund).toFixed(2) }}
            </span>
          </el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">成本明细行（对账付款汇总·含税）</el-divider>
        <div class="detail-toolbar" v-if="detailData.status === 'DRAFT' && canEdit">
          <el-button size="small" type="primary" @click="openAddCost">+ 添加成本行</el-button>
        </div>
        <el-table :data="detailData.costs ?? []" border size="small" :row-class-name="costRowClass">
          <el-table-column prop="cost_name" label="费用名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="supplier_name" label="供应商" width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.supplier_name || '—' }}</template>
          </el-table-column>
          <el-table-column prop="amount" label="金额" width="110" align="right">
            <template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="has_invoice" label="发票" width="70" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="row.has_invoice ? 'success' : 'info'">{{ row.has_invoice ? '有票' : '无票' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="tax_rate" label="税率%" width="70" align="right">
            <template #default="{ row }">{{ row.tax_rate != null ? +row.tax_rate : '—' }}</template>
          </el-table-column>
          <el-table-column label="付款状态" width="110" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.pay_status === 'PAID'" size="small" type="success">已付·计入</el-tag>
              <el-tag v-else-if="row.pay_status === 'CONFIRMED'" size="small" type="info">未付·不计入</el-tag>
              <el-tag v-else size="small">手工行</el-tag>
            </template>
          </el-table-column>
          <el-table-column v-if="detailData.status === 'DRAFT' && canEdit" label="操作" width="70" align="center">
            <template #default="{ row }">
              <el-popconfirm title="删除该成本行？" @confirm="doRemoveCost(row.id)">
                <template #reference><el-button link type="danger" size="small">删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>

        <el-divider content-position="left">收汇记录（逐笔×各自汇率）</el-divider>
        <div class="detail-toolbar" v-if="canEdit">
          <el-button size="small" type="primary" @click="openAddReceipt">+ 登记收汇</el-button>
        </div>
        <el-table :data="detailData.receipts ?? []" border size="small">
          <el-table-column prop="receipt_date" label="收汇日期" width="110" />
          <el-table-column prop="amount" label="收汇金额$" width="110" align="right">
            <template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="exchange_rate" label="该笔汇率" width="100" align="right">
            <template #default="{ row }">{{ row.exchange_rate != null ? (+row.exchange_rate).toFixed(4) : '—' }}</template>
          </el-table-column>
          <el-table-column label="折RMB" width="110" align="right">
            <template #default="{ row }">{{ row.exchange_rate != null ? (+row.amount * +row.exchange_rate).toFixed(2) : '—' }}</template>
          </el-table-column>
          <el-table-column label="水单" width="70" align="center">
            <template #default="{ row }">
              <el-link v-if="row.slip_url" type="primary" @click="openFile(row.slip_url)">查看</el-link>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" show-overflow-tooltip />
          <el-table-column v-if="detailData.status === 'DRAFT' && canEdit" label="操作" width="70" align="center">
            <template #default="{ row }">
              <el-popconfirm title="删除该收汇记录？" @confirm="doRemoveReceipt(row.id)">
                <template #reference><el-button link type="danger" size="small">删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>

        <el-divider content-position="left">变更记录（改值留痕 · 原值→新值）</el-divider>
        <el-table :data="changeLogs" border size="small" max-height="220">
          <el-table-column prop="created_at" label="时间" width="160">
            <template #default="{ row }">{{ String(row.created_at ?? '').slice(0, 19).replace('T', ' ') }}</template>
          </el-table-column>
          <el-table-column prop="field" label="字段/事件" width="140">
            <template #default="{ row }">{{ fieldLabel(row.field) }}</template>
          </el-table-column>
          <el-table-column label="原值" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.old_value ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="新值" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.new_value ?? '—' }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-dialog>

    <!-- 编辑结算单弹窗（草稿限定：财务两步走——收汇后补汇率/发票/费用） -->
    <el-dialog v-model="editVisible" title="编辑结算单" width="640px">
      <el-form :model="editForm" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="结算汇率">
              <el-input-number v-model="editForm.exchange_rate" :min="0" :precision="4" :disabled="hasRatedReceipts" placeholder="收汇后填" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="发票金额$">
              <el-input-number v-model="editForm.invoice_amount_usd" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="实际收汇$">
              <el-input-number v-model="editForm.receipt_usd" :min="0" :precision="2" :disabled="hasReceiptRows" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="出口退税">
              <el-input-number v-model="editForm.tax_refund" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <div v-if="hasReceiptRows" class="hint-inline" style="margin:-6px 0 8px 100px">已有逐笔收汇记录，收汇总额由记录自动累计</div>
        <div v-if="hasRatedReceipts" class="hint-inline" style="margin:-6px 0 8px 100px">各笔收汇均带汇率，结算汇率取加权平均自动覆盖</div>
        <el-divider>期间费用（进净利扣减）</el-divider>
        <el-row :gutter="12">
          <el-col :span="6"><el-form-item label="运杂费" label-width="56px"><el-input-number v-model="editForm.freight_fee" :min="0" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="快邮费" label-width="56px"><el-input-number v-model="editForm.express_fee" :min="0" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="打样费" label-width="56px"><el-input-number v-model="editForm.sample_fee" :min="0" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="其它" label-width="56px"><el-input-number v-model="editForm.other_fee" :min="0" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="editForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doUpdate">保存并重算</el-button>
      </template>
    </el-dialog>

    <!-- 新建结算单弹窗 -->
    <el-dialog v-model="createVisible" title="新建结算单" width="700px" @closed="resetCreateForm">
      <div class="agg-hint">🔎 搜款号带入：选择订单后，系统按该款号自动聚合「货款(含税·已确认合同对账)」与「期间费用(无合同对账)」作为成本，可在下方人工覆盖。</div>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="订单/款号" prop="order_id">
              <el-select v-model="createForm.order_id" filterable placeholder="搜款号或订单号选择" style="width:100%">
                <el-option v-for="o in orders" :key="o.id" :label="`${o.style_no || '无款号'} · ${o.order_no}`" :value="o.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结算汇率" prop="exchange_rate">
              <el-input-number v-model="createForm.exchange_rate" :min="0" :precision="4" placeholder="收汇后填" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="发票金额$">
              <el-input-number v-model="createForm.invoice_amount_usd" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="实际收汇$">
              <el-input-number v-model="createForm.receipt_usd" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider>期间费用（进净利扣减）</el-divider>
        <el-row :gutter="12">
          <el-col :span="6"><el-form-item label="运杂费" label-width="56px"><el-input-number v-model="createForm.freight_fee" :min="0" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="快邮费" label-width="56px"><el-input-number v-model="createForm.express_fee" :min="0" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="打样费" label-width="56px"><el-input-number v-model="createForm.sample_fee" :min="0" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="其它" label-width="56px"><el-input-number v-model="createForm.other_fee" :min="0" :precision="2" :controls="false" style="width:100%" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="出口退税">
              <el-input-number v-model="createForm.tax_refund" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="createForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-divider>成本明细（对账付款汇总·含税）</el-divider>
        <div v-for="(c, idx) in createForm.costs" :key="idx" class="item-row">
          <el-row :gutter="8" align="middle">
            <el-col :span="6"><el-input v-model="c.cost_name" placeholder="费用名称" /></el-col>
            <el-col :span="5">
              <el-input-number v-model="c.amount" :min="0" :precision="2" :controls="false" placeholder="金额" style="width:100%" />
            </el-col>
            <el-col :span="5">
              <el-select v-model="c.has_invoice" style="width:100%">
                <el-option :value="1" label="有发票" />
                <el-option :value="0" label="无发票" />
              </el-select>
            </el-col>
            <el-col :span="5">
              <el-input-number v-model="c.tax_rate" :min="0" :max="100" :precision="2" :controls="false" :disabled="!c.has_invoice" placeholder="税率%" style="width:100%" />
            </el-col>
            <el-col :span="3">
              <el-button link type="danger" @click="removeCostLine(idx)">删除</el-button>
            </el-col>
          </el-row>
        </div>
        <el-button style="width:100%;margin-top:8px" @click="addCostLine">+ 添加费用行</el-button>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加费用弹窗 -->
    <el-dialog v-model="addCostVisible" title="添加费用" width="420px">
      <el-form ref="addCostFormRef" :model="costForm" :rules="costRules" label-width="90px">
        <el-form-item label="费用名称" prop="cost_name">
          <el-input v-model="costForm.cost_name" />
        </el-form-item>
        <el-form-item label="金额" prop="amount">
          <el-input-number v-model="costForm.amount" :min="0.01" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="发票">
          <el-select v-model="costForm.has_invoice" style="width:100%">
            <el-option :value="1" label="有发票" />
            <el-option :value="0" label="无发票" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addCostVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doAddCost">确认</el-button>
      </template>
    </el-dialog>

    <!-- 登记收汇弹窗（逐笔汇率+银行水单） -->
    <el-dialog v-model="addReceiptVisible" title="登记收汇" width="460px">
      <el-form ref="addReceiptFormRef" :model="receiptForm" :rules="receiptRules" label-width="90px">
        <el-form-item label="收汇金额$" prop="amount">
          <el-input-number v-model="receiptForm.amount" :min="0.01" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="收汇日期" prop="receipt_date">
          <el-date-picker v-model="receiptForm.receipt_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="该笔汇率">
          <el-input-number v-model="receiptForm.exchange_rate" :min="0" :precision="4" placeholder="按银行水单填" style="width:100%" />
          <div class="hint-inline">各笔均带汇率时：结算金额=Σ(金额×汇率)，结算汇率=加权平均</div>
        </el-form-item>
        <el-form-item label="银行水单">
          <FileUpload v-model="receiptForm.slip_url" :limit="1" accept="image/*,.pdf" list-type="text" sensitive />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="receiptForm.remark" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addReceiptVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doAddReceipt">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Refresh, Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { settlementApi } from '@/api/settlement';
import { orderApi } from '@/api/order';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';
import FileUpload from '@/components/FileUpload.vue';
import { openFile } from '@/utils/secureFile';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.FINANCE));
// 出货后业务可建结算单（结算串流程 rec）；确认/编辑仍限财务/管理
const canCreate = computed(() => canEdit.value || authStore.hasRole(UserRole.BUSINESS));

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const query = reactive({
  page: 1, size: 20, keyword: '',
  status: undefined as string | undefined,
  order_id: undefined as number | undefined,
});

async function load() {
  loading.value = true;
  try {
    const res = await settlementApi.list(query);
    list.value = res?.data ?? [];
    total.value = res?.data?.total ?? res?.total ?? 0;
  } finally { loading.value = false; }
}

function reset() {
  Object.assign(query, { keyword: '', status: undefined, order_id: undefined, page: 1 });
  load();
}

const orders = ref<any[]>([]);
async function loadOrders() {
  try { orders.value = ((await orderApi.list({ page: 1, size: 100 })) as any).data ?? []; } catch { orders.value = []; }
}
onMounted(() => { load(); loadOrders(); });

// Detail
const detailVisible = ref(false);
const detailData = ref<any>(null);
async function viewDetail(id: number) {
  const res = await settlementApi.get(id);
  detailData.value = res?.data ?? res;
  detailVisible.value = true;
  loadChangeLogs();
}
const changeLogs = ref<any[]>([]);
const fieldLabel = (f: string) => ({
  exchange_rate: '结算汇率', invoice_amount_usd: '发票金额$', receipt_usd: '实际收汇$',
  freight_fee: '运杂费', express_fee: '快邮费', sample_fee: '打样费', other_fee: '其它费用',
  tax_refund: '出口退税', RECALC: '🔄 刷新付款汇总', REOPEN: '🔴 红冲重开(版本快照)',
} as Record<string, string>)[f] ?? f;
async function loadChangeLogs() {
  try {
    const res = await settlementApi.changeLogs(detailData.value.id);
    changeLogs.value = res?.data ?? [];
  } catch { changeLogs.value = []; }
}
async function reloadDetail() {
  const full = await settlementApi.get(detailData.value.id);
  detailData.value = full?.data ?? full;
  loadChangeLogs();
}
async function doReopen() {
  await settlementApi.reopen(detailData.value.id);
  await reloadDetail();
  ElMessage.success('已红冲重开，本单回到草稿可重算');
  load();
}
const hasReceiptRows = computed(() => (detailData.value?.receipts ?? []).length > 0);
const hasRatedReceipts = computed(() => {
  const rs = detailData.value?.receipts ?? [];
  return rs.length > 0 && rs.every((r: any) => r.exchange_rate != null && +r.exchange_rate > 0);
});
const costRowClass = ({ row }: { row: any }) => (row.included === 0 || row.pay_status === 'CONFIRMED' ? 'row-unpaid' : '');

// 刷新付款汇总（结算稿D：重取出货件数 + 按订单对账重建成本快照）
const refreshing = ref(false);
async function doRefreshCost() {
  refreshing.value = true;
  try {
    await settlementApi.refreshCost(detailData.value.id);
    await reloadDetail();
    ElMessage.success('付款汇总已刷新');
    load();
  } finally { refreshing.value = false; }
}

async function doRemoveCost(costId: number) {
  await settlementApi.removeCost(detailData.value.id, costId);
  await reloadDetail();
  ElMessage.success('成本行已删除');
  load();
}
async function doRemoveReceipt(receiptId: number) {
  await settlementApi.removeReceipt(detailData.value.id, receiptId);
  await reloadDetail();
  ElMessage.success('收汇记录已删除');
  load();
}

// 编辑结算单（草稿限定）
const editVisible = ref(false);
const editForm = reactive({
  exchange_rate: undefined as number | undefined,
  invoice_amount_usd: undefined as number | undefined,
  receipt_usd: undefined as number | undefined,
  freight_fee: undefined as number | undefined,
  express_fee: undefined as number | undefined,
  sample_fee: undefined as number | undefined,
  other_fee: undefined as number | undefined,
  tax_refund: undefined as number | undefined,
  description: '',
});
function openEdit() {
  const d = detailData.value;
  Object.assign(editForm, {
    exchange_rate: d.exchange_rate != null ? +d.exchange_rate : undefined,
    invoice_amount_usd: d.invoice_amount_usd != null ? +d.invoice_amount_usd : undefined,
    receipt_usd: d.receipt_usd != null ? +d.receipt_usd : undefined,
    freight_fee: d.freight_fee != null ? +d.freight_fee : undefined,
    express_fee: d.express_fee != null ? +d.express_fee : undefined,
    sample_fee: d.sample_fee != null ? +d.sample_fee : undefined,
    other_fee: d.other_fee != null ? +d.other_fee : undefined,
    tax_refund: d.tax_refund != null ? +d.tax_refund : undefined,
    description: d.description ?? '',
  });
  editVisible.value = true;
}
async function doUpdate() {
  saving.value = true;
  try {
    const dto: Record<string, unknown> = { ...editForm };
    if (hasReceiptRows.value) delete dto.receipt_usd; // 已有逐笔收汇由后端累计
    await settlementApi.update(detailData.value.id, dto);
    await reloadDetail();
    ElMessage.success('已保存并重算');
    editVisible.value = false;
    load();
  } finally { saving.value = false; }
}

async function doConfirm(row: any) {
  await settlementApi.confirm(row.id);
  ElMessage.success('已确认结算单');
  load();
}

async function doRemove(id: number) {
  await settlementApi.remove(id);
  ElMessage.success('删除成功');
  load();
}

// Create
const createVisible = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({
  order_id: undefined as number | undefined,
  exchange_rate: undefined as number | undefined,
  invoice_amount_usd: undefined as number | undefined,
  receipt_usd: undefined as number | undefined,
  freight_fee: undefined as number | undefined,
  express_fee: undefined as number | undefined,
  sample_fee: undefined as number | undefined,
  other_fee: undefined as number | undefined,
  tax_refund: undefined as number | undefined,
  description: '',
  costs: [] as any[],
});
const createRules: FormRules = {
  order_id: [{ required: true, message: '请输入订单ID', trigger: 'blur' }],
};
function openCreate() { createVisible.value = true; }
function resetCreateForm() {
  Object.assign(createForm, {
    order_id: undefined, exchange_rate: undefined, invoice_amount_usd: undefined, receipt_usd: undefined,
    freight_fee: undefined, express_fee: undefined, sample_fee: undefined, other_fee: undefined,
    tax_refund: undefined, description: '', costs: [],
  });
}
// 展示辅助
const money = (v: any) => (v == null ? '—' : (+v).toFixed(2));
const num4 = (v: any) => (v == null ? '—' : (+v).toFixed(4));
const periodFeeTotal = (d: any) =>
  (+(d?.freight_fee ?? 0)) + (+(d?.express_fee ?? 0)) + (+(d?.sample_fee ?? 0)) + (+(d?.other_fee ?? 0));
function addCostLine() { createForm.costs.push({ cost_name: '', amount: undefined, has_invoice: 1, tax_rate: 13 }); }
function removeCostLine(idx: number) { createForm.costs.splice(idx, 1); }
async function doCreate() {
  await createFormRef.value?.validate();
  saving.value = true;
  try {
    await settlementApi.create(createForm as any);
    ElMessage.success('创建成功');
    createVisible.value = false;
    load();
  } finally { saving.value = false; }
}

// Add Cost (in detail)
const addCostVisible = ref(false);
const addCostFormRef = ref<FormInstance>();
const costForm = reactive({ cost_name: '', amount: undefined as number | undefined, has_invoice: 1 });
const costRules: FormRules = {
  cost_name: [{ required: true, message: '请填写费用名称', trigger: 'blur' }],
  amount: [{ required: true, message: '请填写金额', trigger: 'blur' }],
};
function openAddCost() {
  Object.assign(costForm, { cost_name: '', amount: undefined, has_invoice: 1 });
  addCostVisible.value = true;
}
async function doAddCost() {
  await addCostFormRef.value?.validate();
  saving.value = true;
  try {
    await settlementApi.addCost(detailData.value.id, costForm as any);
    const full = await settlementApi.get(detailData.value.id);
    detailData.value = full?.data ?? full;
    ElMessage.success('费用已添加');
    addCostVisible.value = false;
    load();
  } finally { saving.value = false; }
}

// Add Receipt (in detail)
const addReceiptVisible = ref(false);
const addReceiptFormRef = ref<FormInstance>();
const receiptForm = reactive({
  amount: undefined as number | undefined,
  receipt_date: '',
  exchange_rate: undefined as number | undefined,
  slip_url: '',
  remark: '',
});
const receiptRules: FormRules = {
  amount: [{ required: true, message: '请填写收汇金额', trigger: 'blur' }],
  receipt_date: [{ required: true, message: '请选择收汇日期', trigger: 'change' }],
};
function openAddReceipt() {
  Object.assign(receiptForm, { amount: undefined, receipt_date: '', exchange_rate: undefined, slip_url: '', remark: '' });
  addReceiptVisible.value = true;
}
async function doAddReceipt() {
  await addReceiptFormRef.value?.validate();
  saving.value = true;
  try {
    const dto: Record<string, unknown> = { ...receiptForm };
    if (!dto.exchange_rate) delete dto.exchange_rate;
    if (!dto.slip_url) delete dto.slip_url;
    await settlementApi.addReceipt(detailData.value.id, dto);
    await reloadDetail();
    ElMessage.success('收汇已登记');
    addReceiptVisible.value = false;
    load();
  } finally { saving.value = false; }
}
</script>

<style scoped>
.page-container { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.search-card :deep(.el-card__body) { padding: 16px 16px 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
.item-row { margin-bottom: 8px; }
.detail-toolbar { margin-bottom: 8px; }
.text-danger { color: #f56c6c; }
.text-success { color: #67c23a; }
.muted { color: var(--el-text-color-secondary); }
.unpaid-grey { color: var(--el-text-color-secondary); }
.hint-inline { font-size: 12px; color: var(--el-text-color-secondary); margin-left: 8px; }
:deep(.row-unpaid) { color: var(--el-text-color-disabled); background: var(--el-fill-color-lighter); }
.agg-hint { font-size: 12px; color: #3E8E7E; background: var(--el-fill-color-light); border-radius: 4px; padding: 8px 10px; margin-bottom: 12px; }
</style>
