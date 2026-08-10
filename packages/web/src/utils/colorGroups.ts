// 色组拆分 —— 导出/打印时把「颜色」一列摊成「颜色一/颜色二/…」多列。
//
// 【为什么这么拆】(2026-08-10 Grace 反馈，附了工厂真实工艺单)
// 工厂要看的是「每个色组下，这条辅料用什么颜色」，一眼横着对。我们此前把所有色组
// 用逗号并进一格（"粉色，砖红"），工厂得自己数第几个逗号对应第几个色，很容易错。
//
// 【口径与编辑页保持一致】样衣编辑页的色组列本来就是按 [，,] 从 colors 还原的
// （SampleEditView 的 splitColors），落库只有 colors 这一个逗号串字段。
// 所以这里沿用同一套拆法——**不是新发明的口径，是跟已有行为对齐**。
// 已知代价：单个色组内部若自带逗号，会被拆成两列（与编辑页表现一致）。
// 真要根治得把色组结构化落库（sample_material 加 color_groups），那是另一件事。

const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 逗号串 → 色组数组；空值给空数组 */
export function splitColorGroups(colors: unknown): string[] {
  return String(colors ?? '')
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 一批材料里最多有几个色组（决定要摊开成几列） */
export function maxColorGroups(materials: any[]): number {
  return (materials ?? []).reduce((n, m) => Math.max(n, splitColorGroups(m?.colors).length), 0);
}

/** 第 i 个色组的列名：颜色一 / 颜色二 …；超过十个退回数字 */
export const colorGroupLabel = (i: number): string => `颜色${CN[i] ?? String(i + 1)}`;
