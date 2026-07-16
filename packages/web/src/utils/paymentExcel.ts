// 付款申请 / 预付款导出 Excel —— 结构声明式,BOM/转义/文本格式/落盘统一收在 docExcel.ts,这里只描述区块。
// 入参口径:付款模块【没有详情接口】(payment.controller.ts 只有 GET /payments/requests 与
// GET /payments/prepayments 两个列表),所以 detail 就是【列表行对象】——服务端 enrichNames() 已给行补了
// factory_name(预付款还补 contract_no),其余关联只有裸 ID,取不到名时退回「工厂#ID」,与列表页同一套写法。
// 分批付款记录另挂在 GET /payments/requests/:id/records 上,由调用方拉取后挂到 detail.records;
// 没挂就不出这张表(而不是出一张空表,避免「明明付过款却显示无记录」的误导)。
// 业务已确认:全量导出,不脱敏(收款银行/账号照导)。

import { exportDocExcel, d10, n2, sum, type Block } from './docExcel';

// 付款申请复用 ReconcileType(CONTRACT/NO_CONTRACT/LABOR),列表页只区分「合同/非合同」,这里按枚举全列。
const typeLabel = (t: unknown): string =>
  ({ CONTRACT: '合同付款', NO_CONTRACT: '非合同付款', LABOR: '工时付款' } as Record<string, string>)[String(t)] ?? String(t ?? '');

// 与 PaymentListView.vue prStatusLabel 一致
const statusLabel = (s: unknown): string =>
  ({ DRAFT: '草稿', PENDING: '待审批', APPROVED: '已批准', REJECTED: '已驳回', PAID: '已付款' } as Record<string, string>)[String(s)] ?? String(s ?? '');

// 与 PaymentListView.vue payMethodLabel 一致
const payMethodLabel = (m: unknown): string =>
  ({ BANK: '银行转账', ACCEPTANCE: '承兑汇票', OTHER: '其他' } as Record<string, string>)[String(m)] ?? String(m ?? '');

/** 关联/操作人只有裸 ID(列表接口不回用户名),渲染成 #ID,空值出空单元格 */
const uid = (v: unknown): string => (v ? `#${v}` : '');

export function exportPaymentRequestExcel(detail: any): void {
  // 调用方从 GET /payments/requests/:id/records 拉来挂上;列表页里这份数据叫 payRecords
  const records: any[] = detail.records ?? detail.payRecords ?? [];

  const no = detail.pr_no ?? '';
  const factory = detail.factory_name || (detail.factory_id ? `工厂#${detail.factory_id}` : '');
  // 应付总额:后端建单时 actual_pay = amount - prepay_offset,老单可能为空 → 退回申请金额(与列表页 prBalance 同口径)
  const payable = +(detail.actual_pay ?? detail.amount ?? 0);
  const paidTotal = +(detail.paid_total ?? 0);

  const pairs: Array<[string, unknown]> = [
    ['付款申请单号', no],
    ['类型', typeLabel(detail.type)],
    ['审批状态', statusLabel(detail.approval_status)],
    ['工厂', factory],
    ['关联对账单', uid(detail.reconcile_id)],
    ['相关款号', detail.related_style_no],
    ['申请金额', n2(detail.amount)],
    ['冲抵预付款', n2(detail.prepay_offset)],
    ['应付总额', n2(payable)],
    ['已付总额', n2(paidTotal)],
    ['未付余额', n2(payable - paidTotal)],
    ['结算账期', detail.account_period_days != null ? `${detail.account_period_days}天` : ''],
    ['账期到期日', d10(detail.due_date)],
    ['付款日', d10(detail.slip_uploaded_at)],
    ['收款银行', detail.bank_name],
    ['收款账号', detail.bank_account],
    ['付款水单', detail.slip_url],
    ['付款人', uid(detail.paid_by)],
    ['提交人', uid(detail.submitted_by)],
    ['提交时间', d10(detail.submitted_at)],
    ['审批人', uid(detail.approved_by)],
    ['审批时间', d10(detail.approved_at)],
    ['驳回原因', detail.reject_reason],
    ['制单人', uid(detail.created_by)],
    ['制单日期', d10(detail.created_at)],
    ['备注说明', detail.description],
  ];

  const blocks: Block[] = [{ kind: 'kv', title: `付款申请 · ${no}`, pairs }];

  if (records.length) {
    blocks.push({
      kind: 'table',
      title: '分批付款记录',
      head: ['#', '付款方式', '付款日期', '本次付款金额', '付款水单', '备注', '登记时间'],
      rows: records.map((r, i) => [
        i + 1, payMethodLabel(r.pay_method), d10(r.pay_date), n2(r.amount),
        r.slip_url, r.remark, d10(r.created_at),
      ]),
      foot: ['合计', '', '', n2(sum(records, (r) => r.amount)), '', '', ''],
    });
  }

  exportDocExcel({
    sheetName: `付款${no}`,
    title: `付款申请 · ${no}`,
    filename: `付款申请-${no || 'export'}.xls`,
    blocks,
  });
}

export function exportPrepaymentExcel(detail: any): void {
  // 预付款表没有单号列(prepayment 实体只有自增 id,见 init.sql),单号一律用 ID
  const no = detail.id != null ? String(detail.id) : '';
  const factory = detail.factory_name || (detail.factory_id ? `工厂#${detail.factory_id}` : '');
  const contract = detail.contract_no || uid(detail.contract_id);
  const amount = +(detail.amount ?? 0);
  const used = +(detail.used_amount ?? 0);

  const pairs: Array<[string, unknown]> = [
    ['预付单号', no ? `#${no}` : ''],
    ['工厂', factory],
    ['关联合同', contract],
    ['相关款号', detail.style_no],
    ['预付金额', n2(amount)],
    ['付款日期', d10(detail.pay_date)],
    ['已冲抵金额', n2(used)],
    ['剩余余额', n2(detail.balance)],
    // 冲抵情况:审计时最常问的就是「这笔预付冲了多少」,直接把比例算出来,免得看数去按计算器
    ['冲抵比例', amount > 0 ? `${((used / amount) * 100).toFixed(2)}%` : ''],
    ['冲抵状态', used <= 0 ? '未冲抵' : (+(detail.balance ?? 0) <= 0 ? '已冲抵完' : '部分冲抵')],
    ['制单人', uid(detail.created_by)],
    ['制单日期', d10(detail.created_at)],
    ['备注', detail.remark],
  ];

  const blocks: Block[] = [{ kind: 'kv', title: `预付款 · #${no}`, pairs }];

  exportDocExcel({
    sheetName: `预付款${no}`,
    title: `预付款 · #${no}`,
    filename: `预付款-${no || 'export'}.xls`,
    blocks,
  });
}
