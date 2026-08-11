// 材料电子表格导入（用户反馈：样衣材料管理需要可以上传电子表格）
// 兼容工厂自有工艺单格式：不定列序、带表头/分区行——靠「列映射」而不是固定模板。
// .xlsx 走 exceljs（动态 import，复用 sheetPreview 的解析）；.csv 按文本（逗号/制表符/分号）。
import { parseXlsx, MAX_SHEET_BYTES } from './sheetPreview';

export interface SheetField { key: string; label: string; keywords: RegExp; required?: boolean }

// 样衣材料可映射的字段（其余字段导入后人工补）
export const MATERIAL_FIELDS: SheetField[] = [
  { key: 'itemName', label: '品名', keywords: /品名|材料|名称|面料|辅料|面里料|item/i, required: true },
  { key: 'arrangeDate', label: '安排日期', keywords: /安排日期|日期|date/i },
  { key: 'width', label: '门幅', keywords: /门幅|幅宽|宽度|width/i },
  // 关键词必须含「色组」：本系统自己的 UI 全都管它叫色组——材料表列头是「颜色（色组）」、
  // 按钮是「＋色组」、导入预览的列就叫「色组1」「色组2」。用户照着系统的叫法把工艺单列
  // 命名为「色组一/色组二」，此前却一个都匹配不上（旧关键词只有 /颜色|color/），
  // 于是「一个款号打两组色」永远只能导进一组（2026-08-06 Nina 反馈）。
  { key: 'colors', label: '颜色', keywords: /颜色|色组|配色|color/i },
  { key: 'part', label: '部位/位置', keywords: /位置|部位|part/i },
  { key: 'composition', label: '成份', keywords: /成份|成分|composition/i },
  { key: 'codeBand', label: '码带', keywords: /码带|织带/i },
  { key: 'zipperLength', label: '拉链长度', keywords: /拉链长度|拉链长/i },
  { key: 'puller', label: '拉头', keywords: /拉头/i },
  { key: 'qty', label: '单耗/数量', keywords: /单耗|数量|用量|qty/i },
  { key: 'gramWeight', label: '克重', keywords: /克重|平方克|gsm/i },
  { key: 'size', label: '尺寸', keywords: /尺寸|尺码|size/i },
  { key: 'refPrice', label: '参考价格', keywords: /参考价|单价|价格|price/i },
  { key: 'actualUsage', label: '实际耗用', keywords: /实际耗用|实测耗用|实耗/i },
  { key: 'supplierName', label: '供应商', keywords: /供应商|厂家|supplier/i },
  { key: 'remark', label: '备注', keywords: /备注|说明|remark/i },
];

// 报价明细可映射的字段（2026-08-10 Grace：老系统里已有报价，想直接导进来，
// 不必先去建样衣再从样衣导入）。与 MATERIAL_FIELDS 的差别：报价关心单价/损耗，不关心克重/码带。
export const QUOTE_ITEM_FIELDS: SheetField[] = [
  { key: 'itemName', label: '品名', keywords: /品名|材料|名称|面料|辅料|面里料|item/i, required: true },
  { key: 'part', label: '部位', keywords: /位置|部位|part/i },
  { key: 'width', label: '门幅', keywords: /门幅|幅宽|宽度|width/i },
  { key: 'color', label: '颜色', keywords: /颜色|色组|配色|color/i },
  { key: 'supplier', label: '供应商', keywords: /供应商|厂家|supplier/i },
  { key: 'unit', label: '单位', keywords: /单位|unit/i },
  { key: 'quoteUsage', label: '报价耗用', keywords: /报价耗用|单耗|耗用|用量|数量|qty/i },
  { key: 'rmbPrice', label: '人民币单价', keywords: /人民币单价|单价|价格|price/i },
  { key: 'lossRate', label: '损耗%', keywords: /损耗/i },
  { key: 'remark', label: '备注', keywords: /备注|说明|remark/i },
];

