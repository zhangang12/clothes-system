// 样衣导出 Excel —— 真 .xlsx（exceljs），照片/图稿真正嵌进文件。
//
// 【为什么从 .xls(HTML 工作表) 换成真 .xlsx】(2026-08-06 YSM 反馈「下载保存表格后没有图片呢」)
// 原实现走的是全站通用的「HTML 表格存成 .xls」路子（零依赖，见 utils/docExcel.ts），
// 图片是 `<img src="data:image/png;base64,...">` 内联进 HTML 的。数据部分没问题，
// **但 Excel 打开 HTML 工作表时并不渲染 data: URI 图片**——文件里有，界面上就是不显示，
// 用户看到的就是「表格下来了，图没了」，且没有任何报错。这是格式层面的限制，调参数解决不了。
// 真 .xlsx 的图片是作为独立媒体条目打包进 zip 并由 drawing 锚定到单元格的，Excel/WPS 都能正常显示。
//
// 【为什么可以引 exceljs】它已经是 packages/web 的既有依赖（导入功能解析 .xlsx 用它），
// 且一律**动态 import**：不点导出就不加载，主包体积不受影响（解包 20MB+，见 sheetPreview.ts 的说明）。
//
// 注意：本表的版式是手写的（不走 docExcel 的 Block 声明式排版），但抓图/解 data URI 这两件
// 公共事已收进 docExcel —— 合同、报价的导出也在用同一份，别再在这儿复制一遍。

import { toDataUrl, splitDataUrl } from './docExcel';
import { splitColorGroups, maxColorGroups, colorGroupLabel } from './colorGroups';

