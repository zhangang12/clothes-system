<template>
  <div class="page-container">
    <RuleHint>付款<b>支持分批</b>,多次付款自动累计已付/未付,余额=0 整单转已付清;<b>付款须上传银行水单(必填)</b>;无合同付款须填收款银行/账号/相关款号;预付款可在付款申请时冲抵。</RuleHint>
    <div class="page-toolbar">
      <span class="toolbar-tip">按工厂一次拉齐该公司往来账：付款申请 + 实付记录 + 预付款 + 对账单</span>
      <el-button type="primary" plain :icon="Download" @click="openStatement">导出工厂账单</el-button>
    </div>
    <el-tabs v-model="activeTab" type="border-card">
      <!-- ====== 预付款 Tab ====== -->
      <el-tab-pane label="预付款管理" name="prepayment">
        <el-card class="search-card" shadow="never">
          <el-form :model="prepayQuery" inline>
            <el-form-item label="工厂">
              <div style="width:200px"><factory-select v-model="prepayQuery.factory_id" placeholder="按名称筛选工厂" @update:model-value="loadPrepay" /></div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :icon="Search" @click="loadPrepay">搜索</el-button>
              <el-button :icon="Refresh" @click="resetPrepay">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <div class="table-toolbar">
          <!-- 余额接口按角色开放（管理员/主管/财务/业务）：仍要挡住版师、打样间这些角色，
               否则他们选个工厂就撞 403 -->
          <div class="balance-info" v-if="canPrepay && prepayQuery.factory_id">
            工厂可用预付款余额：<strong class="balance-num">{{ prepayBalance.toFixed(2) }}</strong>
            <el-button link type="primary" size="small" style="margin-left:8px" @click="loadBalance">刷新余额</el-button>
          </div>
          <el-button v-if="canPrepay" type="primary" :icon="Plus" @click="openCreatePrepay">创建预付款</el-button>
        </div>

        <el-table :data="prepayList" v-loading="prepayLoading" border stripe>
          <el-table-column prop="id" label="ID" width="70" align="center" />
          <el-table-column label="工厂" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.factory_name || ('工厂#' + row.factory_id) }}</template>
          </el-table-column>
          <el-table-column label="关联合同" width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.contract_no || (row.contract_id ? '合同#' + row.contract_id : '—') }}</template>
          </el-table-column>
          <el-table-column prop="amount" label="预付金额" width="120" align="right">
            <template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="used_amount" label="已用金额" width="110" align="right">
            <template #default="{ row }">{{ (+row.used_amount).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="balance" label="剩余余额" width="110" align="right">
            <template #default="{ row }">
              <span :class="{ 'text-danger': +row.balance <= 0 }">{{ (+row.balance).toFixed(2) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="pay_date" label="付款日期" width="120" />
          <el-table-column prop="remark" label="备注" />
          <el-table-column label="创建时间" width="150">
            <template #default="{ row }">{{ fmtDateTime(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button link size="small" @click="exportPrepayRow(row)">导出Excel</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination">
          <el-pagination
            v-model:current-page="prepayQuery.page"
            v-model:page-size="prepayQuery.size"
            :total="prepayTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @change="loadPrepay"
          />
        </div>
      </el-tab-pane>

      <!-- ====== 付款申请 Tab ====== -->
      <el-tab-pane label="付款申请" name="request">
        <!-- 从对账单跳来时的过滤条：必须显式可见可清，否则用户在本页再检索会被这个
             看不见的条件夹着、以为是系统查不到数据 -->
        <el-alert v-if="filteredByReconcile" type="info" :closable="false" show-icon style="margin-bottom:8px">
          <template #title>
            仅显示对账单 #{{ filteredByReconcile }} 关联的付款申请
            <el-link type="primary" style="margin-left:8px" @click="clearReconcileFilter">显示全部</el-link>
          </template>
        </el-alert>
        <el-card class="search-card" shadow="never">
          <el-form :model="prQuery" inline>
            <el-form-item label="工厂">
              <div style="width:200px"><factory-select v-model="prQuery.factory_id" placeholder="按名称筛选工厂" @update:model-value="loadPR" /></div>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="prQuery.approval_status" clearable placeholder="全部" style="width:110px" @change="loadPR">
                <el-option label="草稿" value="DRAFT" />
                <el-option label="待审批" value="PENDING" />
                <el-option label="已批准" value="APPROVED" />
                <el-option label="已驳回" value="REJECTED" />
                <el-option label="已付款" value="PAID" />
              </el-select>
            </el-form-item>
            <el-form-item label="申请日期">
              <el-date-picker
                v-model="prDateRange"
                type="daterange"
                value-format="YYYY-MM-DD"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                style="width:240px"
                @change="loadPR"
              />
            </el-form-item>
          <el-form-item label="到期日">
            <el-date-picker v-model="prQuery.due_start" type="date" value-format="YYYY-MM-DD" placeholder="起" style="width:130px" @change="loadPR" />
            <span style="margin:0 4px">—</span>
            <el-date-picker v-model="prQuery.due_end" type="date" value-format="YYYY-MM-DD" placeholder="止" style="width:130px" @change="loadPR" />
          </el-form-item>
          <el-form-item label="付款日">
            <el-date-picker v-model="prQuery.paid_start" type="date" value-format="YYYY-MM-DD" placeholder="起" style="width:130px" @change="loadPR" />
            <span style="margin:0 4px">—</span>
            <el-date-picker v-model="prQuery.paid_end" type="date" value-format="YYYY-MM-DD" placeholder="止" style="width:130px" @change="loadPR" />
          </el-form-item>
            <el-form-item>
              <el-button type="primary" :icon="Search" @click="loadPR">搜索</el-button>
              <el-button :icon="Refresh" @click="resetPR">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <div class="table-toolbar">
          <span></span>
          <el-button v-if="canCreatePR" type="primary" :icon="Plus" @click="openCreatePR">新建付款申请</el-button>
        </div>

        <div class="pr-legend">
          <span class="lg lg-paid"></span>已付清
          <span class="lg lg-partial"></span>部分付款
          <span class="lg-tip">（按已付/应付判定，与审批状态无关）</span>
        </div>
        <el-table :data="prList" v-loading="prLoading" border stripe :row-class-name="prRowClass">
          <el-table-column prop="pr_no" label="申请编号" width="180" />
          <el-table-column prop="type" label="类型" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="row.type === 'CONTRACT' ? '' : 'warning'">
                {{ row.type === 'CONTRACT' ? '合同付款' : '非合同付款' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="工厂" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.factory_name || ('工厂#' + row.factory_id) }}</template>
          </el-table-column>
          <el-table-column prop="amount" label="申请金额" width="110" align="right">
            <template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="prepay_offset" label="冲抵预付" width="100" align="right">
            <template #default="{ row }">{{ (+row.prepay_offset).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="actual_pay" label="应付总额" width="110" align="right">
            <template #default="{ row }">
              <strong>{{ row.actual_pay != null ? (+row.actual_pay).toFixed(2) : '--' }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="账期" width="76" align="center">
            <template #default="{ row }">{{ row.account_period_days != null ? row.account_period_days + '天' : '—' }}</template>
          </el-table-column>
          <el-table-column label="到期日" width="112">
            <template #default="{ row }">
              <span :class="{ 'text-danger': isOverdue(row) }">{{ row.due_date ? String(row.due_date).slice(0, 10) : '—' }}</span>
              <el-tag v-if="isOverdue(row)" type="danger" size="small" style="margin-left:2px">逾期</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="已付/余额" width="130" align="right">
            <template #default="{ row }">
              {{ (+(row.paid_total ?? 0)).toFixed(2) }} / <b :class="{ 'text-danger': prBalance(row) > 0 && row.approval_status === 'APPROVED' }">{{ prBalance(row).toFixed(2) }}</b>
            </template>
          </el-table-column>
          <el-table-column label="发票" width="72" align="center">
            <template #default="{ row }">
              <el-tooltip v-if="row.invoice_url" :content="row.invoice_no || '发票附件'" placement="top">
                <el-link type="primary" @click="preview?.open(String(row.invoice_url).split(',')[0], '发票')">查看</el-link>
              </el-tooltip>
              <span v-else-if="row.invoice_no" class="mono">{{ row.invoice_no }}</span>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column prop="approval_status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="prTagType(row.approval_status)" size="small">{{ prStatusLabel(row.approval_status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="330" fixed="right">
            <template #default="{ row }">
              <el-button link size="small" @click="exportPRRow(row)">导出Excel</el-button>
              <!-- 改草稿（2026-08-10 King：非合同付款草稿建错了没法调）。
                   业务只能改自己建的，后端同样把关 -->
              <el-button
                v-if="row.approval_status === 'DRAFT' && canEditDraft(row)"
                link type="primary" size="small"
                @click="openEditPR(row)"
              >编辑</el-button>
              <el-button
                v-if="row.approval_status === 'DRAFT' && canEdit"
                link type="primary" size="small"
                @click="doSubmit(row)"
              >提交</el-button>
              <!-- 无权提交时把原因说出来，别让草稿看起来是个死胡同 -->
              <el-tooltip v-else-if="row.approval_status === 'DRAFT'" placement="top"
                content="提交审批需要财务或管理员操作；你可以先编辑好内容，再请财务提交">
                <span><el-button link size="small" disabled>提交（需财务）</el-button></span>
              </el-tooltip>
              <el-button
                v-if="row.approval_status === 'PENDING' && isAdmin"
                link type="success" size="small"
                @click="doApprove(row)"
              >批准</el-button>
              <el-button
                v-if="row.approval_status === 'PENDING' && isAdmin"
                link type="warning" size="small"
                @click="openReject(row)"
              >驳回</el-button>
              <el-button
                v-if="row.approval_status === 'APPROVED' && canEdit"
                link type="primary" size="small"
                @click="openMarkPaid(row)"
              >付款</el-button>
              <!-- 未审批时也把入口露出来（禁用+说明）：此前这一列只剩「导出Excel」，
                   财务看不出「付了多少填在哪儿」，误以为没这功能（2026-08-10 qiao 反馈） -->
              <el-tooltip v-if="row.approval_status === 'PENDING' && canEdit" placement="top"
                content="需先由管理员/主管批准这笔申请，批准后此处变为可点，即可登记付款金额并上传水单">
                <span><el-button link size="small" disabled>付款（待批准）</el-button></span>
              </el-tooltip>
              <el-button
                v-if="row.approval_status === 'PAID' || +(row.paid_total ?? 0) > 0"
                link size="small"
                @click="openMarkPaid(row)"
              >付款记录</el-button>
              <el-popconfirm v-if="row.approval_status === 'DRAFT' && isAdmin" title="确认删除？" @confirm="doPRRemove(row.id)">
                <template #reference>
                  <el-button link type="danger" size="small">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination">
          <el-pagination
            v-model:current-page="prQuery.page"
            v-model:page-size="prQuery.size"
            :total="prTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @change="loadPR"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 工厂账单导出（2026-08-11 qiao 反馈） -->
    <el-dialog v-model="stmtVisible" title="导出工厂账单" width="520px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="工厂" required>
          <factory-select v-model="stmtForm.factory_id" placeholder="按名称/编号搜索工厂" />
        </el-form-item>
        <el-form-item label="账单区间">
          <el-date-picker
            v-model="stmtRange" type="daterange" value-format="YYYY-MM-DD"
            range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期"
            style="width:100%"
          />
        </el-form-item>
        <!-- 口径必须当面说清：三类单据各按自己的自然日期过滤，不写出来业务会以为是同一个日期 -->
        <el-alert type="info" :closable="false" show-icon>
          <template #title>
            <div>不选区间即导出<b>全部</b>历史账单。</div>
            <div style="margin-top:4px">区间口径：付款申请按<b>申请日期</b>、预付款按<b>付款日期</b>、对账单按<b>创建日期</b>。</div>
          </template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="stmtVisible = false">取消</el-button>
        <el-button type="primary" :loading="stmtLoading" @click="doExportStatement">导出 Excel</el-button>
      </template>
    </el-dialog>

    <!-- 创建预付款弹窗 -->
    <el-dialog v-model="createPrepayVisible" title="创建预付款" width="480px" destroy-on-close @closed="resetPrepayForm">
      <el-form ref="prepayFormRef" :model="prepayForm" :rules="prepayRules" label-width="90px">
        <el-form-item label="工厂" prop="factory_id">
          <factory-select v-model="prepayForm.factory_id" />
        </el-form-item>
        <el-form-item label="按款号选合同">
          <contract-picker v-model="prepayForm.contract_id" @pick="onPrepayPickContract" />
        </el-form-item>
        <el-form-item label="预付金额" prop="amount">
          <el-input-number v-model="prepayForm.amount" :min="0.01" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="付款日期" prop="pay_date">
          <el-date-picker v-model="prepayForm.pay_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="相关款号">
          <el-input v-model="prepayForm.style_no" placeholder="预付归集用(选填,P3#40)" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="prepayForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createPrepayVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreatePrepay">保存</el-button>
      </template>
    </el-dialog>

    <!-- 创建付款申请弹窗 -->
    <el-dialog v-model="createPRVisible" :title="editingPRId ? '修改付款申请（草稿）' : '新建付款申请'" width="560px" destroy-on-close @closed="resetPRForm">
      <el-form ref="prFormRef" :model="prForm" :rules="prRules" label-width="100px">
        <el-form-item label="类型" prop="type">
          <el-select v-model="prForm.type" style="width:100%">
            <el-option label="合同付款" value="CONTRACT" />
            <el-option label="非合同付款" value="NO_CONTRACT" />
          </el-select>
        </el-form-item>
        <el-form-item label="工厂" prop="factory_id">
          <factory-select v-model="prForm.factory_id" />
        </el-form-item>
        <el-form-item v-if="prForm.type === 'CONTRACT'" label="按款号选合同">
          <contract-picker @pick="onPrPickContract" />
        </el-form-item>
        <el-alert
          v-if="prPrepayBalance > 0"
          type="warning"
          :closable="false"
          show-icon
          style="margin: 0 0 12px;"
        >
          <template #title>
            该工厂存在可用预付款余额 ¥{{ prPrepayBalance.toFixed(2) }}
            <el-button link type="primary" size="small" style="margin-left:8px" @click="applyPrepayOffset">一键冲抵</el-button>
          </template>
        </el-alert>
        <!-- 发票（#92 King：「非合同付款可以我们自己上传发票吗？」）。
             合同付款的发票在对账单上，这里主要给非合同付款用；不硬性按类型隐藏，
             因为"对账时没票、付款时补票"确实存在，藏掉只会让业务绕路。 -->
        <el-form-item label="发票号">
          <el-input v-model="prForm.invoice_no" placeholder="选填；非合同付款可自行登记" />
        </el-form-item>
        <el-form-item label="发票附件">
          <file-upload v-model="prForm.invoice_url" :limit="3" multiple accept="image/*,.pdf" tip="发票照片或 PDF" />
        </el-form-item>
        <el-form-item label="对账单ID">
          <el-input-number v-model="prForm.reconcile_id" :min="1" style="width:100%" />
        </el-form-item>
        <el-form-item label="申请金额" prop="amount">
          <el-input-number v-model="prForm.amount" :min="0.01" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="冲抵预付款">
          <el-input-number v-model="prForm.prepay_offset" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <template v-if="prForm.type === 'NO_CONTRACT'">
          <el-form-item label="收款银行">
            <el-input v-model="prForm.bank_name" placeholder="无合同付款须留收款信息" />
          </el-form-item>
          <el-form-item label="收款账号">
            <el-input v-model="prForm.bank_account" />
          </el-form-item>
          <el-form-item label="相关款号">
            <el-input v-model="prForm.related_style_no" placeholder="归集用(选填)" />
          </el-form-item>
        </template>
        <el-form-item label="备注">
          <el-input v-model="prForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createPRVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreatePR">保存</el-button>
      </template>
    </el-dialog>

    <!-- 驳回弹窗 -->
    <el-dialog v-model="rejectVisible" title="驳回原因" width="400px">
      <el-input v-model="rejectReason" type="textarea" :rows="3" placeholder="请填写驳回原因" />
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="doReject">确认驳回</el-button>
      </template>
    </el-dialog>

    <!-- 财务付款（分批 v1.1：多次付款累计已付/未付，余额=0 整单转已付清；水单支持上传/拖拽/Ctrl+V 粘贴） -->
    <el-dialog v-model="markPaidVisible" title="💰 财务付款（可分批）" width="560px" @closed="resetSlip">
      <el-descriptions :column="3" border size="small" style="margin-bottom:12px">
        <el-descriptions-item label="应付总额">{{ payTarget ? (+(payTarget.actual_pay ?? payTarget.amount)).toFixed(2) : '—' }}</el-descriptions-item>
        <el-descriptions-item label="已付总额">{{ payTarget ? (+(payTarget.paid_total ?? 0)).toFixed(2) : '—' }}</el-descriptions-item>
        <el-descriptions-item label="未付余额"><b class="text-danger">{{ payTarget ? prBalance(payTarget).toFixed(2) : '—' }}</b></el-descriptions-item>
      </el-descriptions>
      <template v-if="payRecords.length">
        <el-table :data="payRecords" size="small" border style="margin-bottom:12px">
          <el-table-column type="index" label="批次" width="56" align="center" />
          <el-table-column label="方式" width="90"><template #default="{ row }">{{ payMethodLabel(row.pay_method) }}</template></el-table-column>
          <el-table-column prop="pay_date" label="付款日期" width="104" />
          <el-table-column prop="amount" label="金额" width="100" align="right"><template #default="{ row }">{{ (+row.amount).toFixed(2) }}</template></el-table-column>
          <el-table-column label="水单" width="70" align="center"><template #default="{ row }"><el-link v-if="row.slip_url" type="primary" @click="preview?.open(row.slip_url, '付款水单')">查看</el-link><span v-else>—</span></template></el-table-column>
          <el-table-column prop="remark" label="备注" min-width="90" />
        </el-table>
      </template>
      <el-form v-if="payTarget?.approval_status === 'APPROVED'" label-width="96px">
        <el-form-item label="付款方式" required>
          <el-radio-group v-model="payForm.pay_method">
            <el-radio value="BANK">银行转账</el-radio>
            <el-radio value="ACCEPTANCE">承兑汇票</el-radio>
            <el-radio value="OTHER">其他</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="付款日期" required>
          <el-date-picker v-model="payForm.pay_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="本次付款金额" required>
          <el-input-number v-model="payForm.amount" :min="0.01" :precision="2" :controls="false" style="width:100%" placeholder="默认=未付余额，可改小分批付" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="payForm.remark" placeholder="选填" />
        </el-form-item>
        <el-form-item label="付款水单">
          <div class="slip-uploader" @paste="onSlipPaste" tabindex="0">
            <el-upload
              :show-file-list="false"
              :before-upload="onSlipBeforeUpload"
              accept="image/*,application/pdf"
              drag
            >
              <div v-if="slipUrl" class="slip-preview">
                <img :src="slipUrl" alt="付款水单" />
              </div>
              <div v-else class="slip-empty">
                <el-icon :size="34"><UploadFilled /></el-icon>
                <div class="slip-tip">点击上传 / 拖拽文件，或聚焦此处按 <b>Ctrl+V</b> 粘贴截图</div>
              </div>
            </el-upload>
            <div v-if="slipUploading" class="slip-loading">上传中…</div>
          </div>
        </el-form-item>
        <el-form-item label="水单URL">
          <el-input v-model="slipUrl" placeholder="上传后自动填入，也可手动粘贴地址" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="markPaidVisible = false">关闭</el-button>
        <el-button v-if="payTarget?.approval_status === 'APPROVED'" type="primary" :loading="saving" :disabled="slipUploading" @click="doAddRecord">💰 确认付款</el-button>
      </template>
    </el-dialog>
  </div>

    <FilePreviewDialog ref="preview" />
</template>

<script setup lang="ts">
import { errToast } from '@/api';
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { fmtDateTime } from '@/utils/format';
import { Search, Refresh, Plus, UploadFilled, Download } from '@element-plus/icons-vue';
import FilePreviewDialog from '@/components/FilePreviewDialog.vue';
import FileUpload from '@/components/FileUpload.vue';
import type { FormInstance, FormRules } from 'element-plus';
import { prepaymentApi, paymentRequestApi } from '@/api/payment';
import FactorySelect from '@/components/FactorySelect.vue';
import ContractPicker from '@/components/ContractPicker.vue';
import { uploadApi } from '@/api/upload';
import { openFile } from '@/utils/secureFile';
import { exportPaymentRequestExcel, exportPrepaymentExcel } from '@/utils/paymentExcel';
import { exportFactoryStatementExcel } from '@/utils/factoryStatementExcel';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

const authStore = useAuthStore();
const preview = ref<any>(null);
const isAdmin = computed(() => authStore.hasRole(UserRole.ADMIN));
const canEdit = computed(() => authStore.hasRole(UserRole.ADMIN) || authStore.hasRole(UserRole.FINANCE));
// 「新建付款申请」单独放行 BUSINESS：后端 POST /payments/requests 是
// @Roles(ADMIN, FINANCE, BUSINESS)，注释写明「业务可发起无合同付款」，
// 前端却按 canEdit 关了入口 → 业务能进页面、能看列表，就是建不了单。
// 【别把 BUSINESS 塞进 canEdit 本体】提交/审批/登记实付/标记已付这几步后端仍是
// ADMIN/FINANCE，塞进去等于一次放出几条必 403 的路径。要放开就单开一个计算属性。
const canCreatePR = computed(() => canEdit.value || authStore.hasRole(UserRole.BUSINESS));
// 预付款的登记与余额查询（2026-08-22 放开到业务，后端同步改成 ADMIN/FINANCE/BUSINESS）：
// 登记一笔预付是发起动作，钱要真花出去仍得走付款申请、由管理员/财务审批时才冲抵
const canPrepay = canCreatePR;

const route = useRoute();
const router = useRouter();
const activeTab = ref('prepayment');

function prStatusLabel(s: string) {
  return { DRAFT: '草稿', PENDING: '待审批', APPROVED: '已批准', REJECTED: '已驳回', PAID: '已付款' }[s] ?? s;
}
function prTagType(s: string): any {
  return { DRAFT: 'info', PENDING: 'warning', APPROVED: 'primary', REJECTED: 'danger', PAID: 'success' }[s] ?? 'info';
}

// ====== Prepayment ======
const prepayLoading = ref(false);
const saving = ref(false);
const prepayList = ref<any[]>([]);
const prepayTotal = ref(0);
const prepayBalance = ref(0);
const prepayQuery = reactive({ page: 1, size: 20, factory_id: undefined as number | undefined });

async function loadPrepay() {
  prepayLoading.value = true;
  try {
    const res = await prepaymentApi.list(prepayQuery);
    prepayList.value = res?.data ?? [];
    prepayTotal.value = res?.data?.total ?? res?.total ?? 0;
  } finally { prepayLoading.value = false; }
}

async function loadBalance() {
  if (!canPrepay.value) return;        // 无权限的角色根本不发这个请求
  if (!prepayQuery.factory_id) return;
  const res = await prepaymentApi.getBalance(prepayQuery.factory_id);
  prepayBalance.value = res?.data ?? res ?? 0;
}

watch(() => prepayQuery.factory_id, (v) => { if (v) loadBalance(); else prepayBalance.value = 0; });

function resetPrepay() {
  prepayQuery.factory_id = undefined;
  prepayQuery.page = 1;
  prepayBalance.value = 0;
  loadPrepay();
}

const createPrepayVisible = ref(false);
const prepayFormRef = ref<FormInstance>();
const prepayForm = reactive({
  factory_id: undefined as number | undefined,
  contract_id: undefined as number | undefined,
  amount: undefined as number | undefined,
  pay_date: '',
  style_no: '',
  remark: '',
});
const prepayRules: FormRules = {
  factory_id: [{ required: true, message: '请选择工厂', trigger: 'change' }],
  amount: [{ required: true, message: '请输入预付金额', trigger: 'blur' }],
  pay_date: [{ required: true, message: '请选择付款日期', trigger: 'change' }],
};
// 「按款号选合同」选中后带出工厂(有合同路径);无合同路径直接用上方工厂选择器
function onPrepayPickContract(c: any) { if (c?.factory_id) prepayForm.factory_id = Number(c.factory_id); }
function openCreatePrepay() { createPrepayVisible.value = true; }
function resetPrepayForm() {
  Object.assign(prepayForm, { factory_id: undefined, contract_id: undefined, amount: undefined, pay_date: '', style_no: '', remark: '' });
}
async function doCreatePrepay() {
  await prepayFormRef.value?.validate();
  saving.value = true;
  try {
    await prepaymentApi.create(prepayForm as any);
    ElMessage.success('创建成功');
    createPrepayVisible.value = false;
    loadPrepay();
    if (prepayQuery.factory_id) loadBalance();
  } finally { saving.value = false; }
}

// 导出 Excel(付款模块无详情接口,直接用列表行;.xls)
function exportPrepayRow(row: any) {
  try { exportPrepaymentExcel(row); }
  catch (e: any) { errToast(e?.response?.data?.msg ?? e?.message ?? '导出失败'); }
}

// ====== 工厂账单导出（2026-08-11 qiao：「按工厂名称下载 EXCEL，拉出这个公司的所有账单」）======
// 一次请求取齐四类单据（后端 /payments/factory-statement），前端只负责排版落盘。
const stmtVisible = ref(false);
const stmtLoading = ref(false);
const stmtForm = reactive({ factory_id: undefined as number | undefined });
const stmtRange = ref<[string, string] | null>(null);

function openStatement() {
  // 带上当前 Tab 已经筛好的工厂，省得再选一次
  stmtForm.factory_id = (activeTab.value === 'prepayment' ? prepayQuery.factory_id : prQuery.factory_id) ?? undefined;
  stmtRange.value = null;
  stmtVisible.value = true;
}

async function doExportStatement() {
  if (!stmtForm.factory_id) { ElMessage.warning('请先选择工厂'); return; }
  stmtLoading.value = true;
  try {
    const params: { factory_id: number; start_date?: string; end_date?: string } = { factory_id: stmtForm.factory_id };
    if (stmtRange.value?.length === 2) {
      params.start_date = stmtRange.value[0];
      params.end_date = stmtRange.value[1];
    }
    const res: any = await paymentRequestApi.factoryStatement(params);
    const st = res?.data ?? res;
    // 四类单据全空就别下发一张空表——用户看到一份什么都没有的 Excel 会以为是导出坏了，
    // 明确告诉他"这家在这个区间内没有往来"更有用
    const n = (st?.requests?.length ?? 0) + (st?.prepayments?.length ?? 0) + (st?.reconciliations?.length ?? 0);
    if (!n) { ElMessage.warning('该工厂在所选区间内没有任何往来记录，未生成文件'); return; }
    await exportFactoryStatementExcel(st, fmtDateTime(new Date()));
    stmtVisible.value = false;
  } catch (e: any) {
    errToast(e?.response?.data?.msg ?? e?.message ?? '导出失败');
  } finally { stmtLoading.value = false; }
}

// ====== Payment Request ======
const prLoading = ref(false);
const prList = ref<any[]>([]);
const prTotal = ref(0);
const prQuery = reactive({
  page: 1, size: 20,
  factory_id: undefined as number | undefined,
  // reconcile_id 只由「对账单详情 → 付款申请」的跳转带入，检索区没有对应输入框
  reconcile_id: undefined as number | undefined,
  approval_status: undefined as string | undefined, due_start: '', due_end: '', paid_start: '', paid_end: '' });
// 申请日期范围（工厂+日期组合检索，付款申请设计稿 检索区）
const prDateRange = ref<[string, string] | null>(null);

async function loadPR() {
  prLoading.value = true;
  try {
    const params: Record<string, unknown> = { ...prQuery };
    if (prDateRange.value?.length === 2) {
      params.start_date = prDateRange.value[0];
      params.end_date = prDateRange.value[1];
    }
    const res = await paymentRequestApi.list(params);
    prList.value = res?.data ?? [];
    prTotal.value = res?.data?.total ?? res?.total ?? 0;
  } finally { prLoading.value = false; }
}

function resetPR() {
  Object.assign(prQuery, { factory_id: undefined, approval_status: undefined, page: 1 });
  prDateRange.value = null;
  loadPR();
}

// 导出 Excel(无详情接口,用列表行;先拉分批付款记录,拉不到则降级为不带记录表)
async function exportPRRow(row: any) {
  try {
    let records: any[] = [];
    try { records = ((await paymentRequestApi.getRecords(row.id)) as any).data ?? []; } catch { records = []; }
    exportPaymentRequestExcel({ ...row, records });
  } catch (e: any) { errToast(e?.response?.data?.msg ?? e?.message ?? '导出失败'); }
}

async function doSubmit(row: any) {
  await paymentRequestApi.submit(row.id);
  ElMessage.success('已提交审批');
  loadPR();
}

async function doApprove(row: any) {
  await paymentRequestApi.approve(row.id);
  ElMessage.success('审批通过');
  loadPR();
}

const rejectVisible = ref(false);
const rejectReason = ref('');
let rejectTarget: any = null;
function openReject(row: any) { rejectTarget = row; rejectReason.value = ''; rejectVisible.value = true; }
async function doReject() {
  if (!rejectReason.value.trim()) { ElMessage.warning('请填写驳回原因'); return; }
  saving.value = true;
  try {
    await paymentRequestApi.reject(rejectTarget.id, rejectReason.value);
    ElMessage.success('已驳回');
    rejectVisible.value = false;
    loadPR();
  } finally { saving.value = false; }
}

const markPaidVisible = ref(false);
const slipUrl = ref('');
const slipUploading = ref(false);
const payTarget = ref<any>(null);
const payRecords = ref<any[]>([]);
const payForm = reactive<any>({ pay_method: 'BANK', pay_date: new Date().toISOString().slice(0, 10), amount: undefined, remark: '' });
// 行着色（2026-08-10 qiao：已付清的要标一个颜色，付了一部分的标另一个颜色）。
// 判定按**金额**而不是状态：状态可能因为审批流还没流转到 PAID，但钱确实已经付清了，
// 财务看的是钱。余额<=0.01 视为付清（分批付款的小数尾差）。
function prRowClass({ row }: { row: any }): string {
  const paid = +(row?.paid_total ?? 0);
  if (paid <= 0) return '';
  return prBalance(row) <= 0.01 ? 'pr-paid' : 'pr-partial';
}
const prBalance = (row: any) => +((+(row.actual_pay ?? row.amount ?? 0)) - (+(row.paid_total ?? 0))).toFixed(2);
const isOverdue = (row: any) => {
  if (!row?.due_date || row.approval_status === 'PAID') return false;
  const d = new Date(String(row.due_date).slice(0, 10));
  return !isNaN(d.getTime()) && d < new Date();
};
const payMethodLabel = (m: string) => ({ BANK: '银行转账', ACCEPTANCE: '承兑汇票', OTHER: '其他' } as any)[m] ?? m;
async function openMarkPaid(row: any) {
  payTarget.value = row;
  slipUrl.value = '';
  Object.assign(payForm, { pay_method: 'BANK', pay_date: new Date().toISOString().slice(0, 10), amount: prBalance(row) > 0 ? prBalance(row) : undefined, remark: '' });
  try { payRecords.value = ((await paymentRequestApi.getRecords(row.id)) as any).data ?? []; } catch { payRecords.value = []; }
  markPaidVisible.value = true;
}
// 分批付款登记（设计稿 06 v1.1）：余额=0 后端自动整单转已付清并联动对账单
async function doAddRecord() {
  if (!payForm.pay_date) { ElMessage.warning('请选择付款日期'); return; }
  if (!(+payForm.amount > 0)) { ElMessage.warning('请填写本次付款金额'); return; }
  saving.value = true;
  try {
    const res: any = await paymentRequestApi.addRecord(payTarget.value.id, {
      pay_method: payForm.pay_method, pay_date: payForm.pay_date,
      amount: +payForm.amount, slip_url: slipUrl.value || undefined, remark: payForm.remark || undefined,
    });
    const d = res.data ?? res;
    ElMessage.success(d.balance <= 0.01 ? '已付清，整单转「已付款」' : `已登记本次付款，剩余未付 ${(+d.balance).toFixed(2)}`);
    markPaidVisible.value = false;
    loadPR();
  } catch (e: any) { errToast(e?.response?.data?.msg ?? '付款登记失败'); }
  finally { saving.value = false; }
}
function resetSlip() { slipUrl.value = ''; slipUploading.value = false; }

// 上传水单文件（点击/拖拽/粘贴共用）：走后端 /uploads，成功后写入 slip_url
async function uploadSlipFile(file: File) {
  slipUploading.value = true;
  try {
    const res: any = await uploadApi.upload(file, { sensitive: true }); // 水单属敏感附件
    slipUrl.value = (res?.data ?? res)?.url ?? '';
    if (slipUrl.value) ElMessage.success('水单上传成功');
  } catch {
    ElMessage.error('水单上传失败');
  } finally { slipUploading.value = false; }
}
// el-upload 拦截默认上传，改走自定义上传
function onSlipBeforeUpload(file: File) {
  uploadSlipFile(file);
  return false;
}
// 截图 Ctrl+V 粘贴：从剪贴板取图片直接上传
function onSlipPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const it of items) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) { e.preventDefault(); uploadSlipFile(f); return; }
    }
  }
}

