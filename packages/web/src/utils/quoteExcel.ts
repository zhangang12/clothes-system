// 报价单导出 Excel —— 公共层见 docExcel.ts(排版/防截断/落盘都在那)。
// 与 quotePrint.ts(打印)的差别:打印分对内/对外两版脱敏,导出按业务要求**全量不脱敏**
// (含中间商/买家/利润率/供应商),导出件仅供内部流转,勿直接转发客户。
//
// 【走 exportDocXlsx 而不是 exportDocExcel】带款图。原来内联成 <img src="data:...">
// 塞进 HTML 工作表的 .xls，Excel 打开时那张图根本不渲染（和合同导出同一个病，2026-08-06 一并修）。

import { exportDocXlsx, d10, n2, n4, sum, imgCell, type Block } from './docExcel';

export async function exportQuoteExcel(detail: any): Promise<void> {
  const items: any[] = detail.items ?? [];
  const fees: any[] = detail.fees ?? [];

  const blocks: Block[] = [
    {
      kind: 'kv',
      pairs: [
        ['报价单号', detail.quote_no],
        ['询价日期', d10(detail.inquiry_date)],
        ['客户款号', detail.style_no],
        ['业务员', detail.salesperson],
        ['中间商', detail.middleman_name],
        ['最终买家', detail.buyer_name],
        ['样衣编号', detail.sample_no],
        ['状态', detail.status],
        ['币种', detail.currency],
        ['汇率', n4(detail.exchange_rate)],
        ['贸易国别', detail.trade_country],
        ['结汇方式', detail.settlement_method],
        ['价格条款', detail.price_terms],
        ['数量', detail.quote_qty],
        ['利润率', detail.profit_rate != null ? `${detail.profit_rate}%` : ''],
        ['人民币合计(含利润率)', n2(detail.rmb_total)],
        ['美金合计', n2(detail.usd_total)],
        ['备注说明', detail.total_remark],
      ],
    },
    {
      kind: 'table',
      title: '报价明细',
      head: ['#', '部位', '品名', '门幅', '颜色', '单位', '报价耗用', '单价', '含损金额'],
      rows: items.map((it, i) => [
        i + 1, it.part, it.item_name, it.width, it.color, it.unit,
        n4(it.quote_usage), n4(it.rmb_price), n2(it.loss_amount),
      ]),
      foot: ['合计', '', '', '', '', '', '', '', n2(sum(items, (it) => it.loss_amount))],
      empty: '（无报价明细）',
    },
  ];

  if (fees.length) {
    blocks.push({
      kind: 'table',
      title: '费用明细',
      head: ['#', '费用项目', '单价', '数量', '金额'],
      // 费用金额是算出来的、库里不存:与 quotePrint.ts 口径一致(单价 × 数量,数量缺省按 1)
      rows: fees.map((f, i) => [
        i + 1, f.fee_name, n2(f.rmb_price), n2(f.quote_usage ?? 1),
        n2((Number(f.rmb_price) || 0) * (Number(f.quote_usage ?? 1) || 0)),
      ]),
      foot: ['合计', '', '', '', n2(sum(fees, (f) => (Number(f.rmb_price) || 0) * (Number(f.quote_usage ?? 1) || 0)))],
    });
  }

  // 款图（用户反馈：文件导出来照片要在里面；image1/2 单图，抓不到/超 2MB 由公共层退回可点链接）
  const imageUrls = [detail.image1, detail.image2].filter(Boolean) as string[];
  if (imageUrls.length) {
    blocks.push({
      kind: 'table',
      title: '款图/图稿',
      head: imageUrls.map((_, i) => `图${i + 1}`),
      rows: [imageUrls.map((u) => imgCell(u, 240, '图（未内联，点开查看）'))],
    });
  }

  await exportDocXlsx({
    sheetName: `报价${detail.quote_no || ''}`,
    title: `报价单 · ${detail.quote_no || ''}`,
    filename: `报价单-${detail.quote_no || detail.style_no || 'export'}.xlsx`,
    blocks,
  });
}
