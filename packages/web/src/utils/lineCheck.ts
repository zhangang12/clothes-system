// 货物明细的行级校验（2026-08-25 YSM #111：合同保存不了，报「品名必填、数量须大于 0」，
// 可她截图里第一行明明填着「门襟拉链 / 105」——她的原话是「这咋处理的呢」）。
//
// 【原来错在哪】校验用 `find()` 找出任意一条不合格的行，然后抛一句**不带行号**的通用提示。
// 明细动辄二三十行、还要横向滚动，人根本不知道该去改哪一格。
//
// 【为什么空行要单独说】「插入」「复制选中」「从订单带入」都会留下整行空白，
// 这类行不是"填错了"，而是"多出来的"——正确处理是删掉，不是去补品名。
// 提示里说清楚是哪一行、以及是补内容还是删行，才算真的回答了她的问题。

export interface GoodsLine {
  item_name?: string;
  qty?: unknown;
  [k: string]: unknown;
}

/** 除了品名与数量之外，还有没有填过别的东西——用来区分「空行」与「填了一半」 */
const OTHER_FIELDS = ['spec', 'color', 'size', 'style_no', 'unit', 'unit_price', 'puller', 'zipper_teeth', 'code_band'];

const isBlank = (v: unknown): boolean => v === undefined || v === null || String(v).trim() === '';

/** 整行都没填过东西 = 多出来的空行 */
export function isEmptyLine(m: GoodsLine): boolean {
  if (!isBlank(m.item_name) || !isBlank(m.qty)) return false;
  return OTHER_FIELDS.every((f) => isBlank(m[f]));
}

/**
 * 返回一句能直接照做的中文提示；全部合格时返回 null。
 * 最多点名 3 行——列全了反而看不过来，先改这几行再存即可。
 */
export function checkGoodsLines(rows: GoodsLine[]): string | null {
  if (!rows?.length) return '货物明细至少 1 行';

  const empties: number[] = [];
  const bads: string[] = [];
  rows.forEach((m, i) => {
    const no = i + 1;
    if (isEmptyLine(m)) { empties.push(no); return; }
    if (isBlank(m.item_name)) { bads.push(`第 ${no} 行没填品名`); return; }
    if (!(Number(m.qty) > 0)) {
      bads.push(isBlank(m.qty) ? `第 ${no} 行没填数量` : `第 ${no} 行数量「${String(m.qty).trim()}」须大于 0`);
    }
  });

  const parts: string[] = [];
  if (empties.length) {
    const list = empties.slice(0, 3).join('、');
    parts.push(`第 ${list} 行${empties.length > 3 ? ` 等 ${empties.length} 行` : ''}是空行，勾选后点「— 删除」`);
  }
  if (bads.length) parts.push(bads.slice(0, 3).join('；') + (bads.length > 3 ? ` 等 ${bads.length} 处` : ''));
  return parts.length ? `货物明细：${parts.join('；')}` : null;
}

/**
 * 「填了一半」的行号（1 起）：名称列空着，可别的列填了东西。
 *
 * 【为什么必须单独揪出来】报价与样衣保存时都是
 * `form.items.filter((i) => i.itemName)` —— 没填品名的行**被静默丢弃**，
 * 页面提示"保存成功"，那一行却没了，而且只有当**所有行**都没品名时才会报错。
 * 空行被丢掉是对的（表单会自动补一行占位），但「填了数量/颜色/单价、只漏了品名」
 * 显然是人还没填完，不该悄悄扔掉。
 *
 * @param nameField  名称列（品名）
 * @param valueFields 用来判断"人是不是填过东西"的列——**别把有默认值的列放进来**
 *                    （如报价的 lossRate 自带统一损耗%，放进来会把空行也判成填了一半）
 */
export function halfFilledRows(
  rows: Array<Record<string, unknown>>,
  nameField: string,
  valueFields: string[],
): number[] {
  const out: number[] = [];
  (rows ?? []).forEach((r, i) => {
    if (!isBlank(r?.[nameField])) return;                 // 品名填了，不在此列
    const touched = valueFields.some((f) => {
      const v = r?.[f];
      if (Array.isArray(v)) return v.length > 0;          // 色组这类数组：空数组才算没填
      return !isBlank(v);
    });
    if (touched) out.push(i + 1);
  });
  return out;
}

/** 把行号列成一句能照做的话；没有则返回 null */
export function halfFilledMessage(label: string, rows: number[]): string | null {
  if (!rows.length) return null;
  const head = rows.slice(0, 3).join('、');
  const more = rows.length > 3 ? ` 等 ${rows.length} 行` : '';
  return `${label}第 ${head} 行${more}填了内容但没填品名——补上品名，或勾选该行删除（不填品名保存会丢掉这几行）`;
}

/**
 * 「会被保存时的 filter 丢掉、但人明明填了东西」的行号（1 起）。
 *
 * 【为什么再抽一层】`halfFilledRows` 只认「一个名称列为空」这一种形态，
 * 可实际丢行的判据五花八门：客户联系人要「姓名/手机/电话 至少一个」、
 * 银行要「银行名/账号/户名 至少一个」、出口发票要「金额 > 0」。
 * 判据不同，但后果都一样——**填了一半的行在保存时被静默扔掉，页面还提示成功**。
 * 一周内已在合同货物明细、报价明细、样衣材料上各踩一次，所以这里按「保留条件」抽象。
 *
 * @param keptWhen     保存时会保留这一行的判据（与 buildDto 里的 filter 用同一份口径）
 * @param touchedFields 用来判断"人是不是填过东西"的列；**别放有默认值的列**
 */
export function droppedButFilledRows<T extends Record<string, unknown>>(
  rows: T[],
  keptWhen: (r: T) => boolean,
  touchedFields: string[],
): number[] {
  const out: number[] = [];
  (rows ?? []).forEach((r, i) => {
    if (!r || keptWhen(r)) return;                       // 会被保留，不用管
    const touched = touchedFields.some((f) => {
      const v = r[f];
      if (Array.isArray(v)) return v.length > 0;
      return !isBlank(v);
    });
    if (touched) out.push(i + 1);
  });
  return out;
}

/** 与 halfFilledMessage 同风格，但把"缺什么才留得住"说出来 */
export function droppedMessage(label: string, rows: number[], needHint: string): string | null {
  if (!rows.length) return null;
  const head = rows.slice(0, 3).join('、');
  const more = rows.length > 3 ? ` 等 ${rows.length} 行` : '';
  return `${label}第 ${head} 行${more}填了内容，但${needHint}——补上或删掉该行，否则保存时这几行会被丢掉`;
}
