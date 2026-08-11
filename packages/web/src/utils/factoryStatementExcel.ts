// 工厂往来账单导出（2026-08-11 qiao：「可以按工厂名称，下载EXCEL文件，拉出这个公司的所有账单吗」）。
//
// 【为什么走 exportDocXlsx 而不是像其它付款导出那样走 .xls】这份不是给人看一眼的单据，是拿去
// 二次加工的账：财务要选中一列看求和、要按到期日排序、要筛出没付完的。HTML 工作表整表钉成
// 文本格式（款号不被截断的代价），金额一律不能 SUM。所以金额列用 numCell() 写成真数字，
// 只有真 .xlsx 支持这个。
//
// 【为什么只出一张工作表】exportDocXlsx 是单表结构，而账单本来就该一眼看到底：
// 汇总在最上面，往下依次是付款申请、实付记录、预付款、对账单。分成五个页签反而要来回点。

import { exportDocXlsx, d10, n2, numCell, sensitiveMark, type Block } from './docExcel';

const typeLabel = (t: unknown): string =>
  ({ CONTRACT: '合同付款', NO_CONTRACT: '非合同付款', LABOR: '工时付款' } as Record<string, string>)[String(t)] ?? String(t ?? '');

// 与 PaymentListView.vue prStatusLabel 一致
const prStatus = (s: unknown): string =>
  ({ DRAFT: '草稿', PENDING: '待审批', APPROVED: '已批准', REJECTED: '已驳回', PAID: '已付款' } as Record<string, string>)[String(s)] ?? String(s ?? '');

// 与 ReconciliationListView.vue 一致（PENDING 是「待主管复核」，不是待审批）
const recStatus = (s: unknown): string =>
  ({ DRAFT: '草稿', PENDING: '待复核', CONFIRMED: '已确认', PAID: '已付清' } as Record<string, string>)[String(s)] ?? String(s ?? '');

const payMethod = (m: unknown): string =>
  ({ BANK: '银行转账', ACCEPTANCE: '承兑汇票', OTHER: '其他' } as Record<string, string>)[String(m)] ?? String(m ?? '');

/** 应付：后端建单时 actual_pay = amount - prepay_offset，老单可能为空 → 退回自算（与列表页同口径） */
const payableOf = (r: any): number =>
  r.actual_pay != null ? +r.actual_pay : (+(r.amount ?? 0) - +(r.prepay_offset ?? 0));

/** 区间文案。三类单据各按自己的自然日期过滤，这个口径必须写在表头上——
 *  否则业务拿着一份「8月账单」，不知道 8 月指的是谁的 8 月。 */
function rangeText(range: { start_date?: string | null; end_date?: string | null }): string {
  const { start_date: s, end_date: e } = range ?? {};
  if (!s && !e) return '全部（未限定区间）';
  return `${s || '最早'} ~ ${e || '至今'}`;
}

export interface FactoryStatement {
  factory: { id: number; name: string; short_name?: string | null };
  range: { start_date: string | null; end_date: string | null };
  summary: Record<string, number>;
  requests: any[];
  prepayments: any[];
  reconciliations: any[];
}

