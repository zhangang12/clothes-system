// 结算导出 Excel —— 结算是毛利核算单据，导出分四块：基本信息 / 成本核算 / 财务收汇·毛利对比 /
// 成本明细行 + 收汇记录两张子表。BOM、转义、排版、落盘全部收在 docExcel 公共层，这里只声明区块结构。
// 枚举一律导中文标签（口径对齐 SettlementListView.vue 的详情弹框），不导裸枚举值——
// 财务拿到的是核算表不是数据库导出，`DRAFT`/`PAID` 这种值到了表里没人认。

import { exportDocExcel, d10, n2, n4, sum, type Block } from './docExcel';

const STATUS: Record<string, string> = { DRAFT: '待收汇', CONFIRMED: '已结算' };
const REFUND: Record<string, string> = { ESTIMATED: '预估', RECEIVED: '已到账' };
const PAY_STATUS: Record<string, string> = { PAID: '已付·计入', CONFIRMED: '未付·不计入' };
const COST_SRC: Record<string, string> = { AUTO: '对账汇总快照', MANUAL: '手工行' };
const RECEIPT_SRC: Record<string, string> = { MANUAL: '手录', INVOICE: '发票同步' };

/** 枚举 → 中文；未收录的值原样带出，导出不吞数据 */
const lab = (map: Record<string, string>, v: unknown): string => {
  const k = String(v ?? '');
  return map[k] ?? k;
};

/** tinyint 标志位 → 中文 */
const yn = (v: unknown, y = '是', n = '否'): string => (Number(v) ? y : n);