async function doPRRemove(id: number) {
  await paymentRequestApi.remove(id);
  ElMessage.success('删除成功');
  loadPR();
}

const createPRVisible = ref(false);
const prFormRef = ref<FormInstance>();
const prPrepayBalance = ref(0);
const prForm = reactive({
  type: 'CONTRACT',
  factory_id: undefined as number | undefined,
  reconcile_id: undefined as number | undefined,
  amount: undefined as number | undefined,
  prepay_offset: 0,
  description: '',
  bank_name: '', bank_account: '', related_style_no: '',
  invoice_no: '', invoice_url: '',   // #92：非合同付款自行登记/上传发票
});
const prRules: FormRules = {
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  factory_id: [{ required: true, message: '请选择工厂', trigger: 'change' }],
  amount: [{ required: true, message: '请输入申请金额', trigger: 'blur' }],
};
// 有合同付款:按款号选合同带出工厂;无合同付款:直接用上方工厂选择器(两者都要)
function onPrPickContract(c: any) { if (c?.factory_id) prForm.factory_id = Number(c.factory_id); }
const editingPRId = ref<number | null>(null);
// 谁能改草稿：财务/管理员不限；业务能改**自己建的**——但前端拿不到当前用户 id
// （auth store 只存 role/realName），所以这里不假装判断归属，统一放出入口，
// 由后端 updatePaymentRequest 把关；越权时它返回的「只能修改自己创建的付款申请草稿」本身就是说明。
const canEditDraft = (_row: any) => canEdit.value || authStore.hasRole(UserRole.BUSINESS);

