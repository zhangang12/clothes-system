// 从剪贴板读取 Excel 复制的表格(TSV),映射为明细行对象(设计稿:明细支持 Excel 粘贴)
export async function pasteRowsFromClipboard<T>(
  columns: Array<keyof T & string>,
): Promise<Partial<T>[]> {
  const text = await navigator.clipboard.readText();
  if (!text.trim()) throw new Error('剪贴板为空——请先在 Excel 中复制表格区域');
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const cells = line.split('\t');
      const row: any = {};
      columns.forEach((c, i) => { row[c] = (cells[i] ?? '').trim(); });
      return row as Partial<T>;
    });
}