export function exportSettlementExcel(detail: any): void {
  const costs: any[] = detail.costs ?? [];
  const receipts: any[] = detail.receipts ?? [];
  const no = String(detail.settlement_no ?? '');

  // profit_ready=0 表示收汇/汇率未齐，后端明确「缺值不出误导性负毛利」；详情弹框同样不展示裸数。
  // 导出跟随同一口径：这不是脱敏（全量导出不脱敏），是不让不可信的负毛利落进核算表被当真。
  const ready = !!Number(detail.profit_ready ?? 0);
  const p = (v: unknown): string => (ready ? n2(v) : '待补收汇/汇率');
  const isLoss = ready && Number(detail.net_profit) < 0;

  const periodFee = ['freight_fee', 'express_fee', 'sample_fee', 'other_fee']
    .reduce((s, k) => s + (Number(detail[k]) || 0), 0);

  const blocks: Block[] = [
    {
      kind: 'kv',
      title: '基本信息',
      pairs: [
        ['结算单编号', no],
        ['状态', lab(STATUS, detail.status)],
        ['订单ID', detail.order_id],
        ['出货批次', detail.shipment_ids || '全量累计'],
        ['款号', detail.style_no],
        ['品名', detail.style_name],
        ['中间商客户', detail.customer_name],
        ['币种', detail.currency],
        ['订单数量', detail.order_qty],
        ['出货件数', detail.shipped_qty],
        ['结算汇率', n4(detail.exchange_rate)],
        ['毛利可信', ready ? '是' : '否（待补收汇/汇率）'],
        ['是否亏损', ready ? (isLoss ? '是（亏损）' : '否') : '—（待补收汇/汇率）'],
        ['待重算', yn(detail.needs_recalc)],
        ['建单日期', d10(detail.created_at)],
        ['确认时间', d10(detail.confirmed_at)],
        ['备注', detail.description],
      ],
    },
    {
      kind: 'kv',
      title: '成本核算（对账付款汇总）',
      pairs: [
        ['总货款(含税)', n2(detail.goods_amount_tax ?? detail.total_cost)],
        ['总货款(不含税)', n2(detail.goods_amount_extax)],
        ['成本单价(含税)', n4(detail.cost_per_unit_tax)],
        ['成本单价(不含税)', n4(detail.cost_per_unit_extax ?? detail.cost_per_unit)],
        ['未付·不计入(含税)', n2(detail.unpaid_goods_tax)],
        ['已确认未付笔数', detail.unpaid_count],
      ],
    },
    {
      kind: 'kv',
      title: '财务收汇 · 毛利对比',
      pairs: [
        ['发票金额$', n2(detail.invoice_amount_usd)],
        ['实际收汇$', n2(detail.receipt_usd)],
        ['美金单价', n4(detail.usd_unit_price)],
        ['结算金额¥', n2(detail.settle_amount ?? detail.revenue)],
        ['毛利', p(detail.gross_profit)],
        ['毛利率', ready && detail.gross_margin != null ? `${n2(detail.gross_margin)}%` : '—'],
        ['财务及管理费', n2(detail.finance_fee)],
        ['期间费用合计', n2(periodFee)],
        // 期间费用四项分列：合计对不上时财务要能一眼看出是哪一项填错
        ['运杂费', n2(detail.freight_fee)],
        ['快邮费', n2(detail.express_fee)],
        ['打样费', n2(detail.sample_fee)],
        ['其它费用', n2(detail.other_fee)],
        ['出口退税', n2(detail.tax_refund)],
        ['退税状态', lab(REFUND, detail.refund_status)],
        ['保本汇率(含税)', n4(detail.breakeven_rate_tax)],
        ['保本汇率(不含税)', n4(detail.breakeven_rate_extax)],
        ['净利(含退税)', p(detail.net_profit)],
        ['净利(不含退税)', p(detail.net_profit_ex_refund)],
      ],
    },
  ];

  if (costs.length) {
    blocks.push({
      kind: 'table',
      title: '成本明细行（对账付款汇总·含税）',
      head: ['#', '费用名称', '供应商', '来源', '对账单号', '实发数', '单价', '金额', '发票', '税率%', '付款状态', '是否计入'],
      rows: costs.map((c, i) => [
        i + 1,
        c.cost_name,
        c.supplier_name,
        lab(COST_SRC, c.source),
        c.reconcile_no,
        c.qty != null ? +c.qty : '',
        n4(c.unit_price),
        n2(c.amount), // 允许负数：退运/索赔冲减行
        yn(c.has_invoice, '有票', '无票'),
        c.tax_rate != null ? +c.tax_rate : '',
        c.pay_status ? lab(PAY_STATUS, c.pay_status) : '手工行',
        yn(c.included, '计入', '不计入'),
      ]),
      // 「金额」列合计是全部行（含负数冲减、含未付不计入行）的如实合计；
      // 与上方总货款对齐的口径另给一格「计入总货款」，只累计 included=1 的行。
      foot: [
        '合计', '', '', '', '', '', '',
        n2(sum(costs, (c) => c.amount)),
        '', '',
        '计入总货款',
        n2(sum(costs.filter((c) => Number(c.included) === 1), (c) => c.amount)),
      ],
    });
  }

  if (receipts.length) {
    blocks.push({
      kind: 'table',
      title: '收汇记录（逐笔 × 各自汇率）',
      head: ['#', '收汇日期', '收汇金额$', '该笔汇率', '折RMB', '来源', '来源发票号', '银行水单', '备注'],
      rows: receipts.map((r, i) => [
        i + 1,
        d10(r.receipt_date),
        n2(r.amount),
        n4(r.exchange_rate),
        r.exchange_rate != null ? n2(+r.amount * +r.exchange_rate) : '',
        lab(RECEIPT_SRC, r.source),
        r.invoice_no,
        r.slip_url,
        r.remark,
      ]),
      // 折RMB 合计只累计带汇率的笔（无汇率的笔折算不出，计 0 而不是把美金数混进 RMB 列）
      foot: [
        '合计', '',
        n2(sum(receipts, (r) => r.amount)),
        '',
        n2(sum(receipts, (r) => (r.exchange_rate != null ? +r.amount * +r.exchange_rate : 0))),
        '', '', '', '',
      ],
    });
  }

  exportDocExcel({
    sheetName: `结算${no}`,
    title: `结算单（毛利核算） · ${no}`,
    filename: `结算单-${no || 'export'}.xls`,
    blocks,
  });
}