function openCreatePR() { editingPRId.value = null; createPRVisible.value = true; }
function openEditPR(row: any) {
  editingPRId.value = row.id;
  Object.assign(prForm, {
    type: row.type ?? 'CONTRACT',
    factory_id: row.factory_id ?? undefined,
    reconcile_id: row.reconcile_id ?? undefined,
    amount: +row.amount || undefined,
    prepay_offset: +row.prepay_offset || 0,
    description: row.description ?? '',
    bank_name: row.bank_name ?? '',
    invoice_no: row.invoice_no ?? '', invoice_url: row.invoice_url ?? '',   // #92：编辑草稿时带出已填的发票
    bank_account: row.bank_account ?? '',
    related_style_no: row.related_style_no ?? '',
  });
  createPRVisible.value = true;
}
function resetPRForm() {
  editingPRId.value = null; // 不清会让下次「新建」变成改上一条
  Object.assign(prForm, { type: 'CONTRACT', factory_id: undefined, reconcile_id: undefined, amount: undefined, prepay_offset: 0, description: '', bank_name: '', bank_account: '', related_style_no: '', invoice_no: '', invoice_url: '' });
  prPrepayBalance.value = 0;
}
// 选择工厂后自动提示是否存在可用预付款余额（付款申请设计稿：存在预付时提示冲抵）
watch(() => prForm.factory_id, async (fid) => {
  prPrepayBalance.value = 0;
  // getBalance 现在是 @Roles(ADMIN, FINANCE, BUSINESS)；版师等角色仍会被拦截器弹红字、
  // 本地 catch 拦不住，所以这里按同一份权限早退
  if (!createPRVisible.value || !fid || !canPrepay.value) return;
  try {
    const res: any = await prepaymentApi.getBalance(fid);
    prPrepayBalance.value = +(res?.data ?? res ?? 0) || 0;
  } catch { prPrepayBalance.value = 0; }
});
// 一键把可用预付款余额（不超过申请金额）填入冲抵栏
function applyPrepayOffset() {
  const bal = prPrepayBalance.value;
  const amt = prForm.amount ?? bal;
  prForm.prepay_offset = +Math.min(bal, amt).toFixed(2);
}
async function doCreatePR() {
  await prFormRef.value?.validate();
  saving.value = true;
  try {
    const dto: any = { ...prForm };
    for (const k of ['bank_name', 'bank_account', 'related_style_no']) if (!dto[k]) delete dto[k];
    if (editingPRId.value) {
      await paymentRequestApi.update(editingPRId.value, dto);
      ElMessage.success('已保存修改');
    } else {
      await paymentRequestApi.create(dto);
      ElMessage.success('创建成功');
    }
    createPRVisible.value = false;
    loadPR();
  } finally { saving.value = false; }
}

