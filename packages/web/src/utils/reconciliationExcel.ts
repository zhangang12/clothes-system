// 对账单导出 Excel —— 结构声明式,BOM/转义/文本格式/落盘统一收在 docExcel.ts,这里只描述区块。
// 对账单有三种类型(合同/非合同/工时),明细分别落在 shipments / expenseItems / laborItems 三张子表上
// (见 reconciliation.service.ts findOne:按 type 只查对应的一张,另两张回空数组)。这里不按 type 分支,
// 而是「哪张非空就出哪张」——既覆盖全部类型,又不会给合同对账塞两张空表。
// 业务已确认:全量导出,不脱敏。

import { exportDocExcel, d10, n2, n4, sum, type Block } from './docExcel';

const typeLabel = (t: unknown): string =>
  ({ CONTRACT: '合同对账', NO_CONTRACT: '非合同对账', LABOR: '工时对账' } as Record<string, string>)[String(t)] ?? String(t ?? '');

const subTypeLabel = (s: unknown): string =>
  ({ EXPENSE: '费用', CASH_NO_INVOICE: '现金无票', PREPAY: '预付款' } as Record<string, string>)[String(s)] ?? String(s ?? '');

const statusLabel = (s: unknown): string =>
  ({ DRAFT: '草稿', PENDING: '待复核', CONFIRMED: '已确认', PAID: '已付款' } as Record<string, string>)[String(s)] ?? String(s ?? '');

export function exportReconciliationExcel(detail: any): void {
  const ships: any[] = detail.shipments ?? [];
  const labors: any[] = detail.laborItems ?? [];
  const expenses: any[] = detail.expenseItems ?? [];

  const no = detail.reconcile_no ?? '';
  const isLabor = detail.type === 'LABOR';

  // 受款方:工时对账是版师/打样间,其余是加工厂。详情接口不回 factory_name(只有列表接口补名),
  // 取不到名时退回「工厂#ID」,与列表页同一套写法。
  const payee = isLabor
    ? (detail.patternmaker_name || (detail.patternmaker_id ? `版师#${detail.patternmaker_id}` : ''))
    : (detail.factory_name || (detail.factory_id ? `工厂#${detail.factory_id}` : ''));

  const pairs: Array<[string, unknown]> = [
    ['对账单编号', no],
    ['类型', typeLabel(detail.type) + (detail.sub_type ? ` · ${subTypeLabel(detail.sub_type)}` : '')],
    ['状态', statusLabel(detail.status)],
    [isLabor ? '版师' : '工厂', payee],
    ['款号', detail.style_no],
    ['来源合同', detail.contract_id ? `#${detail.contract_id}` : ''],
    ['归属账期', detail.period],
    ['币种', detail.currency],
    ['对账金额', n2(detail.total_amount)],
    ['税率', detail.tax_rate != null ? `${detail.tax_rate}%` : ''],
    ['税额', n2(detail.tax_amount)],
    ['是否有票', detail.has_invoice ? '是' : '否'],
    ['发票号', detail.invoice_no],
    ['发票金额', n2(detail.invoice_amount)],
    ['发票差额', n2(detail.invoice_diff)],
    ['发票附件', detail.invoice_url],
    ['确认时间', d10(detail.confirmed_at)],
    ['制单日期', d10(detail.created_at)],
    ['复核批注', detail.review_remark],
    ['超发放行原因', detail.over_reason],
    ['说明', detail.description],
  ];

  const blocks: Block[] = [{ kind: 'kv', title: `对账单 · ${no}`, pairs }];

  if (ships.length) {
    blocks.push({
      kind: 'table',
      title: '出货明细（一单多合同）',
      head: ['#', '出货单ID', '来源合同', '款号', '品名', '单价', '数量', '金额', '备注'],
      rows: ships.map((s, i) => [
        i + 1, s.shipment_id, s.contract_id ? `#${s.contract_id}` : '', s.style_no,
        s.item_name, n4(s.snapshot_unit_price), s.qty, n2(s.amount), s.remark,
      ]),
      foot: ['合计', '', '', '', '', '', sum(ships, (r) => r.qty), n2(sum(ships, (r) => r.amount)), ''],
    });
  }

  if (labors.length) {
    blocks.push({
      kind: 'table',
      title: '工时明细（多款合并）',
      head: ['#', '样衣编号', '客户款号', '件数', '工时单价', '工时金额'],
      rows: labors.map((l, i) => [
        i + 1, l.sample_no, l.style_no, l.piece_count, n2(l.labor_unit_price), n2(l.labor_amount),
      ]),
      foot: ['合计', '', '', sum(labors, (r) => r.piece_count), '', n2(sum(labors, (r) => r.labor_amount))],
    });
  }

  if (expenses.length) {
    blocks.push({
      kind: 'table',
      title: `费用明细${detail.sub_type ? `（${subTypeLabel(detail.sub_type)}）` : ''}`,
      head: ['#', '费用项目/事由', '相关款号', '金额', '附件'],
      rows: expenses.map((e, i) => [i + 1, e.expense_name, e.style_no, n2(e.amount), e.attach_url]),
      foot: ['合计', '', '', n2(sum(expenses, (r) => r.amount)), ''],
    });
  }

  exportDocExcel({
    sheetName: `对账${no}`,
    title: `对账单 · ${no}`,
    filename: `对账单-${no || 'export'}.xls`,
    blocks,
  });
}
