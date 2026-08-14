// 把用户传上来的表格文件读成「行 × 列」的字符串网格。
//
// 2026-08-14 YSM #105：「表格下载保存不了原格式呢？所以订单也上传不了」。
// 原来模板发的是 CSV、上传框也只收 CSV，还要求「Excel 另存为 CSV UTF-8」——
// 可她在 Excel 里改完是直接按保存的，多数人会存成 .xlsx，于是下载下来的表改完传不回去。
// 现在模板发 .xlsx、这里两种都收。
//
// 逻辑单独抽出来是因为其中两条是**踩过才知道**的：中文 Windows 的 CSV 编码、
// 以及 .xls 老格式根本读不了——两者的表现都是「文件明明有内容，系统说读不出来」。

/** 轻量 CSV 解析：支持引号包裹（"帽子,大身" 不被拆开）与转义双引号（""→"），跳过全空行 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let cur = ''; let row: string[] = []; let inQ = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/**
 * 文本字节 → 字符串。
 *
 * 【为什么要试 GBK】中文 Windows 的 Excel「另存为 CSV」默认写 **GBK**，按 UTF-8 读出来
 * 款号/颜色整片是问号，界面上只会报「款号为空」这种驴唇不对马嘴的错。
 * 解码出替换字符（U+FFFD）就换 GBK 再读一遍——比让人回去改编码实在得多。
 */
export function decodeSheetText(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8;
  try { return new TextDecoder('gbk').decode(buf); } catch { return utf8; }
}

export interface SheetReader { (buf: ArrayBuffer): Promise<Array<{ rows: string[][] }>> }

/**
 * 读成网格。xlsx 走 `parseXlsx`（只取第一个工作表），csv/txt 走文本解析。
 * `readXlsx` 由调用方注入，测试时不必真去解 zip。
 */
export async function readGrid(file: File, readXlsx: SheetReader): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const sheets = await readXlsx(await file.arrayBuffer());
    const rows = sheets[0]?.rows ?? [];
    if (!rows.length) throw new Error('第一个工作表是空的——模板请放在第一个 Sheet 里');
    return rows;
  }
  // .xls 是 BIFF 二进制老格式，浏览器端解不了；直接说清楚怎么办，别让人反复试
  if (/\.xls$/i.test(file.name)) {
    throw new Error('.xls 是老格式，读不了——在 Excel 里「另存为」选 .xlsx 再上传即可');
  }
  return parseCsv(decodeSheetText(await file.arrayBuffer()));
}
