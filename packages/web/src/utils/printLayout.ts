// 打印排版方案（存本机浏览器）——2026-08-07 反馈：希望点「打印」直接进一个能自己摆页面元素的操作台。
//
// 【为什么存 localStorage 而不是入库】用户拍板「每人各自记住就行，不用全公司统一」。
// 不动数据库（免走存量库升级那套），也不会一个人改了影响所有人；
// 代价是换电脑/换浏览器要重调一次——界面上已说明。
// 日后若要改成全公司一套，把 load/save 换成读写接口即可，其余代码不用动。

export interface LayoutBlock { key: string; on: boolean }

export interface PrintLayout {
  paper: 'A4' | 'A4L';   // 竖版 / 横版
  fontSize: number;      // 正文字号(px)
  blocks: LayoutBlock[]; // 数组顺序 = 打印顺序
  metaFields: string[];  // 基本信息里印哪些字段（有序）
  matCols: string[];     // 材料明细印哪些列（有序）
  // 行高（表格单元格上下内边距，px）。2026-08-12 YSM：「打印面的行高不能调整吗？很浪费纸」
  rowPad?: number;
  // 逐列宽度覆盖（px）。「一个字一行」的根因就是列宽：内置宽度是写死的 px，
  // 列一多，固定宽度加起来超过纸宽，品名/备注这种没设宽度的列被挤到十几 px，
  // 一个汉字就占一行。给业务一个能自己调的口子，比我们猜多宽合适更可靠。
  colWidths?: Record<string, number>;
}

const KEY = 'i9.printLayout.';
/** 上一版只存了材料列的键；用户刚配过的不该白配，读方案时顺带迁移过来 */
const LEGACY_COLS_KEY = 'i9.printCols.';

const isStrArr = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * 读排版方案，并与传入的默认值合并。
 * **一律以 defaults 为骨架**：新版本加了区块/字段时，老配置里没有的项自动带上默认值，
 * 不会因为存的是旧结构就少印一块；存坏了（手改过/版本不兼容）直接整份退回默认。
 */
export function loadLayout(docKey: string, defaults: PrintLayout): PrintLayout {
  const out: PrintLayout = {
    ...defaults,
    blocks: defaults.blocks.map((b) => ({ ...b })),
    metaFields: [...defaults.metaFields],
    matCols: [...defaults.matCols],
  };
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY + docKey); } catch { return out; }

  if (!raw) {
    // 没有新键：看看有没有上一版只存列的旧键，有就迁过来
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_COLS_KEY + docKey) ?? 'null');
      if (isStrArr(legacy) && legacy.length) out.matCols = legacy;
    } catch { /* 旧键坏了就当没有 */ }
    return out;
  }

  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return out;
    if (v.paper === 'A4' || v.paper === 'A4L') out.paper = v.paper;
    if (Number.isFinite(+v.fontSize) && +v.fontSize >= 8 && +v.fontSize <= 20) out.fontSize = +v.fontSize;
    if (isStrArr(v.metaFields) && v.metaFields.length) out.metaFields = v.metaFields;
    if (isStrArr(v.matCols) && v.matCols.length) out.matCols = v.matCols;
    if (Number.isFinite(+v.rowPad) && +v.rowPad >= 0 && +v.rowPad <= 20) out.rowPad = +v.rowPad;
    if (v.colWidths && typeof v.colWidths === 'object' && !Array.isArray(v.colWidths)) {
      // 只收「数字且在合理范围」的项：存坏一项不该让整份配置作废
      const w: Record<string, number> = {};
      for (const [k, val] of Object.entries(v.colWidths)) {
        const n = Number(val);
        if (typeof k === 'string' && Number.isFinite(n) && n >= 20 && n <= 400) w[k] = Math.round(n);
      }
      if (Object.keys(w).length) out.colWidths = w;
    }
    if (Array.isArray(v.blocks)) {
      const saved = v.blocks.filter((b: any) => b && typeof b.key === 'string');
      const known = new Set(defaults.blocks.map((b) => b.key));
      // 认得的按存的顺序排在前；defaults 里有而存档里没有的（新增区块）补在后面
      const picked: LayoutBlock[] = saved
        .filter((b: { key: string; on?: unknown }) => known.has(b.key))
        .map((b: { key: string; on?: unknown }) => ({ key: b.key, on: b.on !== false }));
      const seen = new Set(picked.map((b) => b.key));
      out.blocks = [...picked, ...defaults.blocks.filter((b) => !seen.has(b.key)).map((b) => ({ ...b }))];
    }
  } catch { /* 存坏了就用默认 */ }
  return out;
}

export function saveLayout(docKey: string, layout: PrintLayout): void {
  try { localStorage.setItem(KEY + docKey, JSON.stringify(layout)); } catch { /* 隐私模式写不了就算了 */ }
}

export function resetLayout(docKey: string): void {
  try {
    localStorage.removeItem(KEY + docKey);
    localStorage.removeItem(LEGACY_COLS_KEY + docKey); // 旧键一并清掉，否则「恢复默认」后又被迁回来
  } catch { /* 同上 */ }
}
