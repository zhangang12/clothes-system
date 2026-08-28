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
  .sub td { background:#faf8f2; color:#666; font-size:11px; text-align:left; }
  .photos { display:flex; flex-wrap:wrap; gap:10px; margin-top:6px; }
  .att { text-align:center; } .att img { max-width:230px; max-height:170px; object-fit:cover; border:1px solid #ddd; border-radius:4px; }
  .att-label { font-size:11px; color:#666; margin-bottom:2px; }
`;

function matrixTable(matrix: any): string {
  const pos: any[] = matrix?.pos ?? [];
  const rows: any[] = matrix?.rows ?? [];
  if (!rows.length) return '<div class="tip">（未填写数量搭配）</div>';
  // 洗标号/Article：工厂据此区分标类（用户反馈①）。老订单没填过，整列为空时不占版面。
  const withArticle = rows.some((r) => String(r.article ?? '').trim());
  const head = `<tr><th>款号</th><th>颜色</th>${withArticle ? '<th>洗标号</th>' : ''}<th>尺码</th>${pos.map((p, i) => `<th>${esc(p.po_no || `PO${i + 1}`)}<br><small>${esc(p.destination || '')}${p.consignee ? ` · ${esc(p.consignee)}` : ''}</small></th>`).join('')}<th>合计</th></tr>`;
  const body = rows.map((r) => {
    const qtys: any[] = r.qtys ?? [];
    const sum = qtys.reduce((s, q) => s + (Number(q) || 0), 0);
    return `<tr><td>${esc(r.style_no)}</td><td>${esc(r.color)}</td>${withArticle ? `<td>${esc(r.article) || '—'}</td>` : ''}<td>${esc(r.size)}</td>${pos.map((_, i) => `<td>${Number(qtys[i]) || 0}</td>`).join('')}<td><b>${sum}</b></td></tr>`;
  }).join('');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/**
 * 生产通知单的数量搭配：**每 PO 一行、尺码作列**（#118 daisy 给了工厂实际在用的样张）。
 *
 * 【为什么转置】默认的 matrixTable 是「行 = 款·色·码，列 = 各 PO」——3 色 4 码 6 个 PO
 * 就是 12 行 × 6 列数量格，工厂对着 PO 裁剪/包装时要在整张表里跳着找；她的样张是
 * 每 PO 一行（PO# / 洗标号 / 颜色 / 各码数量 / 合计），6 行看完，纸也省。
 * 只用于 factory（生产通知单）；对客/内部维持原版式，那两份的读者是按款·色·码核数的。
 *
 * 【船期列没做】她样张里有「船期」，但系统的 PO 维度只存 目的地/收货人，船期只有
 * 订单级 delivery_date——没有的数据不能编，列上不出，回复里说明。
 */
export function matrixPivotRows(matrix: any): { head: string[]; rows: (string | number)[][]; foot: (string | number)[] } | null {
  const pos: any[] = matrix?.pos ?? [];
  const rows: any[] = matrix?.rows ?? [];
  if (!pos.length || !rows.length) return null;
  const sizes: string[] = [...new Set(rows.map((r) => String(r.size ?? '')))];
  const withArticle = rows.some((r) => String(r.article ?? '').trim());
  const withDest = pos.some((p) => String(p.destination ?? '').trim());

  const out: (string | number)[][] = [];
  pos.forEach((p, pi) => {
    // 同一 PO 内按 颜色+洗标号 分组（她的样张一 PO 一色；多色 PO 自然摊成多行）
    const groups = new Map<string, any[]>();
    for (const r of rows) {
      const key = `${r.color ?? ''}\u0001${r.article ?? ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    for (const [key, grs] of groups) {
      const [color, article] = key.split('\u0001');
      const bySize = (sz: string) => grs.filter((r) => String(r.size ?? '') === sz)
        .reduce((t, r) => t + (Number(r.qtys?.[pi]) || 0), 0);
      const nums = sizes.map(bySize);
      const total = nums.reduce((a, b) => a + b, 0);
      if (!total) continue;               // 这个 PO 没这组颜色的量，不出空行
      out.push([p.po_no || `PO${pi + 1}`, ...(withArticle ? [article] : []), color, ...nums, total,
        ...(withDest ? [p.destination ?? ''] : [])]);
    }
  });
  if (!out.length) return null;

  const head = ['PO#', ...(withArticle ? ['洗标号'] : []), '颜色', ...sizes, '合计', ...(withDest ? ['目的地'] : [])];
  const base = 2 + (withArticle ? 1 : 0);   // 数量列起始下标
  const colSum = (ci: number) => out.reduce((t, r) => t + (Number(r[base + ci]) || 0), 0);
  const foot = ['合计', ...(withArticle ? [''] : []), '', ...sizes.map((_, ci) => colSum(ci)),
    out.reduce((t, r) => t + (Number(r[base + sizes.length]) || 0), 0), ...(withDest ? [''] : [])];
  return { head, rows: out, foot };
}

function matrixPivotTable(matrix: any): string {
  const p = matrixPivotRows(matrix);
  if (!p) return '<div class="tip">（未填写数量搭配）</div>';
  const tr = (cells: (string | number)[], tag = 'td') => `<tr>${cells.map((c) => `<${tag}>${esc(String(c))}</${tag}>`).join('')}</tr>`;
  return `<table><thead>${tr(p.head, 'th')}</thead><tbody>${p.rows.map((r) => tr(r)).join('')}${tr(p.foot.map((c, i) => (i === 0 ? c : c || '')) as any)}</tbody></table>`;
}

function materialTable(materials: any[], mode: OrderPrintMode): string {
  if (!materials?.length) return '<div class="tip">（无用料核算记录）</div>';
  const withCost = mode === 'internal';
  const withSupplier = mode === 'internal';
  const cols = 8 + (withSupplier ? 1 : 0) + (withCost ? 2 : 0);
  const head = `<tr><th style="width:32px">#</th><th>品名</th><th>部位</th><th>颜色</th>${withSupplier ? '<th>供应商</th>' : ''}<th>单位</th><th>单件耗用</th><th>损耗%</th><th>采购量</th>${withCost ? '<th>单价</th><th>预算</th>' : ''}</tr>`;
  // 分码材料带出各码尺寸（拉链/织带按码不同尺寸，工厂按码裁料）
  const sizeSpecsRow = (m: any): string => {
    if (m.split_mode !== 'BY_SIZE' || !m.size_specs) return '';
    const parts = Object.entries(m.size_specs).filter(([, v]) => String(v ?? '').trim());
    if (!parts.length) return '';
    return `<tr class="sub"><td></td><td colspan="${cols - 1}">各码尺寸：${parts.map(([k, v]) => `${esc(k)}=${esc(String(v))}`).join(' / ')}</td></tr>`;
  };
  const body = materials.map((m, i) =>
    `<tr><td>${i + 1}</td><td>${esc(m.item_name)}</td><td>${esc(m.part) || '—'}</td><td>${esc(m.color) || '—'}</td>${withSupplier ? `<td>${esc(m.supplier) || '—'}</td>` : ''}<td>${esc(m.unit) || '—'}</td><td>${n4(m.net_usage)}</td><td>${m.loss_rate ?? '—'}</td><td>${m.final_purchase ?? m.total_purchase ?? '—'}</td>${withCost ? `<td>${n4(m.unit_price)}</td><td>${n2(m.budget)}</td>` : ''}</tr>`
    + sizeSpecsRow(m),
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
  meta.push(`<div><b>制单日期：</b>${esc(String(detail.make_date ?? '').slice(0, 10)) || '—'}</div>`);
  if (mode === 'internal' && detail.commission_rate != null && +detail.commission_rate) {
    meta.push(`<div><b>佣金率：</b>${esc(detail.commission_rate)}%</div>`);
  }

  // 附件档案（彩稿/尺寸表/纸板/包装资料/填充量）：图片直接嵌，非图给文件名清单
  const ATT_LABEL: Array<[string, string]> = [
    ['att_artwork', '彩稿'], ['att_sizechart', '大货尺寸表'], ['att_board', '大货纸板'],
    ['att_packing', '包装资料'], ['att_filling', '填充量'],
  ];
  const IMG_EXT = /\.(png|jpe?g|webp|gif)$/i;
  const attImgs: string[] = [];
  const attFiles: string[] = [];
  for (const [k, label] of ATT_LABEL) {
    for (const u of String(detail[k] ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)) {
      if (IMG_EXT.test(u)) attImgs.push(`<div class="att"><div class="att-label">${label}</div><img src="${esc(u)}" /></div>`);
      else attFiles.push(`${label}（${esc(u.split('/').pop() || u)}）`);
    }
  }
  const attBlock = attImgs.length || attFiles.length
    ? `<h3>附件档案</h3><div class="photos">${attImgs.join('')}</div>${attFiles.length ? `<div class="tip">非图片附件（系统内查看）：${attFiles.join('；')}</div>` : ''}`
    : '';

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
  <h3>${mode === 'factory' ? '数量搭配（按 PO · 工厂裁剪/包装对照）' : '数量搭配（色/码/PO）'}</h3>
  ${mode === 'factory' ? matrixPivotTable(detail.matrix?.matrix_data) : matrixTable(detail.matrix?.matrix_data)}
  ${showMaterials ? `<h3>用料核算</h3>${materialTable(detail.materials ?? [], mode)}` : ''}
  ${attBlock}
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
