// 采购/加工合同打印/导出 PDF —— 浏览器原生打印（A4，可"另存为 PDF"）
// 设计稿 G2/G3：抬头 + 甲乙双方 + 货物明细 + 金额 + 付款条件（定金/中期/尾款）+ 账期/交期

const DEFAULT_COMPANY = 'I9 服装制造有限公司';

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const n2 = (v: unknown): string => {
  const x = Number(v);
  return Number.isFinite(x) ? x.toFixed(2) : '—';
};
const typeLabel = (t: string): string =>
  ({ MATERIAL: '材料采购合同', PROCESS: '加工合同', SUPPLEMENT: '补料合同' } as Record<string, string>)[t] ?? '合同';

export function printContract(
  detail: any,
  factoryName?: string,
  company?: { name?: string; bank_name?: string; bank_account?: string },
): void {
  const companyName = company?.name || DEFAULT_COMPANY;
  const bankLine = company?.bank_name
    ? `<div><b>甲方开户行：</b>${esc(company.bank_name)}　账号：${esc(company.bank_account) || '—'}</div>`
    : '';
  const mats: any[] = detail.materials ?? [];
  const rows = mats.map((m, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(m.item_name)}</td>
      <td>${esc(m.spec)}</td>
      <td class="c">${esc(m.unit)}</td>
      <td class="r">${n2(m.qty)}</td>
      <td class="r">${n2(m.unit_price)}</td>
      <td class="r">${n2(m.amount)}</td>
      <td class="c">${esc(m.qty_source)}</td>
    </tr>`).join('') || `<tr><td class="c" colspan="8">（无货物明细）</td></tr>`;

  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>合同-${esc(detail.contract_no)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family:"Microsoft YaHei","PingFang SC","Songti SC",sans-serif; color:#1a1a1a; font-size:12px; }
  .head { text-align:center; border-bottom:2px solid #1E3A5F; padding-bottom:8px; }
  .company { font-size:16px; font-weight:700; color:#1E3A5F; }
  .title { font-size:20px; font-weight:700; letter-spacing:3px; margin-top:4px; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:2px 16px; margin:12px 0; }
  .meta b { color:#555; font-weight:600; }
  h3 { font-size:13px; color:#1E3A5F; margin:14px 0 4px; border-left:3px solid #D17A40; padding-left:6px; }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #ccc; padding:4px 6px; }
  th { background:#f2f5f8; color:#1E3A5F; font-weight:600; }
  td.c { text-align:center; } td.r { text-align:right; }
  .totals { margin-top:10px; text-align:right; font-size:13px; }
  .totals b { color:#C04042; font-size:15px; }
  .pay { margin-top:12px; } .pay span { display:inline-block; margin-right:20px; }
  .sign { margin-top:36px; display:flex; justify-content:space-between; }
  @media screen { body { max-width:820px; margin:20px auto; } }
</style></head><body onload="window.print()">
  <div class="head">
    <div class="company">${esc(companyName)}</div>
    <div class="title">${esc(typeLabel(detail.type))}</div>
  </div>
  <div class="meta">
    <div><b>合同编号：</b>${esc(detail.contract_no)}</div>
    <div><b>币种：</b>${esc(detail.currency) || '—'}</div>
    <div><b>甲方（委托方）：</b>${esc(companyName)}</div>
    <div><b>乙方（供应商）：</b>${esc(factoryName) || ('工厂#' + esc(detail.factory_id))}</div>
    ${bankLine}
    <div><b>最后发货日：</b>${detail.last_ship_date ? esc(String(detail.last_ship_date).slice(0, 10)) : '—'}</div>
    <div><b>账期：</b>${detail.account_period_days != null ? esc(detail.account_period_days) + ' 天' : '—'}</div>
  </div>

  <h3>货物明细</h3>
  <table>
    <thead><tr>
      <th style="width:36px">#</th><th>品名</th><th>规格</th><th style="width:44px">单位</th>
      <th style="width:80px">数量</th><th style="width:80px">单价</th><th style="width:96px">金额</th>
      <th style="width:110px">数量来源</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">合同总金额：<b>${esc(detail.currency) || ''} ${n2(detail.total_amount)}</b></div>

  <h3>付款条件</h3>
  <div class="pay">
    <span>定金：<b>${esc(detail.deposit_ratio ?? '—')}%</b></span>
    <span>中期款：<b>${esc(detail.mid_ratio ?? '—')}%</b></span>
    <span>尾款：<b>${esc(detail.final_ratio ?? '—')}%</b></span>
    <span>（尾款于发货后 ${detail.account_period_days != null ? esc(detail.account_period_days) : '—'} 天账期内结算）</span>
  </div>

  <div class="sign">
    <div>甲方（盖章）：＿＿＿＿＿＿＿＿</div>
    <div>乙方（盖章）：＿＿＿＿＿＿＿＿</div>
  </div>
</body></html>`;

  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) throw new Error('无法打开打印窗口，请允许弹出窗口后重试');
  win.document.open();
  win.document.write(html);
  win.document.close();
}