// 从对账单详情跳过来(/payments?tab=request&reconcile_id=N):切到付款申请页签并按该对账单过滤。
// 付款没有详情页，故落点是「过滤后的列表」而不是某一张单。
const filteredByReconcile = ref<number | null>(null);
onMounted(() => {
  const rid = Number(route.query.reconcile_id);
  if (rid) {
    prQuery.reconcile_id = rid;
    filteredByReconcile.value = rid;
  }
  if (route.query.tab === 'request' || rid) activeTab.value = 'request';
  // 从对账单「生成付款申请」跳过来：直接开弹窗并预填，省得再手工挑一遍对账单/工厂/金额
  // （2026-08-08 King：「是否能自动按发票生成付款申请单，直接带入款号相应对账单」）
  if (route.query.create === '1') {
    const q = route.query as Record<string, string>;
    Object.assign(prForm, {
      type: q.type || 'CONTRACT',
      reconcile_id: rid || undefined,
      factory_id: Number(q.factory_id) || undefined,
      amount: Number(q.amount) || undefined,
      related_style_no: q.related_style_no || '',
    });
    createPRVisible.value = true;
  }
  loadPrepay();
  loadPR();
});
// 清掉来源过滤：不清的话用户在本页做的其它检索都会被这个隐藏条件夹着，很难排查
function clearReconcileFilter() {
  prQuery.reconcile_id = undefined;
  filteredByReconcile.value = null;
  prQuery.page = 1;
  router.replace({ name: 'Payments' });
  loadPR();
}
</script>

