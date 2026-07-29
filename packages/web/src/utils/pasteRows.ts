// 从剪贴板读取 Excel 复制的表格(TSV),映射为明细行对象(设计稿:明细支持 Excel 粘贴)
// 解析走 parseTableText：引号包裹的换行单元格不断行（旧实现按行 split,遇内嵌换行即错行）
import { parseTableText } from './parseTable';

export async function pasteRowsFromClipboard<T>(
  columns: Array<keyof T & string>,
): Promise<Partial<T>[]> {
  const text = await navigator.clipboard.readText();
  if (!text.trim()) throw new Error('剪贴板为空——请先在 Excel 中复制表格区域');
  return parseTableText(text).map((cells) => {
    const row: any = {};
    columns.forEach((c, i) => { row[c] = (cells[i] ?? '').trim(); });
    return row as Partial<T>;
  });
}
