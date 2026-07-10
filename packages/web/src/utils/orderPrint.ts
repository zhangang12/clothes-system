// 订单打印/导出 PDF —— 三套脱敏模板（P3#32/ORD E2）：
//   customer=对客（隐藏用料成本/供应商/单价，仅款式+数量搭配+交期+对客金额）
//   factory =对工厂（隐藏客户与对客价，含用料明细的名称/耗用/损耗与附件清单）
//   internal=内部（全量）
// 浏览器原生打印（A4，可"另存为 PDF"）

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const n2 = (v: unknown): string => { const x = Number(v); return Number.isFinite(x) ? x.toFixed(2) : '—'; };
const n4 = (v: unknown): string => { const x = Number(v); return Number.isFinite(x) ? x.toFixed(4) : '—'; };

export type OrderPrintMode = 'customer' | 'factory' | 'internal';

const MODE_LABEL: Record<OrderPrintMode, string> = {
  customer: '对客确认单', factory: '生产通知单', internal: '内部订单单据',
};

const PRINT_STYLE = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Microsoft YaHei","PingFang SC","Songti SC",sans-serif; color:#1a1a1a; font-size:12px; }
  .head { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1E3A5F; padding-bottom:8px; }
  .title { font-size:20px; font-weight:700; letter-spacing:3px; }
  .badge { font-size:11px; color:#888; }
  .meta { display:grid; grid-template-columns:1fr 1fr 1fr; gap:2px 16px; margin:12px 0; }
  .meta b { color:#555; font-weight:600; }
  h3 { font-size:13px; border-left:3px solid #1E3A5F; padding-left:6px; margin:14px 0 6px; }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #ccc; padding:4px 6px; text-align:center; }
  th { background:#f2f4f7; }
  .totals { margin-top:10px; text-align:right; font-size:13px; }
  .tip { margin-top:14px; font-size:10px; color:#999; }
`;

function matrixTable(matrix: any): string {
  const pos: any[] = matrix?.pos ?? [];
  const rows: any[] = matrix?.rows ?? [];
  if (!rows.length) return '<div class="tip">（未填写数量搭配）</div>';
  const head = `<tr><th>款号</th><th>颜色</th><th>尺码</th>${pos.map((p, i) => `<th>${esc(p.po_no || `PO${i + 1}`)}<br><small>${esc(p.destination || '')}</small></th>`).join('')}<th>合计</th></tr>`;
  const body = rows.map((r) => {
    const qtys: any[] = r.qtys ?? [];
    const sum = qtys.reduce((s, q) => s + (Number(q) || 0), 0);
    return `<tr><td>${esc(r.style_no)}</td><td>${esc(r.color)}</td><td>${esc(r.size)}</td>${pos.map((_, i) => `<td>${Number(qtys[i]) || 0}</td>`).join('')}<td><b>${sum}</b></td></tr>`;
  }).join('');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function materialTable(materials: any[], mode: OrderPrintMode): string {
  if (!materials?.length) return '<div class="tip">（无用料核算记录）</div>';
  const withCost = mode === 'internal';
  const withSupplier = mode === 'internal';
  const head = `<tr><th style="width:32px">#</th><th>品名</th><th>部位</th><th>颜色</th>${withSupplier ? '<th>供应商</th>' : ''}<th>单位</th><th>单件耗用</th><th>损耗%</th><th>采购量</th>${withCost ? '<th>单价</th><th>预算</th>' : ''}</tr>`;
  const body = materials.map((m, i) =>
    `<tr><td>${i + 1}</td><td>${esc(m.item_name)}</td><td>${esc(m.part) || '—'}</td><td>${esc(m.color) || '—'}</td>${withSupplier ? `<td>${esc(m.supplier) || '—'}</td>` : ''}<td>${esc(m.unit) || '—'}</td><td>${n4(m.net_usage)}</td><td>${m.loss_rate ?? '—'}</td><td>${m.final_purchase ?? m.total_purchase ?? '—'}</td>${withCost ? `<td>${n4(m.unit_price)}</td><td>${n2(m.budget)}</td>` : ''}</tr>`,
  ).join('');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

export function printOrder(detail: any, mode: OrderPrintMode): void {
  const showCustomer = mode !== 'factory';
  const showPrice = mode !== 'factory';
  const showMaterials = mode !== 'customer';
  const meta: string[] = [
    `<div><b>订单编号：</b>${esc(detail.order_no)}</div>`,
    `<div><b>客户PO：</b>${esc(detail.customer_po) || '—'}</div>`,
    `<div><b>款号：</b>${esc(detail.style_no) || '—'}</div>`,
    `<div><b>品名：</b>${esc(detail.style_name) || '—'}</div>`,
    `<div><b>大货总数：</b>${detail.qty_total ?? 0}</div>`,
    `<div><b>交期：</b>${esc(String(detail.delivery_date ?? '').slice(0, 10)) || '—'}</div>`,
  ];
  if (showCustomer) {
    meta.push(`<div><b>中间商：</b>${esc(detail.middleman_name) || '—'}</div>`);
    meta.push(`<div><b>最终买家：</b>${esc(detail.buyer_name) || '—'}</div>`);
  }
  if (showPrice) {
    meta.push(`<div><b>币种：</b>${esc(detail.currency) || '—'}</div>`);
    meta.push(`<div><b>单品单价：</b>${n4(detail.unit_price)}</div>`);
  }
  meta.push(`<div><b>业务员：</b>${esc(detail.salesperson) || '—'}</div>`);

  const totals = showPrice
    ? `<div class="totals">订单总金额：<b>${esc(detail.currency) || ''} ${n2(detail.total_amount)}</b></div>`
    : '';
  const tips: Record<OrderPrintMode, string> = {
    customer: '＊ 对客单据：不含用料成本与供应商信息。',
    factory: '＊ 对工厂单据：不含客户信息与价格；按数量搭配与用料工艺生产。',
    internal: '＊ 内部单据：含全部成本与客户信息，请勿外发。',
  };

  const body = `
  <div class="head">
    <div class="title">${MODE_LABEL[mode]}</div>
    <div class="badge">ORDER · ${esc(detail.order_no)}</div>
  </div>
  <div class="meta">${meta.join('')}</div>
  <h3>数量搭配（色/码/PO）</h3>
  ${matrixTable(detail.matrix?.matrix_data)}
  ${showMaterials ? `<h3>用料核算</h3>${materialTable(detail.materials ?? [], mode)}` : ''}
  ${totals}
  <div class="tip">${tips[mode]}</div>`;

  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>${MODE_LABEL[mode]}-${esc(detail.order_no ?? '')}</title>
<style>${PRINT_STYLE}</style></head><body onload="window.print()">${body}</body></html>`;
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) throw new Error('无法打开打印窗口，请允许弹出窗口后重试');
  win.document.open();
  win.document.write(html);
  win.document.close();
}
