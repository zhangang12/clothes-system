// 明细行的复制 / 插入（2026-08-13 YSM #97、#99、#100）。
//
// 【她实际在干什么】一张材料合同里，同一条拉链要按「颜色 × 尺码」摊成十几二十行，
// 除了颜色和尺码，品名/规格/拉头/拉齿/码带全是一样的。系统里没有复制，她只能在
// 每一格手打「同上」两个字（反馈截图里整屏都是"同上"）——既慢，又让合同上真出现"同上"这种
// 供应商看不懂的内容。
//
// 逻辑单独放这里而不是留在页面里：插入方向、副本插在哪、多行复制的下标处理，
// 这三件事都容易在后续改动中被"顺手改简单"，值得有测试钉住。

/** 复制第 idx 行，副本紧跟其后。返回是否改动了数组。 */
export function duplicateAt<T>(list: T[], idx: number): boolean {
  if (!Array.isArray(list) || idx < 0 || idx >= list.length) return false;
  list.splice(idx + 1, 0, { ...(list[idx] as any) });
  return true;
}

/**
 * 在第 idx 行**上面**插入一行。
 * 往上插不是随手定的：用户是指着第一行说"这边漏一行"，往下插的话第一行之前那个位置永远补不上；
 * 而"补在最后"本来就有「添加行」。
 */
export function insertAbove<T>(list: T[], idx: number, factory: () => T): boolean {
  if (!Array.isArray(list) || idx < 0 || idx > list.length) return false;
  list.splice(idx, 0, factory());
  return true;
}

/**
 * 复制所有勾选行，每行的副本紧跟它自己之后。返回复制了几行。
 * 【必须从后往前插】先插前面的会把后面那些行的下标整体顶偏，副本就会落到别人身边去。
 */
export function duplicateSelected<T>(list: T[], selected: readonly T[]): number {
  if (!Array.isArray(list) || !selected?.length) return 0;
  const idxs = list.reduce<number[]>((acc, row, i) => (selected.includes(row) ? [...acc, i] : acc), []);
  for (let k = idxs.length - 1; k >= 0; k--) list.splice(idxs[k] + 1, 0, { ...(list[idxs[k]] as any) });
  return idxs.length;
}
