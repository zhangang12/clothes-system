// 材料电子表格导入（用户反馈：样衣材料管理需要可以上传电子表格）
// 兼容工厂自有工艺单格式：不定列序、带表头/分区行——靠「列映射」而不是固定模板。
// .xlsx 走 exceljs（动态 import，复用 sheetPreview 的解析）；.csv 按文本（逗号/制表符/分号）。
import { parseXlsx } from './sheetPreview';

export interface SheetField { key: string; label: string; keywords: RegExp; required?: boolean }

// 样衣材料可映射的字段（其余字段导入后人工补）
export const MATERIAL_FIELDS: SheetField[] = [
  { key: 'itemName', label: '品名', keywords: /品名|材料|名称|面料|辅料|面里料|item/i, required: true },
  { key: 'qty', label: '单耗/数量', keywords: /单耗|数量|用量|耗用|qty/i },
  { key: 'part', label: '部位/位置', keywords: /位置|部位|part/i },
  { key: 'colors', label: '颜色', keywords: /颜色|color/i },
  { key: 'remark', label: '备注', keywords: /备注|说明|remark/i },
];

/** 解析上传文件为行数组（整行空白已剔除） */
export async function parseSheetFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const buf = await file.arrayBuffer();
    const sheets = await parseXlsx(buf);
    return sheets[0]?.rows ?? [];
  }
  if (/\.(csv|txt)$/i.test(file.name)) {
    const text = await readText(file);
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '')
      .map(splitCsvLine);
  }
  throw new Error('仅支持 .xlsx / .csv 文件');
}

// CSV 行切分：尊重引号包裹（"帽子,大身" 不被拆开）、转义双引号（""→"）；制表符/分号/逗号自适应
function splitCsvLine(line: string): string[] {
  const sep = line.includes('\t') ? '\t' : (!line.includes(',') && line.includes(';') ? ';' : ',');
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// FileReader 读文本（比 file.text() 兼容面更广）
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/** 首行疑似表头（任一单元格命中字段关键词）→ 自动推断列映射 */
export function guessMapping(rows: string[][]): { mapping: Record<string, number>; hasHeader: boolean } {
  const mapping: Record<string, number> = {};
  const header = rows[0] ?? [];
  let hits = 0;
  for (const f of MATERIAL_FIELDS) {
    const idx = header.findIndex((cell) => f.keywords.test(String(cell ?? '')));
    if (idx >= 0 && mapping[f.key] === undefined) { mapping[f.key] = idx; hits++; }
  }
  return { mapping, hasHeader: hits > 0 };
}

/** 原始行 → 材料行（按列映射；品名为空的行跳过——分区标题/空行自然滤掉） */
export function rowsToMaterials(rows: string[][], mapping: Record<string, number>): any[] {
  const cell = (r: string[], key: string) => (mapping[key] != null ? String(r[mapping[key]] ?? '').trim() : '');
  return rows
    .map((r) => ({
      itemName: cell(r, 'itemName'),
      qty: cell(r, 'qty'),
      part: cell(r, 'part'),
      colors: cell(r, 'colors'),
      remark: cell(r, 'remark'),
    }))
    .filter((m) => m.itemName);
}
