// 订单导出 Excel（2026-08-19 YSM #106：「生成合同下载不能转换Excel么」）。
//
// 【为什么之前没有】订单页只有「打印」下拉，样衣 / 报价 / 合同都早有「导出Excel」，
// 唯独订单缺——她在订单页找下载入口，看到的只有打印，于是问能不能转 Excel。
//
// 【为什么沿用打印那三套口径而不是一把全量导出】订单里同时装着**对客的价格**和
// **给工厂的用料成本与供应商**。一份全量 Excel 一旦转手发给工厂，等于把客户报价和
// 供应商底价一起送出去。所以导出与打印保持同一套脱敏规则，选哪套就导哪套：
//   customer 对客   —— 不含用料成本与供应商
//   factory  对工厂 —— 不含客户信息与对客价
//   internal 内部   —— 全量
import { exportDocXlsx, d10, numCell, type Block } from './docExcel';

// 【数量与金额必须包 numCell】docExcel 给所有单元格钉了文本格式（款号形如 I27.230.03929，
// 不钉成文本会被 Excel 截成 27.23），代价是数字也成了文本——选中一列右下角「求和=0」，
// 写 =SUM() 也是 0。YSM 实测反馈（#115）：导出的订单表选中数量列求和为 0，没法二次核算。
// numCell 是这一层唯一的数值出口；空值仍返回空单元格（未填 ≠ 0）。
const qty = (v: unknown) => numCell(v, '#,##0');      // 件数：整数
const money4 = (v: unknown) => numCell(v, '#,##0.0000'); // 单价：4 位
const money2 = (v: unknown) => numCell(v, '#,##0.00');   // 金额：2 位

export type OrderExportMode = 'customer' | 'factory' | 'internal';

const MODE_LABEL: Record<OrderExportMode, string> = {
  customer: '对客确认单', factory: '生产通知单', internal: '内部订单单据',
};

/** 数量搭配矩阵 → 表格区（列 = 各 PO，行 = 款·色·码） */
function matrixBlock(matrix: any): Block {
  const pos: any[] = matrix?.pos ?? [];
  const rows: any[] = matrix?.rows ?? [];
  // 洗标号整列为空时不占版面（与打印一致：老订单没填过这一列）
  const withArticle = rows.some((r) => String(r.article ?? '').trim());
  const head = ['款号', '颜色', ...(withArticle ? ['洗标号'] : []), '尺码',
    ...pos.map((p, i) => `${p.po_no || `PO${i + 1}`}${p.destination ? ` · ${p.destination}` : ''}`), '合计'];
  const body = rows.map((r) => {
    const qtys: any[] = r.qtys ?? [];
    return [r.style_no, r.color, ...(withArticle ? [r.article || '—'] : []), r.size,
      ...pos.map((_: any, i: number) => qty(Number(qtys[i]) || 0)),
      qty(qtys.reduce((s: number, q: any) => s + (Number(q) || 0), 0))];
  });
  const foot = body.length
    ? ['合计', '', ...(withArticle ? [''] : []), '',
      ...pos.map((_: any, i: number) => qty(rows.reduce((s: number, r: any) => s + (Number(r.qtys?.[i]) || 0), 0))),
      qty(rows.reduce((s: number, r: any) => s + (r.qtys ?? []).reduce((a: number, q: any) => a + (Number(q) || 0), 0), 0))]
    : undefined;
  return { kind: 'table', title: '数量搭配（按 PO）', head, rows: body, foot, empty: '（未填写数量搭配）' };
}

/** 用料核算 → 表格区。成本与供应商只在指定口径下出现 */
function materialBlock(materials: any[], mode: OrderExportMode): Block {
  const withCost = mode === 'internal';
  const withSupplier = mode === 'internal';
  const head = ['#', '品名', '部位', '颜色', ...(withSupplier ? ['供应商'] : []), '单位',
    '单件耗用', '损耗%', '采购量', ...(withCost ? ['单价', '预算'] : [])];
  const rows = (materials ?? []).map((m, i) => [
    i + 1, m.item_name, m.part || '—',
    // 同 orderPrint：分色行颜色由矩阵自动分，导残留单色会误导（#120 审计）
    (m.split_mode === 'BY_COLOR' || m.split_mode === 'BY_BOTH') ? '自动分色' : (m.color || '—'),
    ...(withSupplier ? [m.supplier || '—'] : []), m.unit || '—',
    money4(m.net_usage), numCell(m.loss_rate, '#,##0.##'), qty(+m.final_purchase > 0 ? m.final_purchase : m.total_purchase),
    ...(withCost ? [money4(m.unit_price), money2(m.budget)] : []),
  ]);
  return { kind: 'table', title: '用料核算', head, rows, empty: '（无用料核算记录）' };
}

export async function exportOrderExcel(detail: any, mode: OrderExportMode): Promise<void> {
  const showCustomer = mode !== 'factory';
  const showPrice = mode !== 'factory';

  // 【字段名以接口为准，别照着印象写】order_main 里没有 order_date（是 make_date）、
  // 大货总数叫 qty_total 不是 total_qty——最初两处都写错，导出来这几格全是空的（#110）。
  // 口径与 orderPrint.ts 保持一致。
  const pairs: Array<[string, unknown]> = [
    ['订单号', detail.order_no],
    ['单据类型', MODE_LABEL[mode]],
    ['款号', detail.style_no],
    ['品名', detail.style_name ?? '—'],
    ['制单日期', d10(detail.make_date)],
    ['交货期', d10(detail.delivery_date)],
    ['大货总数', qty(detail.qty_total ?? 0)],
    ['业务员', detail.salesperson ?? '—'],
  ];
  if (showCustomer) {
    pairs.push(['客户', detail.customer_name ?? detail.middleman_name ?? '—']);
    pairs.push(['最终买家', detail.buyer_name ?? '—']);
    pairs.push(['客户PO', detail.customer_po ?? '—']);
  }
  if (showPrice) {
    pairs.push(['币种', detail.currency ?? '—']);
    pairs.push(['单价', money4(detail.unit_price)]);
    pairs.push(['金额', money2(detail.total_amount)]);
  }

  const blocks: Block[] = [
    { kind: 'kv', pairs },
    // 【要多剥一层 matrix_data】接口回的是 OrderSizeMatrix 实体，搭配数据在 matrix.matrix_data 里，
    // 直接读 detail.matrix 永远是 undefined → 导出来一张空表还不报错（#109/#110 YSM 实测）。
    // 打印那边一直是对的（orderPrint 里写的就是 detail.matrix?.matrix_data），是我加导出时抄漏了。
    matrixBlock(detail.matrix?.matrix_data),
    // 对客口径不出用料明细：那是成本与工艺，客户看的是款式与数量
    ...(mode === 'customer' ? [] : [materialBlock(detail.materials ?? [], mode)]),
    {
      kind: 'kv',
      title: '说明',
      perRow: 1,
      pairs: [['脱敏口径', {
        customer: '对客单据：不含用料成本与供应商信息。',
        factory: '对工厂单据：不含客户信息与价格。',
        internal: '内部单据：含全部成本与客户信息，请勿外发。',
      }[mode]]],
    },
  ];

  await exportDocXlsx({
    sheetName: MODE_LABEL[mode],
    title: `订单 · ${MODE_LABEL[mode]}`,
    filename: `订单-${detail.order_no ?? 'export'}-${MODE_LABEL[mode]}.xlsx`,
    blocks,
  });
}