export async function exportFactoryStatementExcel(st: FactoryStatement, exportedAt: string): Promise<void> {
  const name = st.factory.short_name || st.factory.name || `工厂#${st.factory.id}`;
  const sm = st.summary ?? ({} as Record<string, number>);

  const blocks: Block[] = [
    {
      kind: 'kv',
      title: '账单信息',
      pairs: [
        ['工厂全称', st.factory.name],
        ['工厂简称', st.factory.short_name || ''],
        ['账单区间', rangeText(st.range)],
        ['区间口径', '付款申请按申请日期 / 预付款按付款日期 / 对账单按创建日期'],
        ['导出时间', exportedAt],
        ['金额单位', '元（数字列可直接求和）'],
      ],
      perRow: 1,
    },
    {
      kind: 'kv',
      title: '汇总',
      pairs: [
        ['付款申请（笔）', sm.request_count ?? 0],
        ['其中已驳回（笔）', sm.rejected_count ?? 0],
        ['申请金额合计', numCell(sm.request_amount)],
        ['冲抵预付合计', numCell(sm.prepay_offset_total)],
        // 合计口径写在标签里，免得财务把「应付」当成所有申请之和对不上账
        ['应付合计（已批准+已付款）', numCell(sm.payable_total)],
        ['已付合计', numCell(sm.paid_total)],
        ['未付余额', numCell(sm.unpaid_total)],
        ['', ''],
        ['预付款（笔）', sm.prepay_count ?? 0],
        ['预付金额合计', numCell(sm.prepay_amount)],
        ['预付已冲抵', numCell(sm.prepay_used)],
        ['预付可用余额', numCell(sm.prepay_balance)],
        ['对账单（份）', sm.reconcile_count ?? 0],
        ['对账金额合计', numCell(sm.reconcile_amount)],
      ],
      perRow: 2,
    },
    {
      kind: 'table',
      title: '一、付款申请明细',
      head: ['申请编号', '类型', '状态', '对账单号', '合同号', '款号', '申请金额', '冲抵预付',
        '应付', '已付', '未付', '账期(天)', '到期日', '申请日期', '收款银行', '收款账号', '备注说明'],
      rows: st.requests.map((r) => {
        const payable = payableOf(r);
        const paid = +(r.paid_sum ?? r.paid_total ?? 0);
        // 已驳回的行「应付/未付」留空而不是写 0：这笔申请根本不成立，写 0 会被当成"已结清"
        const rejected = r.approval_status === 'REJECTED';
        return [
          r.pr_no, typeLabel(r.type), prStatus(r.approval_status),
          r.reconcile_no || (r.reconcile_id ? `#${r.reconcile_id}` : ''),
          r.contract_no || '', r.style_no || '',
          numCell(r.amount), numCell(r.prepay_offset),
          rejected ? '' : numCell(payable),
          rejected ? '' : numCell(paid),
          rejected ? '' : numCell(payable - paid),
          r.account_period_days ?? '', d10(r.due_date), d10(r.created_at),
          r.bank_name || '', r.bank_account || '', r.description || '',
        ];
      }),
      foot: ['合计（不含已驳回）', '', '', '', '', '',
        numCell(sm.request_amount), numCell(sm.prepay_offset_total),
        numCell(sm.payable_total), numCell(sm.paid_total), numCell(sm.unpaid_total),
        '', '', '', '', '', ''],
      empty: '（该区间内无付款申请）',
    },
    {
      kind: 'table',
      title: '二、实付记录明细',
      head: ['申请编号', '付款日期', '付款方式', '付款金额', '水单', '备注', '登记时间'],
      rows: st.requests.flatMap((r) =>
        (r.records ?? []).map((x: any) => [
          r.pr_no, d10(x.pay_date), payMethod(x.pay_method), numCell(x.amount),
          sensitiveMark(x.slip_url), x.remark || '', d10(x.created_at),
        ])),
      foot: ['合计', '', '', numCell(sm.paid_total), '', '', ''],
      empty: '（该区间内无实付记录）',
    },
    {
      kind: 'table',
      title: '三、预付款明细',
      head: ['预付单号', '合同号', '款号', '预付金额', '已冲抵', '余额', '付款日期', '备注'],
      rows: st.prepayments.map((r) => [
        `#${r.id}`, r.contract_no || '', r.style_no || '',
        numCell(r.amount), numCell(r.used_amount), numCell(r.balance),
        d10(r.pay_date), r.remark || '',
      ]),
      foot: ['合计', '', '', numCell(sm.prepay_amount), numCell(sm.prepay_used), numCell(sm.prepay_balance), '', ''],
      empty: '（该区间内无预付款）',
    },
    {
      kind: 'table',
      title: '四、对账单明细',
      head: ['对账单号', '类型', '款号', '合同号', '归属账期', '对账金额', '税率%', '税额',
        '发票号', '发票金额', '发票差额', '状态', '创建日期'],
      rows: st.reconciliations.map((r) => [
        r.reconcile_no, typeLabel(r.type), r.style_no || '', r.contract_no || '', r.period || '',
        numCell(r.total_amount), n2(r.tax_rate), numCell(r.tax_amount),
        r.invoice_no || '', numCell(r.invoice_amount), numCell(r.invoice_diff),
        recStatus(r.status), d10(r.created_at),
      ]),
      foot: ['合计', '', '', '', '', numCell(sm.reconcile_amount), '', '', '', '', '', '', ''],
      empty: '（该区间内无对账单）',
    },
  ];

  const suffix = st.range?.start_date || st.range?.end_date
    ? `${st.range.start_date || '最早'}至${st.range.end_date || '今'}`
    : '全部';

  await exportDocXlsx({
    sheetName: `${name}账单`,
    title: `${name} · 往来账单（${rangeText(st.range)}）`,
    filename: `工厂账单-${name}-${suffix}.xlsx`,
    blocks,
  });
}
