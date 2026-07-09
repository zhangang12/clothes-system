// 合同打印/导出 PDF —— 浏览器原生打印（A4，可"另存为 PDF"）
// 设计稿 04-合同 v1.3：材料/加工各套模板；甲乙方按类型（材料:甲方=供方/乙方=本司；加工:受托方=工厂/委托方=本司）；
// 条款取 terms_json（模板填空）；加工含「以上价格包含…」段；填担保人自动插丙方担保条款（D7）；落款自动贴电子章位。

const DEFAULT_COMPANY = 'I9 服装制造有限公司';

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const n2 = (v: unknown): string => {
  const x = Number(v);
  return Number.isFinite(x) ? x.toFixed(2) : '—';
};
const d10 = (v: unknown): string => (v ? esc(String(v).slice(0, 10)) : '—');
const typeLabel = (t: string): string =>
  ({ MATERIAL: '原料/辅料购销协议', PROCESS: '委托加工合同', SUPPLEMENT: '补料合同（原料/辅料购销协议）' } as Record<string, string>)[t] ?? '合同';

interface FactoryLike { name?: string; address?: string; contact_name?: string; contact_phone?: string }
interface CompanyLike { name?: string; address?: string; phone?: string; legal_rep?: string; bank_name?: string; bank_account?: string }

// 条款模板兜底（与编辑页一致；terms_json 有值优先）
const MATERIAL_TERM_DEFS: Array<[string, string, string]> = [
  ['quality', '第二条 质量标准', '颜色：同确认样；成份：按封样；缩水率：≤3%；交货前提交 5 份样品双方签字封存。'],
  ['delivery_method', '第三条 交货方式', '由甲方运送至乙方指定地点，运费由甲方承担。'],
  ['acceptance', '第四条 货物验收', '乙方享有自主验货权；质量异议期限：6 个月。'],
  ['settlement', '第五条 货款结算', '按本合同约定账期结算（发货日 + 账期天数 = 付款到期日）。'],
  ['breach', '第六条 违约责任', '逾期交货每天 5‰，逾期超 7 天可解约；逾期付款每天 5‰。'],
  ['dispute', '第七~八条 争议解决 / 其他', '协商不成提交签订地仲裁/法院；本协议一式贰份，双方各执壹份。'],
];
const PROCESS_TERM_DEFS: Array<[string, string, string]> = [
  ['price_clause', '加工费及价格', '以上加工单价已包含「价格包含项」勾选内容，增值税含税不另计；不含项以勾选为准。'],
  ['packaging', '包装/质量/交货', '按客户要求及书面指示；受托方按委托方书面通知交至指定地点。'],
  ['quality', '产品质量', '符合品种/规格/花色/尺码规定；内在品质负责期 6 个月。'],
  ['settlement', '结算方式', '货物送达并审核无误后按账期付款；凭工厂发票 + 入库单结算。'],
  ['breach_misc', '违约 / 变更 / 争议 / 份数', '不能交货违约金 5%；委托方所在地法院管辖；一式两份各执一份。'],
];

