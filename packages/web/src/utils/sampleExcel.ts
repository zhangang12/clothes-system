// 样衣导出 Excel —— 无第三方依赖(项目零新增依赖约定):生成 Excel 可直接打开的 HTML 工作表(.xls),
// 含「基本信息 + 材料明细」两张表。中文用 UTF-8 BOM/meta 防乱码;单元格 mso-number-format 强制文本,
// 避免款号(如 I27.230.03929)被 Excel 当数字截断。

const BOM = String.fromCharCode(0xfeff); // UTF-8 BOM,保证 Excel 以 UTF-8 打开、中文不乱码
const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const d10 = (v: unknown): string => (v ? String(v).slice(0, 10) : '');
const val = (v: unknown): string => (v === null || v === undefined ? '' : esc(v));

export function exportSampleExcel(detail: any): void {
  const cats = String(detail.categories ?? '').split(',').filter(Boolean).join(' / ');
  const mats: any[] = detail.materials ?? [];

  const infoRows = [
    ['样衣编号', detail.sample_no, '客户款号', detail.style_no],
    ['样衣类别', cats, '样衣尺码', detail.sample_size],
    ['样衣数量', detail.sample_qty, '中间商', detail.middleman_name],
    ['最终买家', detail.buyer_name, '制版师', detail.patternmaker_name],
    ['制单人', detail.maker, '制单日期', d10(detail.make_date)],
    ['寄样日期', d10(detail.ship_sample_date), '收件人', detail.recipient],
    ['材料寄出单号', detail.material_ship_no, '寄回单号', detail.return_no],
    ['件数', detail.piece_count, '成衣备注', detail.garment_remark],
  ].map((r) => `<tr><td class="k">${val(r[0])}</td><td>${val(r[1])}</td><td class="k">${val(r[2])}</td><td>${val(r[3])}</td></tr>`).join('');

  const matHead = `<tr>${['#', '品名', '门幅', '颜色', '部位', '成份', '码带', '拉链长度', '数量', '尺寸', '实际耗用', '供应商', '备注']
    .map((h) => `<th>${h}</th>`).join('')}</tr>`;
  const matRows = mats.length
    ? mats.map((m, i) => `<tr><td>${i + 1}</td><td>${val(m.item_name)}</td><td>${val(m.width)}</td>`
      + `<td>${val(m.colors)}</td><td>${val(m.part)}</td><td>${val(m.composition)}</td><td>${val(m.code_band)}</td>`
      + `<td>${val(m.zipper_length)}</td><td>${val(m.qty)}</td><td>${val(m.size)}</td><td>${val(m.actual_usage)}</td>`
      + `<td>${val(m.supplier_name)}</td><td>${val(m.remark)}</td></tr>`).join('')
    : '<tr><td colspan="13">（无材料明细）</td></tr>';

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>样衣${esc(detail.sample_no || '')}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  table { border-collapse: collapse; }
  td, th { border: 0.5pt solid #999; padding: 3px 6px; mso-number-format:"\\@"; }
  th { background: #1E3A5F; color: #fff; font-weight: 700; }
  td.k { background: #f2f5f8; font-weight: 700; }
  .title { font-size: 15pt; font-weight: 700; }
</style></head>
<body>
  <table>
    <tr><td colspan="4" class="title">样衣制作单 · ${esc(detail.sample_no || '')}</td></tr>
    ${infoRows}
  </table>
  <br/>
  <table>${matHead}${matRows}</table>
</body></html>`;

  const blob = new Blob([BOM + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `样衣-${detail.sample_no || detail.style_no || 'export'}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
