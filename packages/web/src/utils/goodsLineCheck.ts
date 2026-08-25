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