<style scoped>
.page-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0; }
.page-toolbar .toolbar-tip { font-size: 12px; color: var(--el-text-color-secondary); }
/* 已付清 / 部分付款 行底色（2026-08-10 qiao）。用浅色底而非文字色：
   财务是扫一列看状态的，整行着色一眼能分堆 */
:deep(.el-table .pr-paid) > td { background: #f0f9eb !important; }
:deep(.el-table .pr-partial) > td { background: #fdf6ec !important; }
.pr-legend { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.lg { display: inline-block; width: 12px; height: 12px; border-radius: 2px; border: 1px solid var(--el-border-color); }
.lg-paid { background: #f0f9eb; }
.lg-partial { background: #fdf6ec; margin-left: 10px; }
.lg-tip { margin-left: 4px; }

.page-container { padding: 16px; }
.search-card { border: none; }
.search-card :deep(.el-card__body) { padding: 12px 12px 0; }
.table-toolbar { display: flex; justify-content: space-between; align-items: center; margin: 12px 0 8px; }
.balance-info { font-size: 14px; color: #606266; }
.balance-num { color: #409eff; font-size: 16px; }
.text-danger { color: #f56c6c; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
.slip-uploader { width: 100%; outline: none; }
.slip-uploader :deep(.el-upload-dragger) { padding: 12px; }
.slip-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #909399; padding: 8px 0; }
.slip-tip { font-size: 13px; line-height: 1.5; }
.slip-preview img { max-width: 100%; max-height: 200px; object-fit: contain; }
.slip-loading { margin-top: 6px; font-size: 13px; color: #409eff; text-align: center; }
</style>
