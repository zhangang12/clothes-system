// Excel 在线预览 —— 浏览器原生渲染不了 xlsx（本质是装 XML 的 zip），必须解析。
// exceljs 体积大（解包 20MB+），故一律 动态 import：不点预览就不会加载，主包不受影响。
// 只认 .xlsx；.xls 是 BIFF 二进制老格式，exceljs 读不了，调用方须降级为下载。

export interface SheetData {
  name: string;
  rows: string[][];
  truncated: boolean;
}

const MAX_ROWS = 200;   // 预览而已，超大表截断，免得把页面卡死
const MAX_COLS = 40;
// 这个上限是给「附件预览」定的（浏览器里解一个巨大的 xlsx 会把页面卡死）。
// 导入路径也复用了 parseXlsx，所以一并导出，让导入侧能提前拦并给出**贴合导入场景**的说法
// ——原来那句「请下载后查看」在导入时完全说不通（2026-08-11 EVA 反馈）。
export const MAX_SHEET_BYTES = 15 * 1024 * 1024;
const MAX_BYTES = MAX_SHEET_BYTES;

export const isXlsxName = (name?: string) => /\.xlsx$/i.test(name || '');
export const isLegacyXlsName = (name?: string) => /\.xls$/i.test(name || '');

/** 单元格取显示值：公式取缓存结果，富文本拼文本，日期按本地格式 */
function cellText(v: any): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toLocaleDateString('zh-CN');
  if (typeof v === 'object') {
    if ('text' in v && typeof v.text === 'string') return v.text;                       // 超链接
    if ('result' in v) return v.result === undefined ? '' : String(v.result);           // 公式
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join('');
    if ('error' in v) return String(v.error);
    return '';
  }
  return String(v);
}

export async function parseXlsx(buf: ArrayBuffer): Promise<SheetData[]> {
  if (buf.byteLength > MAX_BYTES) throw new Error('文件超过 15MB，请下载后查看');
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const sheets: SheetData[] = [];
  wb.eachSheet((ws) => {
    const rows: string[][] = [];
    const limit = Math.min(ws.rowCount, MAX_ROWS);
    for (let r = 1; r <= limit; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      const cols = Math.min(ws.columnCount || 0, MAX_COLS);
      for (let c = 1; c <= cols; c++) cells.push(cellText(row.getCell(c).value));
      // 整行空白不进预览
      if (cells.some((x) => x !== '')) rows.push(cells);
    }
    sheets.push({ name: ws.name, rows, truncated: ws.rowCount > MAX_ROWS });
  });
  if (!sheets.length) throw new Error('未读到任何工作表');
  return sheets;
}
