// 打印列偏好（存本机浏览器）——2026-08-07 反馈：希望能自己调打印的列与顺序。
//
// 【为什么存 localStorage 而不是入库】用户拍板「每人各自记住就行，不用全公司统一」。
// 好处是不动数据库（不必走存量库升级那套），也不会一个人改了影响所有人；
// 代价是换电脑/换浏览器要重调一次——已在界面上说明。
// 日后若要改成全公司一套，把 load/save 换成读写接口即可，调用方不用动。

const PREFIX = 'i9.printCols.';

/** 读某个单据的打印列偏好；没配过/存坏了都返回 null，由调用方退回默认列 */
export function loadPrintCols(docKey: string): string[] | null {
  try {
    const raw = localStorage.getItem(PREFIX + docKey);
    if (!raw) return null;
    const v = JSON.parse(raw);
    // 存坏了（手改过、版本不兼容）就当没配过，绝不让它把打印搞崩
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return null;
    return v.length ? v : null;
  } catch { return null; }
}

export function savePrintCols(docKey: string, keys: string[]): void {
  try { localStorage.setItem(PREFIX + docKey, JSON.stringify(keys)); } catch { /* 隐私模式写不了就算了 */ }
}

export function resetPrintCols(docKey: string): void {
  try { localStorage.removeItem(PREFIX + docKey); } catch { /* 同上 */ }
}