export function printContract(
  detail: any,
  factory?: FactoryLike | string,
  company?: CompanyLike,
): void {
  const isProcess = detail.type === 'PROCESS';
  const f: FactoryLike = typeof factory === 'string' ? { name: factory } : (factory ?? {});
  const factoryName = f.name || `工厂#${detail.factory_id ?? ''}`;
  const companyName = company?.name || DEFAULT_COMPANY;
  const factoryTitle = isProcess ? '受托方（加工厂）' : '甲方（供方）';
  const companyTitle = isProcess ? '委托方（本司）' : '乙方（需方）';

  // 甲乙双方块（材料:甲方=供方/乙方=本司；加工:受托方=工厂/委托方=本司 —— 设计稿两类编辑页）
  const partyBlock = `
  <div class="meta">
    <div><b>${factoryTitle}：</b>${esc(factoryName)}</div>
    <div><b>${companyTitle}：</b>${esc(companyName)}</div>
    <div><b>${isProcess ? '受托方地址' : '甲方住所'}：</b>${esc(f.address) || '—'}</div>
    <div><b>${isProcess ? '委托方地址' : '乙方地址'}：</b>${esc(company?.address) || '—'}</div>
    <div><b>${isProcess ? '受托方代表' : '甲方代表'}：</b>${[f.contact_name, f.contact_phone].filter(Boolean).map(esc).join(' / ') || '—'}</div>
    <div><b>${isProcess ? '委托方代表' : '乙方代表'}：</b>${esc(detail.company_rep) || '—'}</div>
    ${detail.guarantor ? `<div><b>丙方（担保人）：</b>${esc(detail.guarantor)}</div>` : ''}
    <div><b>${isProcess ? '签订地址' : '签约地点'}：</b>${esc(detail.sign_place) || '—'}</div>
    <div><b>${isProcess ? '签订日期' : '签约日期'}：</b>${d10(detail.sign_date)}</div>
    <div><b>关联款号：</b>${esc(detail.style_nos) || '—'}</div>
    <div><b>合同编号：</b>${esc(detail.contract_no)}</div>
    <div><b>币种：</b>${esc(detail.currency) || 'CNY'}</div>
    ${isProcess
      ? `<div><b>交货期限：</b>${d10(detail.delivery_deadline)}</div>`
      : `<div><b>发货地址：</b>${esc(detail.ship_to_address) || '—'}</div>`}
    ${company?.bank_name ? `<div><b>${companyTitle}开户行：</b>${esc(company.bank_name)}　账号：${esc(company.bank_account) || '—'}</div>` : ''}
  </div>`;

  // 货物明细（两类列不同）
  const mats: any[] = detail.materials ?? [];
  let tableHead: string;
  let rows: string;
  if (isProcess) {
    tableHead = `<tr><th style="width:36px">#</th><th style="width:110px">货号</th><th>品名及规格</th>
      <th style="width:70px">数量</th><th style="width:44px">单位</th><th style="width:90px">加工单价(RMB)</th>
      <th style="width:96px">总价(RMB)</th><th style="width:90px">交期</th></tr>`;
    rows = mats.map((m, i) => `
      <tr><td class="c">${i + 1}</td><td class="c">${esc(m.style_no)}</td><td>${esc(m.item_name)}${m.spec ? ' · ' + esc(m.spec) : ''}</td>
      <td class="r">${n2(m.qty)}</td><td class="c">${esc(m.unit)}</td><td class="r">${n2(m.unit_price)}</td>
      <td class="r">${n2(m.amount)}</td><td class="c">${d10(m.delivery_date)}</td></tr>`).join('');
  } else {
    tableHead = `<tr><th style="width:36px">#</th><th>品名</th><th>规格</th><th style="width:60px">颜色</th><th style="width:56px">尺码/码</th>
      <th style="width:40px">单位</th><th style="width:70px">数量</th><th style="width:70px">单价(元)</th><th style="width:86px">小计(元)</th>
      <th style="width:92px">款号</th><th style="width:88px">交货期限</th></tr>`;
    rows = mats.map((m, i) => `
      <tr><td class="c">${i + 1}</td><td>${esc(m.item_name)}</td><td>${esc(m.spec)}</td><td class="c">${esc(m.color) || '—'}</td>
      <td class="c">${esc(m.size) || '—'}</td><td class="c">${esc(m.unit)}</td><td class="r">${n2(m.qty)}</td>
      <td class="r">${n2(m.unit_price)}</td><td class="r">${n2(m.amount)}</td><td class="c">${esc(m.style_no) || '—'}</td>
      <td class="c">${d10(m.delivery_date)}</td></tr>`).join('');
  }
  if (!rows) rows = `<tr><td class="c" colspan="12">（无货物明细）</td></tr>`;

  // 价格包含项（加工合同，仅汇入文字不改金额 D4）
  const includes: string[] = Array.isArray(detail.price_includes) ? detail.price_includes : [];
  const priceIncludeBlock = isProcess
    ? `<h3>价格包含项</h3>
       <div class="clause">以上价格包含：${includes.map(esc).join('、') || '—'}；不含：胶袋${detail.price_other ? '；其他：' + esc(detail.price_other) : ''}。
       增值税 ${detail.vat_rate != null ? esc(detail.vat_rate) : '13'}%（含税不另计）。</div>`
    : '';

  // 条款（terms_json 填空优先，模板兜底；D3）
  const termDefs = isProcess ? PROCESS_TERM_DEFS : MATERIAL_TERM_DEFS;
  const tj = (detail.terms_json && typeof detail.terms_json === 'object') ? detail.terms_json : {};
  const termBlock = termDefs.map(([key, label, def]) =>
    `<div class="term"><b>${esc(label)}：</b>${esc(tj[key] ?? def)}</div>`).join('');
  // 担保条款（D7：填担保人 → 自动插入丙方担保条款）
  const guarantorClause = detail.guarantor
    ? `<div class="term guarantor"><b>丙方担保条款：</b>丙方（${esc(detail.guarantor)}）自愿为${isProcess ? '受托方' : '甲方'}在本合同项下的义务向${isProcess ? '委托方' : '乙方'}提供连带责任保证，保证期间为本合同履行期限届满之日起二年。</div>`
    : '';

  const stampState = detail.stamped_at
    ? `已盖章（${esc(detail.stamped_by_supplier)} · ${d10(detail.stamped_at)}）`
    : '（供应商门户「我要盖章」处加盖）';

  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>合同-${esc(detail.contract_no)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family:"Microsoft YaHei","PingFang SC","Songti SC",sans-serif; color:#1a1a1a; font-size:12px; }
  .head { text-align:center; border-bottom:2px solid #1E3A5F; padding-bottom:8px; }
  .company { font-size:16px; font-weight:700; color:#1E3A5F; }
  .title { font-size:20px; font-weight:700; letter-spacing:3px; margin-top:4px; }
  .sub { font-size:11px; color:#666; margin-top:2px; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:2px 16px; margin:12px 0; }
  .meta b { color:#555; font-weight:600; }
  h3 { font-size:13px; color:#1E3A5F; margin:14px 0 4px; border-left:3px solid #D17A40; padding-left:6px; }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #ccc; padding:4px 6px; }
  th { background:#f2f5f8; color:#1E3A5F; font-weight:600; }
  td.c { text-align:center; } td.r { text-align:right; }
  .totals { margin-top:10px; text-align:right; font-size:13px; }
  .totals b { color:#C04042; font-size:15px; }
  .pay { margin-top:8px; } .pay span { display:inline-block; margin-right:20px; }
  .clause, .term { margin:6px 0; line-height:1.7; }
  .term b { color:#1E3A5F; }
  .term.guarantor { background:#FBF3E2; padding:6px 8px; border-radius:4px; }
  .sign { margin-top:36px; display:flex; justify-content:space-between; gap:12px; }
  .sign > div { flex:1; }
  .stamp-hint { font-size:11px; color:#666; margin-top:4px; }
  @media screen { body { max-width:820px; margin:20px auto; } }
</style></head><body onload="window.print()">
  <div class="head">
    <div class="company">${esc(companyName)}</div>
    <div class="title">${esc(typeLabel(detail.type))}</div>
    <div class="sub">合同编号：${esc(detail.contract_no)}${detail.parent_id ? '（补料，挂原合同下）' : ''}</div>
  </div>
  ${partyBlock}

  <h3>货物明细</h3>
  <table><thead>${tableHead}</thead><tbody>${rows}</tbody></table>
  <div class="totals">合同总金额：<b>${esc(detail.currency) || ''} ${n2(detail.total_amount)}</b></div>
  ${priceIncludeBlock}

  <h3>付款条件</h3>
  <div class="pay">
    <span>定金：<b>${esc(detail.deposit_ratio ?? '—')}%</b></span>
    <span>中期款：<b>${esc(detail.mid_ratio ?? '—')}%</b></span>
    <span>尾款：<b>${esc(detail.final_ratio ?? '—')}%</b></span>
    <span>账期：发货后 <b>${detail.account_period_days != null ? esc(detail.account_period_days) : '—'}</b> 天内结算</span>
  </div>

  <h3>合同条款</h3>
  ${termBlock}
  ${guarantorClause}

  <div class="sign">
    <div>
      <div>${factoryTitle}（盖章）：＿＿＿＿＿＿＿＿</div>
      <div class="stamp-hint">${stampState}</div>
      <div class="stamp-hint">代表：${[f.contact_name].filter(Boolean).map(esc).join('') || '＿＿＿＿'}</div>
    </div>
    ${detail.guarantor ? `<div><div>丙方（签字）：＿＿＿＿＿＿＿＿</div><div class="stamp-hint">担保人：${esc(detail.guarantor)}</div></div>` : ''}
    <div>
      <div>${companyTitle}（盖章）：＿＿＿＿＿＿＿＿</div>
      <div class="stamp-hint">✓ 本司电子章随 PDF 生成自动贴入落款</div>
      <div class="stamp-hint">代表：${esc(detail.company_rep) || '＿＿＿＿'}　日期：${d10(detail.sign_date)}</div>
    </div>
  </div>
</body></html>`;

  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) throw new Error('无法打开打印窗口，请允许弹出窗口后重试');
  win.document.open();
  win.document.write(html);
  win.document.close();
}
