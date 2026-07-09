// 列表全量导出(基础资料稿:当前筛选下全量、所有列)——逐页拉取后合成 CSV(Excel 可直接打开)
export async function exportAll(
  fetchPage: (page: number, size: number) => Promise<{ data: any[]; total: number }>,
  columns: Array<{ key: string; title: string; format?: (row: any) => string }>,
  filename: string,
): Promise<number> {
  const size = 100;
  let page = 1;
  const rows: any[] = [];
  // 安全上限 100 页(1 万条),防误操作拖库
  for (; page <= 100; page++) {
    const res: any = await fetchPage(page, size);
    const items = res.data ?? [];
    rows.push(...items);
    const total = res.total ?? rows.length;
    if (rows.length >= total || items.length < size) break;
  }
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = columns.map((c) => esc(c.title)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(c.format ? c.format(r) : r[c.key])).join(','));
  const csv = '﻿' + [head, ...body].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
  return rows.length;
}
