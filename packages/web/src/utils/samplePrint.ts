// 样衣制作单打印/导出 PDF —— 浏览器原生打印（A4，可"另存为 PDF"，与 contractPrint 同模式）
// 对外单据脱敏：材料明细不含「参考价格」（设计稿：版师/外发单据不见价格）。

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const d10 = (v: unknown): string => (v ? esc(String(v).slice(0, 10)) : '—');
const dash = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : esc(v));

export function printSample(detail: any): void {
  const cats = String(detail.categories ?? '').split(',').filter(Boolean).join(' · ');

  const metaBlock = `
  <div class="meta">
    <div><b>客户款号：</b>${dash(detail.style_no)}</div>
    <div><b>样衣类别：</b>${cats || '—'}</div>
    <div><b>中间商：</b>${dash(detail.middleman_name)}</div>
    <div><b>最终买家：</b>${dash(detail.buyer_name)}</div>
    <div><b>制版师：</b>${dash(detail.patternmaker_name)}</div>
    <div><b>制单人：</b>${dash(detail.maker)}</div>
    <div><b>制单日期：</b>${d10(detail.make_date)}</div>
    <div><b>寄样日期：</b>${d10(detail.ship_sample_date)}</div>
    <div><b>收件人：</b>${dash(detail.recipient)}</div>
    <div><b>样衣编号：</b>${dash(detail.sample_no)}</div>
  </div>`;

  // 材料明细（脱敏：不含参考价格）
  const mats: any[] = detail.materials ?? [];
  const tableHead = `<tr><th style="width:32px">#</th><th>品名</th><th style="width:64px">门幅</th>
    <th style="width:90px">颜色</th><th style="width:64px">部位</th><th style="width:90px">成份</th>
    <th style="width:60px">码带</th><th style="width:56px">数量</th><th style="width:80px">尺寸</th><th>备注</th></tr>`;
  let rows = mats.map((m, i) => `
    <tr><td class="c">${i + 1}</td><td>${dash(m.item_name)}</td><td class="c">${dash(m.width)}</td>
    <td class="c">${dash(m.colors)}</td><td class="c">${dash(m.part)}</td><td class="c">${dash(m.composition)}</td>
    <td class="c">${dash(m.code_band)}</td><td class="r">${dash(m.qty)}</td><td class="c">${dash(m.size)}</td>
    <td>${dash(m.remark)}</td></tr>`).join('');
  if (!rows) rows = `<tr><td class="c" colspan="10">（无材料明细）</td></tr>`;

  const trackBlock = `
  <div class="meta">
    <div><b>材料寄出单号：</b>${dash(detail.material_ship_no)}</div>
    <div><b>材料寄出日期：</b>${d10(detail.material_ship_date)}</div>
    <div><b>寄回快递单号：</b>${dash(detail.return_no)}</div>
    <div><b>寄回日期：</b>${d10(detail.return_date)}</div>
    <div><b>件数：</b>${dash(detail.piece_count)}</div>
  </div>`;

  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>样衣制作单-${esc(detail.sample_no)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family:"Microsoft YaHei","PingFang SC","Songti SC",sans-serif; color:#1a1a1a; font-size:12px; }
  .head { text-align:center; border-bottom:2px solid #1E3A5F; padding-bottom:8px; }
  .title { font-size:20px; font-weight:700; letter-spacing:3px; color:#1E3A5F; }
  .sub { font-size:12px; color:#666; margin-top:4px; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:2px 16px; margin:12px 0; }
  .meta b { color:#555; font-weight:600; }
  h3 { font-size:13px; color:#1E3A5F; margin:14px 0 4px; border-left:3px solid #D17A40; padding-left:6px; }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #ccc; padding:4px 6px; }
  th { background:#f2f5f8; color:#1E3A5F; font-weight:600; }
  td.c { text-align:center; } td.r { text-align:right; }
  .remark { margin-top:8px; line-height:1.7; }
  @media screen { body { max-width:820px; margin:20px auto; } }
</style></head><body onload="window.print()">
  <div class="head">
    <div class="title">样衣制作单</div>
    <div class="sub">样衣编号：${esc(detail.sample_no)}</div>
  </div>

  <h3>基本信息</h3>
  ${metaBlock}

  <h3>材料明细</h3>
  <table><thead>${tableHead}</thead><tbody>${rows}</tbody></table>

  <h3>寄样跟踪</h3>
  ${trackBlock}
  ${detail.garment_remark ? `<h3>成衣备注</h3><div class="remark">${esc(detail.garment_remark)}</div>` : ''}
</body></html>`;

  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) throw new Error('无法打开打印窗口，请允许弹出窗口后重试');
  win.document.open();
  win.document.write(html);
  win.document.close();
}
