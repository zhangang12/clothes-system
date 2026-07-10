// 报价单打印/导出 PDF —— 浏览器原生打印（A4，可"另存为 PDF"），中文字体天然支持、无第三方依赖
// 设计稿 G2/G3：公司抬头 + 客户 + 报价明细/费用 + 人民币/美金合计 + 业务员 + 有效期；对客隐藏供应商/成本（脱敏）

// 抬头默认公司名（当未传入本司主体时兜底）
const DEFAULT_COMPANY = 'I9 服装制造有限公司';

// 打印内容勾选(P3#32/rev G1-G3):对外口径默认去客户信息与利润率;可选含款图/费用明细
export interface QuotePrintOpts {
  internal?: boolean;   // true=内部留档(含客户信息与利润率);默认对外
  withImages?: boolean; // 含款图(样衣图随单继承)
  withFees?: boolean;   // 含费用明细(默认含)
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const n2 = (v: unknown): string => {
  const x = Number(v);
  return Number.isFinite(x) ? x.toFixed(2) : '—';
};
const n4 = (v: unknown): string => {
  const x = Number(v);
  return Number.isFinite(x) ? x.toFixed(4) : '—';
};

// 有效期：询价日 + 30 天（无独立字段时的默认口径）
function validUntil(inquiry?: string): string {
  if (!inquiry) return '自询价日起 30 天内有效';
  const d = new Date(inquiry);
  if (isNaN(d.getTime())) return '自询价日起 30 天内有效';
  d.setDate(d.getDate() + 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 前有效`;
}

const PRINT_STYLE = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Microsoft YaHei","PingFang SC","Songti SC",sans-serif; color:#1a1a1a; font-size:12px; }
  .head { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1E3A5F; padding-bottom:8px; }
  .company { font-size:18px; font-weight:700; color:#1E3A5F; }
  .title { font-size:22px; font-weight:700; letter-spacing:4px; }
  .title small { display:block; font-size:11px; letter-spacing:2px; color:#888; text-align:right; }
  .meta { display:grid; grid-template-columns:1fr 1fr 1fr; gap:2px 16px; margin:12px 0; }
  .meta div { padding:2px 0; }
  .meta b { color:#555; font-weight:600; }
  h3 { font-size:13px; color:#1E3A5F; margin:14px 0 4px; border-left:3px solid #D17A40; padding-left:6px; }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #ccc; padding:4px 6px; }
  th { background:#f2f5f8; color:#1E3A5F; font-weight:600; }
  td.c { text-align:center; } td.r { text-align:right; }
  .imgs { display:flex; gap:10px; margin:8px 0; } .imgs img { max-height:150px; max-width:45%; object-fit:contain; border:1px solid #eee; }
  .totals { margin-top:10px; display:flex; justify-content:flex-end; gap:24px; font-size:13px; }
  .totals b { color:#C04042; font-size:15px; }
  .foot { margin-top:20px; display:flex; justify-content:space-between; color:#555; }
  .tip { margin-top:6px; font-size:10px; color:#999; }
  @media screen { body { max-width:820px; margin:20px auto; } }
`;

// 单张报价单正文（printQuote / printQuoteBatch 复用；批量时多张之间以分页符分隔）
function buildQuoteBody(detail: any, companyName: string, opts: QuotePrintOpts = {}): string {
  const items: any[] = detail.items ?? [];
  const fees: any[] = detail.fees ?? [];

  const itemRows = items.map((it, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(it.part)}</td>
      <td>${esc(it.item_name)}</td>
      <td class="c">${esc(it.width)}</td>
      <td class="c">${esc(it.color)}</td>
      <td class="c">${esc(it.unit)}</td>
      <td class="r">${n4(it.quote_usage)}</td>
      <td class="r">${n4(it.rmb_price)}</td>
      <td class="r">${n2(it.loss_amount)}</td>
    </tr>`).join('') || `<tr><td class="c" colspan="9">（无报价明细）</td></tr>`;

  const feeRows = fees.map((f, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(f.fee_name)}</td>
      <td class="r">${n2(f.rmb_price)}</td>
      <td class="r">${n2(f.quote_usage ?? 1)}</td>
      <td class="r">${n2((+f.rmb_price || 0) * (+f.quote_usage || 0))}</td>
    </tr>`).join('') || `<tr><td class="c" colspan="5">（无费用明细）</td></tr>`;

  return `
  <div class="head">
    <div class="company">${esc(companyName)}</div>
    <div class="title">报价单<small>QUOTATION</small></div>
  </div>
  <div class="meta">
    <div><b>报价单号：</b>${esc(detail.quote_no)}</div>
    <div><b>询价日期：</b>${esc(detail.inquiry_date) || '—'}</div>
    <div><b>业务员：</b>${esc(detail.salesperson) || '—'}</div>
    ${opts.internal ? `<div><b>中间商客户：</b>${esc(detail.middleman_name) || '—'}</div>
    <div><b>最终买家：</b>${esc(detail.buyer_name) || '—'}</div>` : ''}
    <div><b>客户款号：</b>${esc(detail.style_no) || '—'}</div>
    <div><b>币种：</b>${esc(detail.currency) || '—'}</div>
    <div><b>汇率：</b>${n4(detail.exchange_rate)}</div>
    ${opts.internal ? `<div><b>利润率：</b>${detail.profit_rate != null ? esc(detail.profit_rate) + '%' : '—'}</div>` : ''}
  </div>
  ${opts.withImages && (detail.image1 || detail.image2) ? `<div class="imgs">${[detail.image1, detail.image2].filter(Boolean).map((u: string) => `<img src="${esc(u)}" alt="款图">`).join('')}</div>` : ''}

  <h3>报价明细</h3>
  <table>
    <thead><tr>
      <th style="width:36px">#</th><th>部位</th><th>品名</th><th style="width:56px">门幅</th>
      <th style="width:56px">颜色</th><th style="width:44px">单位</th><th style="width:70px">报价耗用</th>
      <th style="width:74px">单价</th><th style="width:84px">含损金额</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  ${opts.withFees === false ? '' : `<h3>费用明细</h3>
  <table>
    <thead><tr>
      <th style="width:36px">#</th><th>费用项目</th><th style="width:90px">单价</th>
      <th style="width:70px">数量</th><th style="width:100px">金额</th>
    </tr></thead>
    <tbody>${feeRows}</tbody>
  </table>`}

  <div class="totals">
    <div>人民币合计（含利润率）：<b>¥ ${n2(detail.rmb_total)}</b></div>
    <div>美金合计：<b>$ ${n2(detail.usd_total)}</b></div>
  </div>

  <div class="foot">
    <div>业务员：${esc(detail.salesperson) || '＿＿＿＿'}</div>
    <div>报价有效期：${esc(validUntil(detail.inquiry_date))}</div>
  </div>
  <div class="tip">＊ 本报价单对客不含供应商及成本信息；最终以双方确认的销售合同为准。</div>`;
}

function openPrintWindow(title: string, body: string): void {
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>${PRINT_STYLE}</style></head><body onload="window.print()">${body}</body></html>`;
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) {
    throw new Error('无法打开打印窗口，请允许弹出窗口后重试');
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function printQuote(detail: any, company?: { name?: string }, opts: QuotePrintOpts = {}): void {
  const companyName = company?.name || DEFAULT_COMPANY;
  openPrintWindow(`报价单-${detail.quote_no ?? ''}`, buildQuoteBody(detail, companyName, opts));
}

// 批量打印：多张报价单一个窗口，页间分页符（page-break-after），一次打印/导出 PDF
export function printQuoteBatch(details: any[], company?: { name?: string }): void {
  if (!details.length) return;
  const companyName = company?.name || DEFAULT_COMPANY;
  const body = details
    .map((d) => buildQuoteBody(d, companyName, {}))
    .join('<div style="page-break-after:always"></div>');
  openPrintWindow(`报价单批量打印(${details.length}张)`, body);
}
