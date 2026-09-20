// 列表全量导出(基础资料稿:当前筛选下全量、所有列)——逐页拉取后合成 CSV(Excel 可直接打开)
import { ElMessage } from 'element-plus';

/** 安全上限 100 页 × 100 条 = 1 万条，防误操作拖库 */
export const EXPORT_ALL_MAX_PAGES = 100;

/**
 * CSV 单元格转义。除了双引号，还要防 **公式注入**（B143）：Excel 打开 CSV 时把以 = + - @
 * 开头的格子当公式算——「+86-138…」变成负数、「-待定」变 #NAME?，带 =HYPERLINK/DDE 的更危险。
 * 这类值前面补一个单引号，Excel 就按文本显示（OWASP 推荐做法；纯数字如 -5 / +3.2 不动）。
 */
export function csvCell(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function exportAll(
  fetchPage: (page: number, size: number) => Promise<{ data: any[]; total: number }>,
  columns: Array<{ key: string; title: string; format?: (row: any) => string }>,
  filename: string,
): Promise<number> {
  const size = 100;
  let page = 1;
  const rows: any[] = [];
  let total = 0;
  for (; page <= EXPORT_ALL_MAX_PAGES; page++) {
    const res: any = await fetchPage(page, size);
    const items = res.data ?? [];
    rows.push(...items);
    total = res.total ?? rows.length;
    if (rows.length >= total || items.length < size) break;
  }
  // 封顶被截断时必须说出来：调用方紧接着会提示「已导出全部 N 条」，不说的话财务拿到的是少了一截却自称全量的文件
  if (rows.length < total) {
    ElMessage.warning(`记录超过 ${EXPORT_ALL_MAX_PAGES * size} 条，只导出了前 ${rows.length} 条——请缩小筛选范围后分次导出`);
  }
  const head = columns.map((c) => csvCell(c.title)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(c.format ? c.format(r) : r[c.key])).join(','));
  const csv = '﻿' + [head, ...body].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
  return rows.length;
}
