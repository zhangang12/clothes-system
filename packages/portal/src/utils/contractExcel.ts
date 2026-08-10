// 门户·合同导出 Excel（2026-08-04 反馈 #52：供应商希望能把合同存成文件留档）
//
// 【为什么不复用 PC 端那份】packages/web 的 contractExcel 走 docExcel 公共层，且业务口径是
// 「全量导出、不脱敏」——那是给内部用的。门户是**供应商**在看，必须按白名单出字段。
// 详情接口 `GET /portal/contracts/:id` 目前是把整个 Contract 实体展开返回的，里面混着
// guarantor_id_photo（担保人身份证）、snapshot_json（盖章快照全量）、审批状态、created_by 等
// 内部字段——导出时若图省事写个 Object.entries 全量落表，就等于把这些一次性交给供应商。
// 所以本文件**逐字段显式声明**，新增字段必须有人主动加进来，默认不外泄。
//
// 【为什么不引 exceljs】门户是移动端包，exceljs 单块就近 1MB（PC 端实测 938kB）。
// 这里沿用 PC 端 docExcel 已验证的零依赖做法：生成 Excel 能直接打开的 HTML 工作表存 .xls，
// 并收掉那三个坑（见下方常量注释）。portal 的 package.json 一个依赖都不用加。

const BOM = String.fromCharCode(0xfeff);

const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const d10 = (v: unknown): string => (v ? String(v).slice(0, 10) : '');

const blank = (v: unknown): boolean => v === null || v === undefined || v === '';

// 空值必须先挡：Number(null)/Number('') 都是 0，不挡的话「未填」会导出成 0.00，
// 业务读起来是「金额为零」，含义完全不同。
const n2 = (v: unknown): string => {
  if (blank(v)) return '';
  const x = Number(v);
  return Number.isFinite(x) ? x.toFixed(2) : '';
};
const n4 = (v: unknown): string => {
  if (blank(v)) return '';
  const x = Number(v);
  return Number.isFinite(x) ? x.toFixed(4) : '';
};

const typeLabel = (t: string): string =>
  ({ MATERIAL: '材料合同', PROCESS: '加工合同', SUPPLEMENT: '补料合同' } as Record<string, string>)[t] ?? t;
const portalLabel = (s: string): string =>
  ({ DRAFT: '草稿', PUSHED: '待盖章', STAMPED: '待发货', SHIPPING: '出货中', RECONCILED: '待开票', COMPLETED: '已完成' } as Record<string, string>)[s] ?? s;
const reconLabel = (s: string): string =>
  ({ DRAFT: '草稿', PENDING: '业务复核中', CONFIRMED: '已确认', PAID: '已付款' } as Record<string, string>)[s] ?? s;

/** 一律强制文本格式：款号形如 I27.230.03929，不加这个会被 Excel 当数字截断成 27.23 */
const TD = 'style="mso-number-format:\\@"';


/** 人民币金额转中文大写（真实合同的「总价」行要印大写，凭证类文件的惯例） */
export function rmbUpper(v: unknown): string {
  // 空值一律空串：合同上「未填」和「零元」含义完全不同，不能把没填的印成零
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return '零元整';
  const D = '零壹贰叁肆伍陆柒捌玖';
  const U = ['', '拾', '佰', '仟'];
  const G = ['', '万', '亿', '万亿'];
  const [intPart, decPart] = n.toFixed(2).split('.');

  // 四位一组；组内按权位读，组间按「本组最高位是否为 0」补读一个「零」——
  // 少了这一步 10001 会读成「壹万壹元」（漏掉中间的零），是大写金额最典型的错法
  const groups: string[] = [];
  for (let i = intPart.length; i > 0; i -= 4) groups.unshift(intPart.slice(Math.max(0, i - 4), i));
  let out = '';
  groups.forEach((g, gi) => {
    let seg = '';
    let zero = false;
    for (let i = 0; i < g.length; i++) {
      const d = +g[i];
      if (d === 0) { zero = true; continue; }
      if (zero && seg) seg += D[0];
      zero = false;
      seg += D[d] + U[g.length - 1 - i];
    }
    if (!seg) return;                       // 整组为零：跳过，由下一组的首位零补读
    if (out && g[0] === '0') out += D[0];
    out += seg + G[groups.length - 1 - gi];
  });

  out = (out || D[0]) + '元';
  const jiao = +decPart[0];
  const fen = +decPart[1];
  if (!jiao && !fen) return out + '整';
  out += jiao ? D[jiao] + '角' : D[0];
  if (fen) out += D[fen] + '分';
  return out;
}

