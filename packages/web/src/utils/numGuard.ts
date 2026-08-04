// 表格数值列的统一守卫（2026-08-04 反馈 #08 及其举一反三）。
//
// 【为什么需要它】材料/明细/费用这类子表的数值列在页面上都是自由文本输入框，
// 用户完全可能填「若干」「2条」「约1.5米」「-」。此前各页面各写一份
//   const num = (v) => (v === '' || v == null ? undefined : Number(v))
// 于是同一类输入分裂成两种坏结局：
//   ① 送到带 @IsNumber 的字段 → 后端 400，把 `materials.16.qty must be a number
//      conforming to the specified constraints` 原样甩给用户（看不懂，也不知道是第几行）；
//   ② 送到没校验的字段 → NaN，而 `JSON.stringify(NaN) === 'null'`，
//      **静默存成 NULL**：不报错、界面无提示，用户以为存进去了，订单采购量直接算成 0。
//
// 正确做法是在提交前就地拦下，并告诉用户「第几行、哪一列、填的是什么」。

/** '' / null / undefined → undefined（字段不发，后端 @IsOptional 放行）；NaN 同样不外发。
 *  注意别写成 `Number(v) || undefined`——那会把合法的 0 一起吞掉。 */
export function num(v: any): number | undefined {
  if (v === '' || v == null) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

/** 一列的定义：字段名 + 给用户看的列名 */
export type NumCol = [key: string, label: string];

/**
 * 逐行检查数值列，返回第一条人话报错；全部合法返回 null。
 * @param rows    子表行（调用方先按"有效行"过滤，行号才对得上用户看到的表格）
 * @param cols    要检查的列
 * @param tableName 表名，用于拼「材料明细第 3 行」这样的定位
 */
export function checkNumericCells(rows: any[], cols: NumCol[], tableName: string): string | null {
  for (let i = 0; i < rows.length; i++) {
    for (const [key, label] of cols) {
      const raw = rows[i]?.[key];
      if (raw === '' || raw == null) continue;      // 留空是允许的，交给后端默认值
      if (Number.isNaN(Number(raw))) {
        return `${tableName}第 ${i + 1} 行「${label}」填的是「${raw}」，这一列只能填数字`;
      }
    }
  }
  return null;
}
