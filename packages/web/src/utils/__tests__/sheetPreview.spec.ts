import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseXlsx, isXlsxName, isLegacyXlsName } from '../sheetPreview';

// 造一个真 xlsx（含公式/日期/富文本/空行/多表），再解析回来
async function makeXlsx(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('数量搭配');
  ws.addRow(['PO#', '洗标号', '颜色', '数量']);
  ws.addRow(['6800164753', '15617939', '黑色19-4008', 1405]);
  ws.addRow([]);                                   // 空行：不应进预览
  ws.addRow(['6800164754', '16222610', '咖色17-1312', 974]);
  const f = ws.getRow(5);
  f.getCell(1).value = '合计';
  f.getCell(4).value = { formula: 'SUM(D2:D4)', result: 2379 } as any;
  f.commit();
  wb.addWorksheet('第二表').addRow(['另一张表']);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('Excel 在线预览解析', () => {
  it('文件名判型：只认 .xlsx，.xls 老格式单独识别', () => {
    expect(isXlsxName('大货尺寸表.xlsx')).toBe(true);
    expect(isXlsxName('a.XLSX')).toBe(true);
    expect(isXlsxName('旧表.xls')).toBe(false);
    expect(isLegacyXlsName('旧表.xls')).toBe(true);
    expect(isXlsxName('图.png')).toBe(false);
  });

  it('解析出多张表，空行被跳过，公式取缓存结果', async () => {
    const sheets = await parseXlsx(await makeXlsx());
    expect(sheets.map((s) => s.name)).toEqual(['数量搭配', '第二表']);

    const first = sheets[0];
    expect(first.rows[0]).toEqual(['PO#', '洗标号', '颜色', '数量']);
    expect(first.rows[1]).toEqual(['6800164753', '15617939', '黑色19-4008', '1405']);
    // 第 3 行是空行 → 被跳过，下一行直接是第二个 PO
    expect(first.rows[2][0]).toBe('6800164754');
    // 公式单元格取的是缓存结果 2379，而不是 "SUM(D2:D4)"
    expect(first.rows[3]).toContain('2379');
    expect(first.truncated).toBe(false);
  });

  it('超大文件直接拒绝，让调用方降级下载', async () => {
    await expect(parseXlsx(new ArrayBuffer(16 * 1024 * 1024))).rejects.toThrow(/15MB/);
  });

  it('不是 xlsx 的字节流会抛错（调用方据此降级下载）', async () => {
    await expect(parseXlsx(new TextEncoder().encode('我不是表格').buffer as ArrayBuffer)).rejects.toThrow();
  });
});