/** 同值连续行合并：真实合同里「款号」「交货期限」整列只写一次，品名跨其配色行合并 */
function spans(values: string[]): number[] {
  const out = new Array(values.length).fill(0);
  let i = 0;
  while (i < values.length) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[i]) j++;
    out[i] = j - i + 1;
    i = j + 1;
  }
  return out;
}

function kvRows(pairs: Array<[string, string]>): string {
  return pairs
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `<tr><th ${TD}>${esc(k)}</th><td ${TD}>${esc(v)}</td></tr>`)
    .join('');
}

function tableBlock(title: string, heads: string[], rows: string[][]): string {
  if (!rows.length) return '';
  const th = heads.map((h) => `<th ${TD}>${esc(h)}</th>`).join('');
  const tb = rows
    .map((r) => `<tr>${r.map((c) => `<td ${TD}>${esc(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<tr><td colspan="${heads.length}"><b>${esc(title)}</b></td></tr>
    <tr>${th}</tr>${tb}`;
}

/**
 * 导出门户合同为 .xls。detail 即详情接口返回值（含 materials / shipments / reconciliations / factory / company）。
 * 只取供应商本就能在页面上看到的字段——「屏幕上没有的，文件里也不该有」。
 */
export function exportPortalContractExcel(detail: any): void {
  const cur = String(detail?.currency ?? '').trim();
  const money = (v: unknown) => (blank(v) ? '' : `${cur} ${n2(v)}`.trim());

  const base = kvRows([
    ['合同编号', esc(detail.contract_no)],
    ['合同类型', typeLabel(detail.type)],
    ['当前状态', portalLabel(detail.portal_status)],
    ['合同金额', money(detail.total_amount)],
    ['定金比例', blank(detail.deposit_ratio) ? '' : `${detail.deposit_ratio}%`],
    ['中期款比例', blank(detail.mid_ratio) ? '' : `${detail.mid_ratio}%`],
    ['尾款比例', blank(detail.final_ratio) ? '' : `${detail.final_ratio}%`],
    ['账期', blank(detail.account_period_days) ? '' : `发货后 ${detail.account_period_days} 天内结算`],
    ['签约日期', d10(detail.sign_date)],
    ['最后发货日', d10(detail.last_ship_date)],
    ['发货地址', String(detail.ship_to_address ?? '')],
    ['备注', String(detail.remark ?? '')],
    // 甲乙方：只出名称/地址/联系人，不出任何证件与内部标识
    ['供方（本厂）', String(detail.factory?.name ?? '')],
    ['供方地址', String(detail.factory?.address ?? '')],
    ['供方联系人', [detail.factory?.contact_name, detail.factory?.contact_phone].filter(Boolean).join(' ')],
    ['需方', String(detail.company?.name ?? '')],
    ['需方地址', String(detail.company?.address ?? '')],
    ['盖章方式', detail.stamp_mode === 'PAPER' ? '纸质盖章照片' : (detail.stamp_mode ? '电子章' : '')],
    ['盖章时间', d10(detail.stamped_at)],
  ]);

  // ── 第一条 货物：按真实采购合同版式（2026-08-08 用户给了实物合同截图）────────────
  // 与通用「一行一格」表格的差别：①品名跨其配色行合并 ②款号/交货期限整列只写一次
  // ③末尾「总价」行附中文大写。拉头/拉齿/码带是这次专门从样衣一路带下来的三列。
  const mats: any[] = detail.materials ?? [];
  const nameSpan = spans(mats.map((m) => String(m.item_name ?? '')));
  const styleSpan = spans(mats.map((m) => String(m.style_no ?? '')));
  const dueSpan = spans(mats.map((m) => d10(m.delivery_date)));
  const goodsHead = ['品名', '拉头', '拉齿', '码带', '颜色', '尺码', '单位',
    '数量', `单价(${cur || '元'})`, `小计(${cur || '元'})`, '款号', '交货期限'];
  const goodsRows = mats.map((m: any, i: number) => {
    const cells: string[] = [];
    // rowspan 只写在区块首行，其余行整格省略（省略而不是留空格，才是合并效果）
    if (nameSpan[i]) cells.push(`<td ${TD} rowspan="${nameSpan[i]}">${esc(m.item_name ?? '')}</td>`);
    cells.push(
      `<td ${TD}>${esc(m.puller ?? '')}</td>`,
      `<td ${TD}>${esc(m.zipper_teeth ?? '')}</td>`,
      `<td ${TD}>${esc(m.code_band ?? '')}</td>`,
      `<td ${TD}>${esc(m.color ?? '')}</td>`,
      `<td ${TD}>${esc(m.size ?? '')}</td>`,
      `<td ${TD}>${esc(m.unit ?? '')}</td>`,
      `<td ${TD}>${esc(m.qty ?? '')}</td>`,
      `<td ${TD}>${esc(n4(m.unit_price))}</td>`,
      `<td ${TD}>${esc(n2(m.amount))}</td>`,
    );
    if (styleSpan[i]) cells.push(`<td ${TD} rowspan="${styleSpan[i]}">${esc(m.style_no ?? '')}</td>`);
    if (dueSpan[i]) cells.push(`<td ${TD} rowspan="${dueSpan[i]}">${esc(d10(m.delivery_date))}</td>`);
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
  // 只有真出现过金额才印总价：全表金额都没填时印「0.00」会被读成「货款为零」，
  // 与「未填」是两回事（门户导出早有一条用例钉这个语义，别踩回去）
  const hasAmount = mats.some((m) => Number.isFinite(Number(m.amount)) && m.amount !== null && m.amount !== '');
  const total = mats.reduce((sm, m) => sm + (Number(m.amount) || 0), 0);
  const totalRow = mats.length && hasAmount
    ? `<tr><th ${TD} colspan="9">总价</th><td ${TD} colspan="3">${esc(n2(total))}　${esc(rmbUpper(total))}</td></tr>`
    : '';
  const materials = mats.length
    ? `<tr><td colspan="${goodsHead.length}"><b>第一条　货物</b></td></tr>
    <tr>${goodsHead.map((h) => `<th ${TD}>${esc(h)}</th>`).join('')}</tr>${goodsRows}${totalRow}`
    : '';

  const shipments = tableBlock(
    '发货批次',
    ['批次', '发货单号', '数量', '快递公司', '快递单号', '发货日期', `金额(${cur || '—'})`, '状态'],
    (detail.shipments ?? []).map((s: any, i: number) => [
      String(i + 1), String(s.ship_no ?? ''), String(s.qty ?? ''),
      String(s.express_company ?? ''), String(s.express_no ?? ''), d10(s.ship_date),
      n2(s.amount), s.reconcile_id ? '已对账' : (s.approval_status === 'APPROVED' ? '已审批' : '待审批'),
    ]),
  );

  const recons = tableBlock(
    '对账单',
    ['对账单号', `金额(${cur || '—'})`, '发票号', '状态'],
    (detail.reconciliations ?? []).map((r: any) => [
      String(r.reconcile_no ?? ''), n2(r.total_amount), String(r.invoice_no ?? ''), reconLabel(r.status),
    ]),
  );

  // ── 数量搭配（色/码/PO 矩阵）────────────────────────────────────────
  // 供应商 s136 反馈：真实合同末尾有这张表，加工厂要照着它按色按码投产。
  // 数据是详情接口本就返回的 orderDetail.size_matrix（门户详情页已在用同一份），
  // 不必新增接口。行=款·色·码，列=各 PO，末列合计。
  const mx = detail.orderDetail?.size_matrix ?? null;
  const mxPos: any[] = mx?.pos ?? [];
  const mxRows: any[] = mx?.rows ?? [];
  const rowTotal = (r: any) => (r?.qtys ?? []).reduce((sm: number, v: any) => sm + (Number(v) || 0), 0);
  const matrix = mxRows.length
    ? tableBlock(
      '数量搭配（款/色/码 × PO）',
      ['款号', '颜色', '洗标号', '尺码', ...mxPos.map((p: any, i: number) => String(p?.po_no || `PO${i + 1}`)), '合计'],
      mxRows.map((r: any) => [
        String(r?.style_no ?? ''), String(r?.color ?? ''), String(r?.article ?? ''), String(r?.size ?? ''),
        ...mxPos.map((_p: any, i: number) => String(r?.qtys?.[i] ?? '')),
        String(rowTotal(r) || ''),
      ]),
    )
    : '';

  const sheetName = `合同${String(detail.contract_no ?? '')}`.slice(0, 31); // Excel 工作表名上限 31 字符
  const html = `${BOM}<html xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${esc(sheetName)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body><table border="1">
${base}
<tr><td></td></tr>
${materials}
${matrix ? `<tr><td></td></tr>${matrix}` : ''}
${shipments ? `<tr><td></td></tr>${shipments}` : ''}
${recons ? `<tr><td></td></tr>${recons}` : ''}
</table></body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${detail.contract_no || '合同'}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 立刻 revoke 在部分移动浏览器上会让下载拿不到数据，延后释放
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
