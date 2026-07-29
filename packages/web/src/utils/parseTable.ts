// 表格文本解析（举一反三·导入解析统一收口）：CSV/TSV/分号自适应 + 引号包裹（内含分隔符/换行）安全。
// 供 CsvImportDialog、pasteRows、报价/订单历史导入共用——此前各处自写 split(/\t|,/)，遇字段含逗号/换行即错列断行。

/** 解析表格文本为二维数组。Excel 直接粘贴是 Tab 分隔；CSV 是逗号/分号。空行剔除，单元格 trim。 */
export function parseTableText(text: string): string[][] {
  const t = text.replace(/^﻿/, ''); // 去 BOM
  const sep = t.includes('\t') ? '\t' : (!t.includes(',') && t.includes(';') ? ';' : ',');
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"' && t[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c; // 引号内：分隔符与换行都原样保留
    } else if (c === '"') {
      // 仅在字段起始的引号进入引号态（字段中间的引号当普通字符，兼容未转义的松散写法）
      if (field === '') inQ = true;
      else field += c;
    } else if (c === sep && !inQ) {
      cur.push(field); field = '';
    } else if (c === '\n' && !inQ) {
      cur.push(field); rows.push(cur); cur = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows
    .map((r) => r.map((x) => x.trim()))
    .filter((r) => r.some((x) => x !== ''));
}

/** 表头行映射：首行视作表头，按名字取值（模板列序错排也不怕） */
export function rowsByHeader<T = Record<string, string>>(
  grid: string[][],
  map: (cells: Record<string, string>) => T,
): T[] {
  if (grid.length < 1) return [];
  const headers = grid[0];
  return grid.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return map(obj);
  });
}

/** 位置映射（无表头或跳过表头）：首行若像表头（命中任一关键词）则跳过 */
export function rowsPositional<T>(grid: string[][], map: (cells: string[]) => T, headerHints: RegExp): T[] {
  if (!grid.length) return [];
  const start = grid[0].some((c) => headerHints.test(c)) ? 1 : 0;
  return grid.slice(start).map(map);
}
