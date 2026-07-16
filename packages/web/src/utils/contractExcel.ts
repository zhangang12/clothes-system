// 合同导出 Excel —— 复用 docExcel 公共层(BOM/文本格式/落盘都在那儿),本文件只声明区块。
// 材料/加工/补料三类共用一张明细表:加工合同的「货物」也落在 contract_material 上(字段同名),
// 仅类型相关的字段(增值税/价格包含项 vs 发货地址)按 type 增减。业务已定:全量导出,不脱敏。

import { exportDocExcel, d10, n2, n4, sum, type Block } from './docExcel';

const typeLabel = (t: string): string =>
  ({ MATERIAL: '材料合同', PROCESS: '加工合同', SUPPLEMENT: '补料合同' } as Record<string, string>)[t] ?? t;
const statusLabel = (s: string): string =>
  ({ ACTIVE: '进行中', COMPLETED: '已完成', CANCELLED: '已取消' } as Record<string, string>)[s] ?? s;
const portalLabel = (s: string): string =>
  ({ DRAFT: '草稿', PUSHED: '已推送', STAMPED: '已盖章', SHIPPING: '出货中', RECONCILED: '已对账', COMPLETED: '已完成' } as Record<string, string>)[s] ?? s;
const approvalLabel = (s: string): string =>
  ({ NONE: '无需审批', PENDING: '待审批', APPROVED: '已审批', REJECTED: '已驳回' } as Record<string, string>)[s] ?? s;
const stampLabel = (s: string): string =>
  ({ ESEAL: '电子章', PAPER: '纸质盖章照片' } as Record<string, string>)[s] ?? '';

export function exportContractExcel(detail: any): void {
  const isProcess = detail.type === 'PROCESS';
  const mats: any[] = detail.materials ?? [];
  const ships: any[] = detail.shipments ?? [];
  const qs: any = detail.qtyStats ?? {};
  // 详情接口只回 factory_id/order_id(无名称);调用方若已带名称则优先用
  const factory = detail.factory_name ?? (detail.factory_id != null ? `工厂#${detail.factory_id}` : '');
  const order = detail.order_no ?? (detail.order_id != null ? `订单#${detail.order_id}` : '');
  const includes: string[] = Array.isArray(detail.price_includes) ? detail.price_includes : [];

  const pairs: Array<[string, unknown]> = [
    ['合同编号', detail.contract_no],
    ['合同类型', typeLabel(detail.type)],
    [isProcess ? '受托方（加工厂）' : '甲方（供方）', factory],
    ['关联订单', order],
    ['关联款号', detail.style_nos],
    ['母合同 ID', detail.parent_id],
    ['币种', detail.currency],
    ['合同金额', n2(detail.total_amount)],
    ['定金比例(%)', detail.deposit_ratio],
    ['中期款比例(%)', detail.mid_ratio],
    ['尾款比例(%)', detail.final_ratio],
    ['账期(天)', detail.account_period_days],
    ['到期日', d10(detail.due_date)],
    ['交货期限', d10(detail.delivery_deadline)],
    ['签约地点', detail.sign_place],
    ['签约日期', d10(detail.sign_date)],
    ['本司代表', detail.company_rep],
    ['担保人', detail.guarantor],
  ];
  if (isProcess) {
    pairs.push(['增值税(%)', detail.vat_rate], ['价格包含项', includes.join('、')], ['价格其他说明', detail.price_other]);
  } else {
    pairs.push(['发货地址', detail.ship_to_address]);
  }
  pairs.push(
    ['单据状态', statusLabel(detail.status)],
    ['门户状态', portalLabel(detail.portal_status)],
    ['审批状态', approvalLabel(detail.approval_status)],
    ['审批时间', d10(detail.approved_at)],
    ['推送时间', d10(detail.pushed_at)],
    ['修改后待重新核对', Number(detail.revised) === 1 ? '是' : '否'],
    ['盖章方式', stampLabel(detail.stamp_mode)],
    ['盖章供应商', detail.stamped_by_supplier],
    ['盖章时间', d10(detail.stamped_at)],
    ['纸质盖章照片', detail.stamp_paper_url],
    ['合同量', qs.contractQty],
    ['累计实发', qs.shippedQty ?? detail.shipped_qty],
    ['数量差额', qs.diffQty],
    ['最后发货日', d10(detail.last_ship_date)],
    ['发货完成时间', d10(detail.ship_done_at)],
    ['源订单已变更', detail.source_order_changed ? '是，请核对材料明细' : '否'],
    ['制单日期', d10(detail.created_at)],
    ['备注', detail.remark],
  );

  const matRows: unknown[][] = mats.map((m, i) => [
    i + 1, m.item_name, m.spec, m.color, m.size, m.style_no, m.unit,
    m.qty, m.qty_source, n4(m.unit_price), n2(m.amount), d10(m.delivery_date), m.remark,
  ]);

  const blocks: Block[] = [
    { kind: 'kv', title: '合同基本信息', pairs },
    {
      kind: 'table',
      title: isProcess ? '加工明细' : '材料明细',
      head: ['#', '品名', '规格', '颜色', '尺码', '款号', '单位', '数量', '数量来源', '单价', '小计', '交货期限', '备注'],
      rows: matRows,
      foot: ['合计', '', '', '', '', '', '', sum(mats, (m) => m.qty), '', '', n2(sum(mats, (m) => m.amount)), '', ''],
      empty: '（无货物明细）',
    },
  ];

  if (ships.length) {
    blocks.push({
      kind: 'table',
      title: '发货批次（逐批锁价）',
      head: ['#', '发货单号', '发货日期', '数量', '锁定单价', '金额', '审批状态', '对账状态', '快递公司', '快递单号', '收货地址', '合并组', '物料行', '操作人'],
      rows: ships.map((b, i) => [
        i + 1, b.ship_no, d10(b.ship_date), b.qty, n4(b.snapshot_unit_price), n2(b.amount),
        approvalLabel(b.approval_status), b.reconcile_id ? `已对账（对账单#${b.reconcile_id}）` : '未对账',
        b.express_company, b.express_no, b.ship_address, b.merge_no,
        (b.items ?? []).map((it: any) => `${it.item_name ?? '行'}×${+it.qty}`).join(' / '),
        b.operator,
      ]),
      foot: ['合计', '', '', sum(ships, (b) => b.qty), '', n2(sum(ships, (b) => b.amount)), '', '', '', '', '', '', '', ''],
    });
  }

  exportDocExcel({
    sheetName: `合同${detail.contract_no ?? ''}`,
    title: `${typeLabel(detail.type)} · ${detail.contract_no ?? ''}`,
    filename: `合同-${detail.contract_no ?? 'export'}.xls`,
    blocks,
  });
}