/** 解析上传文件为行数组（整行空白已剔除）。xlsx 多工作表时自动挑「最像材料表」的一张（表头关键词命中最多） */
export async function parseSheetFile(file: File, fields: SheetField[] = MATERIAL_FIELDS): Promise<string[][]> {
  if (/\.xls$/i.test(file.name)) {
    throw new Error('.xls 是老格式（BIFF），解析不了——请用 Excel/WPS 另存为 .xlsx 后再导入');
  }
  if (/\.xlsx$/i.test(file.name)) {
    // 先按文件大小拦一道：比读进内存再报错快，且能把实际大小和**可操作的办法**一起告诉用户。
    // 别再落到 parseXlsx 里那句「请下载后查看」——那是给附件预览写的，导入时说不通。
    if (file.size > MAX_SHEET_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      throw new Error(
        `文件 ${mb}MB，超过 ${Math.round(MAX_SHEET_BYTES / 1024 / 1024)}MB 上限，浏览器解析不了。`
        + '通常是表里嵌了图片或有很多用不到的工作表——请在 Excel 里删掉多余内容后另存，'
        + '或把明细单独另存为 .csv 再导入。',
      );
    }
    const buf = await file.arrayBuffer();
    const sheets = await parseXlsx(buf);
    let best: string[][] = sheets[0]?.rows ?? [];
    let bestHits = -1;
    for (const s of sheets) {
      const hits = guessMapping(s.rows, fields).hits;
      if (hits > bestHits) { bestHits = hits; best = s.rows; }
    }
    return best;
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

/** 在前 5 行里找「最像表头」的一行（命中字段关键词最多），据此自动推断列映射。
 *  兼容工厂工艺单常见的第一行大标题/说明行（用户反馈：表头不在首行时映射全空、导入 0 行） */
export function guessMapping(rows: string[][], fields: SheetField[] = MATERIAL_FIELDS): { mapping: Record<string, number>; hasHeader: boolean; headerRow: number; hits: number } {
  let best = { mapping: {} as Record<string, number>, headerRow: 0, hits: 0 };
  const limit = Math.min(rows.length, 5);
  for (let r = 0; r < limit; r++) {
    const mapping: Record<string, number> = {};
    let hits = 0;
    for (const f of fields) {
      const idx = (rows[r] ?? []).findIndex((cell) => f.keywords.test(String(cell ?? '')));
      if (idx >= 0 && mapping[f.key] === undefined) { mapping[f.key] = idx; hits++; }
    }
    if (hits > best.hits) best = { mapping, headerRow: r, hits };
  }
  return { mapping: best.mapping, hasHeader: best.hits > 0, headerRow: best.headerRow, hits: best.hits };
}

/** 原始行 → 材料行（按列映射；品名为空的行跳过——分区标题/空行自然滤掉）
 *  extraColorCols：除已映射颜色列外，其它「颜色」列号——一款多组颜色（颜色一/颜色二…），
 *  每列各成一个色组按序拼接（用户反馈：按源列结构分开，同值也不合并——她的表就是两列结构） */
export function rowsToMaterials(rows: string[][], mapping: Record<string, number>, extraColorCols: number[] = [], fields: SheetField[] = MATERIAL_FIELDS): any[] {
  const cell = (r: string[], key: string) => (mapping[key] != null ? String(r[mapping[key]] ?? '').trim() : '');
  return rows
    .map((r) => {
      const out: any = Object.fromEntries(fields.map((f) => [f.key, cell(r, f.key)]));
      // 色组按「源列」成组：一个源列恰好一个色组，**列内内容整体保留、绝不再拆**。
      // 【2026-08-04 Nina 反馈】此前只产出 colors 逗号串，下游 splitColors 再按 [，,] 拆一次——
      // 用户单元格里自己打的逗号就被误当成色组分隔符，一格「拉头古银，齿和码带黑色」被劈成两组。
      // 这里直接给出结构化的 colorGroups，导入路径不再经过二次拆分；
      // colors 逗号串照旧生成（落库字段没变、Helen 7-29/7-30 要的跨列分组也照旧成立）。
      if ('colors' in out) {
        out.colorGroups = [out.colors, ...extraColorCols.map((i) => String(r[i] ?? '').trim())]
          .filter(Boolean);
        out.colors = out.colorGroups.join('，');
      }
      return out;
    })
    .filter((m: any) => m.itemName);
}