const d10 = (v: unknown): string => (v ? String(v).slice(0, 10) : '');
const val = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export async function exportSampleExcel(detail: any): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  // 工作表名上限 31 字符，且 : \ / ? * [ ] 非法——样衣号不含这些，仍统一截断保平安
  const ws = wb.addWorksheet(`样衣${String(detail.sample_no ?? '')}`.slice(0, 31));

  const cats = String(detail.categories ?? '').split(',').filter(Boolean).join(' / ');
  const mats: any[] = detail.materials ?? [];
  const rounds: any[] = detail.shipRounds ?? [];

  // 寄样改多轮子表后，单号/日期落在轮次上，旧单值列不再回填：为空时取首轮，
  // 使单轮样衣的基本信息与改版前一致；多轮的完整明细见下方「寄样跟踪」表。
  const r1: any = rounds[0] ?? {};
  const shipDate = detail.ship_sample_date ?? r1.ship_date;
  const shipNo = detail.material_ship_no ?? r1.ship_no;

  const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } } as const;
  const KEY_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F5F8' } } as const;
  const BORDER = {
    top: { style: 'thin' }, left: { style: 'thin' },
    bottom: { style: 'thin' }, right: { style: 'thin' },
  } as const;

  const titleRow = (text: string, span: number) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, Math.max(span, 1));
    row.getCell(1).font = { size: 14, bold: true };
    return row;
  };
  const headerRow = (cells: string[]) => {
    const row = ws.addRow(cells);
    row.eachCell((c) => {
      c.fill = HEAD_FILL as any;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.border = BORDER as any;
    });
    return row;
  };
  const bodyRow = (cells: any[]) => {
    const row = ws.addRow(cells);
    // 一律文本格式：款号形如 I27.230.03929，不强制会被 Excel 当数字截断成 27.23
    row.eachCell((c) => { c.numFmt = '@'; c.border = BORDER as any; });
    return row;
  };

  // ── 基本信息 ──
  titleRow(`样衣制作单 · ${val(detail.sample_no)}`, 4);
  for (const [k1, v1, k2, v2] of [
    ['样衣编号', detail.sample_no, '客户款号', detail.style_no],
    ['样衣类别', cats, '样衣尺码', detail.sample_size],
    ['样衣数量', detail.sample_qty, '中间商', detail.middleman_name],
    ['最终买家', detail.buyer_name, '制版师', detail.patternmaker_name],
    ['制单人', detail.maker, '制单日期', d10(detail.make_date)],
    ['寄样日期', d10(shipDate), '收件人', detail.recipient],
    ['材料寄出单号', shipNo, '寄回单号', detail.return_no],
    ['件数', detail.piece_count, '成衣备注', detail.garment_remark],
  ] as any[][]) {
    const row = bodyRow([val(k1), val(v1), val(k2), val(v2)]);
    row.getCell(1).fill = KEY_FILL as any; row.getCell(1).font = { bold: true };
    row.getCell(3).fill = KEY_FILL as any; row.getCell(3).font = { bold: true };
  }

  // ── 寄样跟踪（多轮）──
  if (rounds.length) {
    ws.addRow([]);
    titleRow('寄样跟踪', 9);
    headerRow(['轮次', '尺码', '件数', '寄出日期', '寄出单号', '寄回日期', '工价单价', '工价金额', '备注']);
    rounds.forEach((r, i) => bodyRow([
      val(r.round_no ?? i + 1), val(r.size), val(r.qty), d10(r.ship_date), val(r.ship_no),
      d10(r.return_date), val(r.labor_unit_price), val(r.labor_amount), val(r.remark),
    ]));
    const qtySum = rounds.reduce((s, r) => s + (Number(r.qty) || 0), 0);
    const amtSum = +rounds.reduce((s, r) => s + (Number(r.labor_amount) || 0), 0).toFixed(2);
    const sumRow = bodyRow(['合计', '', String(qtySum), '', '', '', '', String(amtSum), '']);
    sumRow.eachCell((c) => { c.font = { bold: true }; });
  }

  // ── 材料明细 ──
  ws.addRow([]);
  // 颜色按色组摊成多列（2026-08-10 Grace 反馈，附了工厂真实工艺单）：
  // 工厂要横着看「每个色组下这条辅料用什么颜色」，全挤在一格里得自己数逗号，很容易对错行。
  // 只有一个色组时保持单列，别让单色样衣平白多出空列。
  const ng = maxColorGroups(mats);
  const colorCols = ng > 1 ? Array.from({ length: ng }, (_, i) => colorGroupLabel(i)) : ['颜色'];
  const colorVals = (m: any): string[] => {
    const g = splitColorGroups(m.colors);
    return ng > 1 ? Array.from({ length: ng }, (_, i) => val(g[i] ?? '')) : [val(m.colors)];
  };
  const head = ['#', '品名', '门幅', ...colorCols, '部位', '成份', '码带', '拉链长度',
    '数量', '克重', '尺寸', '实际耗用', '供应商', '备注'];
  titleRow('材料明细', head.length);
  headerRow(head);
  if (mats.length) {
    mats.forEach((m, i) => bodyRow([
      String(i + 1), val(m.item_name), val(m.width), ...colorVals(m), val(m.part), val(m.composition),
      val(m.code_band), val(m.zipper_length), val(m.qty), val(m.gram_weight), val(m.size),
      val(m.actual_usage), val(m.supplier_name), val(m.remark),
    ]));
  } else {
    bodyRow(['（无材料明细）']);
  }

  // ── 样衣照片/图稿：真正嵌进 xlsx（image1/2/3 每槽可多图，逗号分隔）──
  const photoUrls = [detail.image1, detail.image2, detail.image3]
    .flatMap((u) => String(u ?? '').split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  if (photoUrls.length) {
    ws.addRow([]);
    titleRow('样衣照片/图稿', 6);
    const anchorRow = ws.rowCount; // 图片锚在标题行下方，逐张往右排
    let col = 0;
    for (const u of photoUrls) {
      const dataUrl = await toDataUrl(u);
      const parsed = dataUrl ? splitDataUrl(dataUrl) : null;
      if (!parsed) {
        // 抓取失败/超 2MB：退回一行可点链接，不让整个导出失败
        const row = bodyRow([u]);
        row.getCell(1).value = { text: '图（未内联，点开查看）', hyperlink: u } as any;
        continue;
      }
      const imgId = wb.addImage({ base64: parsed.body, extension: parsed.ext });
      ws.addImage(imgId, {
        tl: { col, row: anchorRow } as any,
        ext: { width: 220, height: 170 },
      });
      col += 4; // 一张图约占 4 列宽，避免相互压盖
    }
    // 给图片留出高度，否则会盖住后面的行
    for (let i = 0; i < 9; i++) ws.addRow([]);
  }

  ws.columns.forEach((c) => { c.width = c.width ?? 14; });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `样衣-${detail.sample_no || detail.style_no || 'export'}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
