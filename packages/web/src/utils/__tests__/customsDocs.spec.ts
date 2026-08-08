// 【AI工具集·场景1】解析 + 装箱 + 箱单导出。
// 三条硬口径（箱号按款号重排 / 尾数单独成行 / 拼箱续行不重复计箱）都在这里守住——
// 它们是对着客户真实箱单反推出来的，改坏了下游装柜计划的箱数就对不上。
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  findHeader, rowsToPoLines, scanPoWorkbook, packLines, packTotals,
  aggregateByStyle, consigneesOf, guessConsignee, safeName,
  inspectLines, reconcile, explainRow, fillHsByStyle,
  normalizeSpecs, toSpecFile, parseSpecFile,
  buildPackingListWorkbook, buildInvoiceWorkbook, buildLoadingPlanWorkbook,
  DEFAULT_PACK, DEFAULT_PL_HEADER, DEFAULT_INV_HEADER, DEFAULT_LP_HEADER, DEFAULT_HS_MAP,
  type PoLine, type PackParams,
} from '../customsDocs';

const PO_HEAD = ['定单号', '款号', '款名', '颜色', '材质', '性别', '', '尺码', '数量                     ', '含税单价        RMB', '总金额            RMB', '条码'];

const poRow = (po: string, style: string, color: string, size: string, qty: number, bar = '86001'): string[] =>
  [po, style, 'SKI JACKET', color, '100%POLYESTER', 'FEMALE', '6202', size, String(qty), '169.64', String(qty * 169.64), bar];

/** 造一张「真 PO 表」的行：前面 13 行抬头/条款，第 14 行才是表头，末尾带 TOTAL 行 */
const poSheetRows = (po: string, data: string[][]): string[][] => [
  ['晋江必迪斯体育用品有限公司'], ['地址：xxx'], ['电话：xxx'], ['采购合同'], ['致：xxx'],
  ['电话:xxx'], ['邮箱：xxx'], ['船期：15/06/2026'], ['交易条件：xxx'], ['付款方式：xxx'],
  ['起运港: 上海'], ['依照下列条件谨此订购'], [],
  PO_HEAD,
  ...data,
  [],
  ['TOTAL ORDER ', '', '', '', '', '', '', '', '17532', '', '2524701.74'],
  ['特别声明:'],
];

const line = (o: Partial<PoLine> & { qty: number }): PoLine => ({
  poNo: 'PO1', style: 'S1', styleName: 'JACKET', color: 'BLACK', composition: '', gender: '',
  hsCode: '', size: 'M', barcode: '860', price: 0, amount: 0, srcRow: 15, ...o,
});

const P = (o: Partial<PackParams> = {}): PackParams => ({ ...DEFAULT_PACK, ...o });

// ------------------------------------------------------------------ 解析

describe('findHeader / rowsToPoLines', () => {
  it('表头不在首行也能找到（真 PO 的表头在第 14 行）', () => {
    const rows = poSheetRows('PO1', [poRow('PO1', 'S1', 'BLACK', 'M', 50)]);
    const h = findHeader(rows);
    expect(h.row).toBe(13);
    expect(h.cols.style).toBe(1);
    expect(h.cols.qty).toBe(8);
  });

  it('HS CODE 表头是空的时候按位置补（夹在性别和尺码之间）', () => {
    const rows = poSheetRows('PO1', [poRow('PO1', 'S1', 'BLACK', 'M', 50)]);
    // 表头第 7 列（index 6）是空串，靠位置推出来
    expect(findHeader(rows).cols.hsCode).toBe(6);
    expect(rowsToPoLines(rows).lines[0].hsCode).toBe('6202');
  });

  it('合计行/条款行/空行不当明细（款号或尺码为空、件数<=0、TOTAL 开头）', () => {
    const rows = poSheetRows('PO1', [
      poRow('PO1', 'S1', 'BLACK', 'M', 50),
      poRow('PO1', 'S1', 'BLACK', 'L', 0),      // 件数 0
      ['PO1', '', '', '', '', '', '', 'XL', '9'], // 无款号
    ]);
    const { lines } = rowsToPoLines(rows);
    expect(lines.map((l) => l.size)).toEqual(['M']);
    expect(lines[0]).toMatchObject({ poNo: 'PO1', style: 'S1', color: 'BLACK', qty: 50, barcode: '86001' });
  });

  it('没有款号/颜色/尺码/数量这几列的表回空（说明书表、字典表自然被滤掉）', () => {
    expect(rowsToPoLines([['Kolona', 'Komentar'], ['Vendor', '内部编码']]).lines).toEqual([]);
  });

  it('件数带千分位也认', () => {
    const rows = poSheetRows('PO1', [poRow('PO1', 'S1', 'BLACK', 'M', 0).map((v, i) => (i === 8 ? '1,234' : v))]);
    expect(rowsToPoLines(rows).lines[0].qty).toBe(1234);
  });
});

describe('scanPoWorkbook', () => {
  const build = async (sheets: Array<{ name: string; rows: string[][] }>): Promise<ArrayBuffer> => {
    const wb = new ExcelJS.Workbook();
    for (const s of sheets) { const ws = wb.addWorksheet(s.name); s.rows.forEach((r) => ws.addRow(r)); }
    return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  };

  it('「表名 = 表内唯一定单号」标成一表一单；平铺汇总表标成汇总表', async () => {
    const buf = await build([
      { name: 'Description', rows: [['Kolona', 'Komentar'], ['Vendor', '内部编码']] },
      { name: 'PO1', rows: poSheetRows('PO1', [poRow('PO1', 'S1', 'BLACK', 'M', 50)]) },
      { name: 'PO2', rows: poSheetRows('PO2', [poRow('PO2', 'S2', 'WHITE', 'L', 30)]) },
      { name: 'Sheet1', rows: [PO_HEAD, poRow('PO1', 'S1', 'BLACK', 'M', 50), poRow('PO2', 'S2', 'WHITE', 'L', 30)] },
    ]);
    const scans = await scanPoWorkbook(buf);
    // Description 没有明细列，压根不进结果
    expect(scans.map((s) => s.name)).toEqual(['PO1', 'PO2', 'Sheet1']);
    expect(scans.map((s) => s.isPerPo)).toEqual([true, true, false]);
    expect(scans.find((s) => s.name === 'Sheet1')!.poNos).toEqual(['PO1', 'PO2']);
    expect(scans.find((s) => s.name === 'PO1')!.totalQty).toBe(50);
  });

  it('整本都没有明细表就报错，而不是回空让人以为「解析成功但 0 行」', async () => {
    const buf = await build([{ name: 'X', rows: [['随便', '写点什么']] }]);
    await expect(scanPoWorkbook(buf)).rejects.toThrow(/没在这个文件里找到 PO 明细表/);
  });
});

// ------------------------------------------------------------------ 装箱

describe('packLines', () => {
  it('每箱 6 件：50 件 = 8 个整箱 + 1 个尾箱，件数不丢', () => {
    const rows = packLines([line({ qty: 50 })], P());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ inCtn: 6, totalPcs: 48, cartonFrom: 1, cartonTo: 8, cartons: 8 });
    expect(rows[1]).toMatchObject({ inCtn: 2, totalPcs: 2, cartonFrom: 9, cartonTo: 9, cartons: 1 });
    expect(packTotals(rows).pieces).toBe(50);
    expect(packTotals(rows).cartons).toBe(9);
  });

  it('整除时没有尾箱', () => {
    const rows = packLines([line({ qty: 12 })], P());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ inCtn: 6, cartons: 2, cartonFrom: 1, cartonTo: 2 });
  });

  it('不足一箱也出一箱（尾数即整箱）', () => {
    const rows = packLines([line({ qty: 4 })], P());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ inCtn: 4, totalPcs: 4, cartons: 1, cartonFrom: 1 });
  });

  it('【硬口径①】箱号在「同一定单号的同一款号」内从 1 重排，不是全表连号', () => {
    const rows = packLines([
      line({ style: 'A', size: 'M', qty: 12 }),
      line({ style: 'B', size: 'M', qty: 12 }),
      line({ poNo: 'PO2', style: 'A', size: 'M', qty: 6 }),
    ], P());
    expect(rows.map((r) => [r.poNo, r.style, r.cartonFrom, r.cartonTo]))
      .toEqual([['PO1', 'A', 1, 2], ['PO1', 'B', 1, 2], ['PO2', 'A', 1, 1]]);
  });

  it('【硬口径②】同款先排完所有尺码的整箱，再排尾数（同一尺码因此出两行）', () => {
    const rows = packLines([
      line({ size: 'S', qty: 8 }),  // 1 整箱 + 尾 2
      line({ size: 'M', qty: 9 }),  // 1 整箱 + 尾 3
    ], P());
    expect(rows.map((r) => [r.size, r.inCtn, r.cartonFrom])).toEqual([
      ['S', 6, 1], ['M', 6, 2],   // 整箱段
      ['S', 2, 3], ['M', 3, 4],   // 尾数段
    ]);
  });

  it('【硬口径③】拼箱：续行不占箱号、箱数/体积/重量合计一律 0，避免一箱统计成几箱', () => {
    const rows = packLines([
      line({ size: 'S', qty: 8 }),  // 尾 2
      line({ size: 'M', qty: 9 }),  // 尾 3
      line({ size: 'L', qty: 7 }),  // 尾 1
    ], P({ mergeRemainder: true }));
    const tail = rows.filter((r) => r.inCtn < 6);
    // 2+3+1 = 6，正好一箱：第一行带箱号，后两行是续行
    expect(tail.map((r) => [r.inCtn, r.cartonFrom, r.cartons, r.continuation]))
      .toEqual([[2, 4, 1, false], [3, null, 0, true], [1, null, 0, true]]);
    expect(tail.slice(1).every((r) => r.cbm === 0 && r.netTotal === 0 && r.grossTotal === 0)).toBe(true);
    // 件数照常计满，箱数只多 1
    expect(packTotals(rows)).toMatchObject({ pieces: 24, cartons: 4 });
  });

  it('拼箱装不下就开新箱（next-fit，尾数本身永远 < 每箱件数所以不会被拆开）', () => {
    const rows = packLines([
      line({ size: 'S', qty: 11 }), // 尾 5
      line({ size: 'M', qty: 10 }), // 尾 4 —— 5+4>6，开新箱
    ], P({ mergeRemainder: true }));
    const tail = rows.filter((r) => r.inCtn < 6);
    expect(tail.map((r) => [r.inCtn, r.cartonFrom, r.continuation])).toEqual([[5, 3, false], [4, 4, false]]);
    expect(packTotals(rows).pieces).toBe(21);
  });

  it('拼箱与各自成箱：件数恒等于源件数，箱数拼箱后只会更少', () => {
    const src = [line({ size: 'S', qty: 50 }), line({ size: 'M', qty: 49 }), line({ size: 'L', qty: 13 })];
    const a = packTotals(packLines(src, P()));
    const b = packTotals(packLines(src, P({ mergeRemainder: true })));
    expect(a.pieces).toBe(112);
    expect(b.pieces).toBe(112);
    expect(b.cartons).toBeLessThan(a.cartons);
  });

  it('体积/重量：CBM 按箱规算、毛重 = 净重 + 皮重、按款号可覆盖单件净重', () => {
    const rows = packLines([line({ style: 'A', qty: 6 }), line({ style: 'B', qty: 6 })],
      P({ netPerPiece: 0.8, tarePerCarton: 1, specByStyle: { B: { net: 1.5 } } }));
    // 58×37.5×37.5 cm = 0.0815625 m³（与真实箱单同小数位）
    expect(rows[0].cbm).toBe(0.0815625);
    expect(rows[0]).toMatchObject({ netPerCarton: 4.8, grossPerCarton: 5.8 });
    expect(rows[1]).toMatchObject({ netPerCarton: 9, grossPerCarton: 10 });
  });

  it('每箱件数改成 12 也照走（本场景默认 6，但口径不写死）', () => {
    const rows = packLines([line({ qty: 50 })], P({ perCarton: 12 }));
    expect(rows.map((r) => [r.inCtn, r.cartons])).toEqual([[12, 4], [2, 1]]);
    expect(packTotals(rows).pieces).toBe(50);
  });
});

// ------------------------------------------------------------------ 导出

describe('buildPackingListWorkbook', () => {
  const cell = (ws: ExcelJS.Worksheet, addr: string) => ws.getCell(addr).value;

  it('按定单号分表，表名带 PL；抬头与两行表头齐全', async () => {
    const rows = packLines([line({ qty: 50 }), line({ poNo: 'PO2', qty: 6 })], P());
    const wb = await buildPackingListWorkbook(rows, { ...DEFAULT_PL_HEADER, packListNo: 'S26-PL', invoiceNo: 'S26' });
    expect(wb.worksheets.map((w: ExcelJS.Worksheet) => w.name)).toEqual(['PO1 PL', 'PO2 PL']);
    const ws = wb.worksheets[0];
    expect(cell(ws, 'A2')).toBe('PACKING LIST');
    expect(cell(ws, 'B6')).toBe('S26-PL');
    expect(cell(ws, 'B8')).toBe('S26');
    expect(cell(ws, 'A26')).toBe('PO NAME');
    expect(cell(ws, 'H26')).toBe('CARTON NO');
    expect([cell(ws, 'F27'), cell(ws, 'G27'), cell(ws, 'J27'), cell(ws, 'N27')])
      .toEqual(['IN CTN', 'TOTAL PCS', 'TOTAL CTNS', 'CBM']);
  });

  it('明细从第 28 行起，合计行与总计块的数与 packTotals 一致', async () => {
    const rows = packLines([line({ qty: 50 })], P());
    const t = packTotals(rows);
    const wb = await buildPackingListWorkbook(rows, DEFAULT_PL_HEADER);
    const ws = wb.worksheets[0];
    expect([cell(ws, 'A28'), cell(ws, 'D28'), cell(ws, 'F28'), cell(ws, 'G28'), cell(ws, 'H28'), cell(ws, 'I28')])
      .toEqual(['PO1', 'M', 6, 48, 1, 8]);
    // 2 行明细 → 合计行在第 31 行（28、29 明细，30 空）
    expect(cell(ws, 'A31')).toBe('TOTAL:');
    expect([cell(ws, 'G31'), cell(ws, 'J31')]).toEqual([t.pieces, t.cartons]);
    expect(cell(ws, 'A33')).toBe('TOTAL GROSS:');
    expect(cell(ws, 'B34')).toBe(t.net);
    expect(cell(ws, 'Q34')).toBe(t.pieces);
    expect(cell(ws, 'B36')).toBe('China');
  });

  it('拼箱续行的箱号/箱数/体积/重量合计导出成空单元格', async () => {
    const rows = packLines([line({ size: 'S', qty: 8 }), line({ size: 'M', qty: 9 })], P({ mergeRemainder: true }));
    const wb = await buildPackingListWorkbook(rows, DEFAULT_PL_HEADER);
    const ws = wb.worksheets[0];
    // 第 4 行明细（第 31 行）= 拼箱续行
    expect(ws.getCell('D31').value).toBe('M');
    expect([ws.getCell('H31').value, ws.getCell('J31').value, ws.getCell('N31').value, ws.getCell('P31').value])
      .toEqual(['', '', '', '']);
    expect(ws.getCell('F31').value).toBe(3); // 件数照常写
  });
});

// ------------------------------------------------------------------ 计重口径

describe('净重口径', () => {
  it('按件：尾箱按实际件数算，比整箱轻', () => {
    const rows = packLines([line({ qty: 8 })], P({ netBasis: 'piece', netPerPiece: 0.8, tarePerCarton: 1 }));
    expect(rows.map((r) => [r.inCtn, r.netPerCarton, r.grossPerCarton])).toEqual([[6, 4.8, 5.8], [2, 1.6, 2.6]]);
  });

  it('按箱固定：复刻真实件——同款每箱记同一个净重，尾箱没装满也照记全重', () => {
    const rows = packLines([line({ qty: 8 })], P({ netBasis: 'carton', netPerCartonFixed: 8.5, tarePerCarton: 1 }));
    expect(rows.map((r) => [r.inCtn, r.netPerCarton, r.grossPerCarton])).toEqual([[6, 8.5, 9.5], [2, 8.5, 9.5]]);
    // 真实件里毛重−净重恒为 1kg，两箱即 2kg
    expect(packTotals(rows)).toMatchObject({ cartons: 2, net: 17, gross: 19 });
  });

  it('按款号覆盖的含义跟着口径走（按箱时是每箱净重）', () => {
    const rows = packLines([line({ style: 'A', qty: 6 }), line({ style: 'B', qty: 6 })],
      P({ netBasis: 'carton', netPerCartonFixed: 8.5, specByStyle: { B: { net: 12 } } }));
    expect(rows.map((r) => r.netPerCarton)).toEqual([8.5, 12]);
  });
});

// ------------------------------------------------------------------ 按款号的装箱预设

describe('按款号装箱规格（款号预设）', () => {
  it('每箱件数可按款号覆盖——这正是复现真实箱单的关键（客户每箱 1~34 件不等）', () => {
    const rows = packLines([
      line({ style: 'JACKET', size: 'M', qty: 60 }),
      line({ style: 'PANTS', size: 'M', qty: 60 }),
    ], P({ perCarton: 6, specByStyle: { JACKET: { perCarton: 10 }, PANTS: { perCarton: 20 } } }));
    expect(rows.map((r) => [r.style, r.inCtn, r.cartons])).toEqual([['JACKET', 10, 6], ['PANTS', 20, 3]]);
    expect(packTotals(rows)).toMatchObject({ pieces: 120, cartons: 9 });
  });

  it('没配预设的款号落回全局默认，两者可以同表共存', () => {
    const rows = packLines([
      line({ style: 'A', qty: 12 }), line({ style: 'B', qty: 12 }),
    ], P({ perCarton: 6, specByStyle: { A: { perCarton: 12 } } }));
    expect(rows.map((r) => [r.style, r.inCtn, r.cartons])).toEqual([['A', 12, 1], ['B', 6, 2]]);
  });

  it('箱规也能按款号覆盖，CBM 随之各算各的', () => {
    const rows = packLines([
      line({ style: 'A', qty: 6 }), line({ style: 'B', qty: 6 }),
    ], P({ specByStyle: { B: { cartonL: 60, cartonW: 40, cartonH: 40 } } }));
    expect(rows[0].cbm).toBe(0.0815625);              // 58×37.5×37.5
    expect(rows[1].cbm).toBe(0.096);                  // 60×40×40
    expect([rows[1].cartonL, rows[1].cartonW, rows[1].cartonH]).toEqual([60, 40, 40]);
  });

  it('按箱计重 + 按款号净重：能复刻真实件「同款每箱固定净重」的做法', () => {
    const rows = packLines([
      line({ style: 'F553', qty: 8 }), line({ style: 'F596', qty: 8 }),
    ], P({ netBasis: 'carton', netPerCartonFixed: 8.5, tarePerCarton: 1, specByStyle: { F596: { net: 6.8 } } }));
    // 真实件里 F553 每箱 8.5kg 净 / 9.5 毛，F596 每箱 6.8 / 7.8
    expect(rows.filter((r) => r.style === 'F553').map((r) => [r.netPerCarton, r.grossPerCarton]))
      .toEqual([[8.5, 9.5], [8.5, 9.5]]);
    expect(rows.filter((r) => r.style === 'F596').map((r) => [r.netPerCarton, r.grossPerCarton]))
      .toEqual([[6.8, 7.8], [6.8, 7.8]]);
  });

  it('预设里的每箱件数取整、非正数当没配（别让 0 或 -1 把装箱除爆）', () => {
    const rows = packLines([line({ style: 'A', qty: 10 })], P({ perCarton: 6, specByStyle: { A: { perCarton: 3.7 } } }));
    expect(rows[0].inCtn).toBe(3);
    expect(normalizeSpecs({ A: { perCarton: 0 }, B: { net: -5 }, C: { perCarton: 10 } })).toEqual({ C: { perCarton: 10 } });
  });
});

describe('款号预设文件（导出/导入）', () => {
  it('导出再导入是同一份（round-trip）', () => {
    const specs = { A: { perCarton: 10, net: 8.5 }, B: { cartonL: 60, cartonW: 40, cartonH: 40 } };
    const text = JSON.stringify(toSpecFile(specs, '2026-08-08'));
    expect(JSON.parse(text)).toMatchObject({ kind: 'i9-customs-style-spec', version: 1 });
    expect(parseSpecFile(text).specs).toEqual(specs);
  });

  it('只有款号名、一项都没填的条目不落盘（界面上的空行不算预设）', () => {
    expect(toSpecFile({ A: {}, B: { perCarton: 10 } }).specs).toEqual({ B: { perCarton: 10 } });
  });

  it('裸对象（没有外层壳）也能导入——手写一份也认', () => {
    expect(parseSpecFile('{"A":{"perCarton":10}}').specs).toEqual({ A: { perCarton: 10 } });
  });

  it('【关键】预设文件要记下计重口径——「每箱净重 8.5」被当成「单件净重 8.5」用，重量会虚高近一个数量级', () => {
    const byCarton = toSpecFile({ A: { net: 8.5 } }, '2026-08-08', 'carton');
    expect(byCarton.netBasis).toBe('carton');
    expect(parseSpecFile(JSON.stringify(byCarton)).netBasis).toBe('carton');
    // 同一份 net=8.5，两种口径下每箱净重差 6 倍（一箱 6 件）
    const spec = { A: { net: 8.5 } };
    const asCarton = packLines([line({ style: 'A', qty: 6 })], P({ netBasis: 'carton', specByStyle: spec }));
    const asPiece = packLines([line({ style: 'A', qty: 6 })], P({ netBasis: 'piece', specByStyle: spec }));
    expect(asCarton[0].netPerCarton).toBe(8.5);
    expect(asPiece[0].netPerCarton).toBe(51);
    // 老文件没记口径 → 回 undefined，调用方据此决定要不要提示
    expect(parseSpecFile('{"A":{"net":8.5}}').netBasis).toBeUndefined();
  });

  it('【关键】导入垃圾文件必须报错而不是当成空预设——预设错了会静默改变全部箱数', () => {
    expect(() => parseSpecFile('不是 json')).toThrow(/不是合法的 JSON/);
    expect(() => parseSpecFile('[1,2,3]')).toThrow(/找不到款号预设/);
    expect(() => parseSpecFile('{"A":{"perCarton":0}}')).toThrow(/没有任何有效预设/);
  });
});

// ------------------------------------------------------------------ 装柜计划的汇总

describe('aggregateByStyle / guessConsignee', () => {
  it('按「定单号 + 款号」汇总，件数/箱数/体积/重量与装箱结果一致', () => {
    const src = [
      line({ style: 'A', size: 'S', qty: 50, hsCode: '6202' }),
      line({ style: 'A', size: 'M', qty: 49, hsCode: '6202' }),
      line({ style: 'B', size: 'S', qty: 13, hsCode: '6204' }),
    ];
    const rows = packLines(src, P());
    const aggs = aggregateByStyle(rows, DEFAULT_HS_MAP, { PO1: 'SERBIA' });
    expect(aggs.map((a) => [a.style, a.qty, a.cartons])).toEqual([['A', 99, 18], ['B', 13, 3]]);
    // 汇总件数必须等于源件数，也等于装箱后件数——三份单据互校的根据
    const t = packTotals(rows);
    expect(aggs.reduce((s, a) => s + a.qty, 0)).toBe(112);
    expect(aggs.reduce((s, a) => s + a.cartons, 0)).toBe(t.cartons);
    expect(+aggs.reduce((s, a) => s + a.cbm, 0).toFixed(8)).toBe(t.cbm);
  });

  it('HS 4 位 → 中文品名 + 10 位商编；查不到就留空而不是瞎填', () => {
    const rows = packLines([line({ style: 'A', hsCode: '6202', qty: 6 }), line({ style: 'B', hsCode: '9999', qty: 6 })], P());
    const aggs = aggregateByStyle(rows);
    expect(aggs[0]).toMatchObject({ nameCn: '女上衣', hs10: '6202409000' });
    expect(aggs[1]).toMatchObject({ nameCn: '', hs10: '' });
  });

  it('收货国：逐单指定优先，没指定时按单号里的目的地代号猜，猜不出留空', () => {
    expect(guessConsignee('ELBDA263RSIN')).toBe('SERBIA');
    expect(guessConsignee('ELBDA263BH2')).toBe('BOSNIA');
    expect(guessConsignee('ELBDA263ECREP')).toBe('ROMANIA');
    expect(guessConsignee('ELBDA263WCIN')).toBe('SLOVAKIA');
    expect(guessConsignee('SOMETHING-ELSE')).toBe('');
    const rows = packLines([line({ poNo: 'ELBDA263RSIN', qty: 6 }), line({ poNo: 'X9', qty: 6 })], P());
    expect(aggregateByStyle(rows, DEFAULT_HS_MAP, { X9: 'CROATIA' }).map((a) => a.consignee))
      .toEqual(['SERBIA', 'CROATIA']);
  });

  it('consigneesOf 按出现顺序去重，未指定的收货国收成一个空组', () => {
    const rows = packLines([
      line({ poNo: 'ELBDA263RSIN', qty: 6 }), line({ poNo: 'ELBDA263BH1', qty: 6 }), line({ poNo: 'X9', qty: 6 }),
    ], P());
    expect(consigneesOf(aggregateByStyle(rows))).toEqual(['SERBIA', 'BOSNIA', '']);
  });
});

// ------------------------------------------------------------------ 发票

describe('buildInvoiceWorkbook', () => {
  const invLine = (o: Partial<PoLine> & { qty: number }): PoLine =>
    line({ styleName: 'OXA SKI JACKET', composition: '100%POLYESTER', gender: 'FEMALE', hsCode: '6202', price: 169.64, ...o });

  it('按定单号分表，抬头与表头齐全，明细带单价金额', async () => {
    const wb = await buildInvoiceWorkbook(
      [invLine({ size: 'XS', qty: 50 }), invLine({ poNo: 'PO2', size: 'S', qty: 22 })],
      { ...DEFAULT_INV_HEADER, invoiceNo: 'S26DTX0027', invoiceDate: '2026-06-11', deliveryDate: '24/06/2026' },
    );
    expect(wb.worksheets.map((w: ExcelJS.Worksheet) => w.name)).toEqual(['PO1 INV', 'PO2 INV']);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A1').value).toBe('INVOICE');
    expect(ws.getCell('B6').value).toBe('S26DTX0027');
    expect(ws.getCell('A11').value).toBe('名称：南京达泰服装有限公司');
    expect(ws.getCell('A22').value).toBe('PO NAME');
    expect([ws.getCell('I22').value, ws.getCell('K22').value, ws.getCell('O22').value, ws.getCell('P22').value])
      .toEqual(['QTY', 'AMOUNT', '订单数', '差额']);
    expect([ws.getCell('A23').value, ws.getCell('H23').value, ws.getCell('I23').value, ws.getCell('J23').value, ws.getCell('K23').value])
      .toEqual(['PO1', 'XS', 50, 169.64, 8482]);
    expect(ws.getCell('M23').value).toBe('24/06/2026');
  });

  it('合计行：件数/金额/订单数，差额恒为 0（由 PO 生成，两者必然相等）', async () => {
    const wb = await buildInvoiceWorkbook([invLine({ qty: 50 }), invLine({ size: 'S', qty: 132 })], DEFAULT_INV_HEADER);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A25').value).toBe('Total:');
    expect([ws.getCell('I25').value, ws.getCell('K25').value, ws.getCell('O25').value, ws.getCell('P25').value])
      .toEqual([182, 30874.48, 182, 0]);
    expect(ws.getCell('A27').value).toBe('For & On Behalf of Seller:');
    expect(ws.getCell('J29').value).toBe('JINJIANG BDS SPORTSWEAR CO., LTD');
  });

  it('发票行数与 PO 明细一一对应（不经装箱，不会因为拆箱多出行）', async () => {
    const src = [invLine({ size: 'XS', qty: 50 }), invLine({ size: 'S', qty: 132 }), invLine({ size: 'M', qty: 7 })];
    const wb = await buildInvoiceWorkbook(src, DEFAULT_INV_HEADER);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A26').value).toBe('Total:'); // 23/24/25 三行明细
    // 同一批数据装箱后是 5 行（含尾箱），发票仍是 3 行——两份的行粒度本就不同
    expect(packLines(src, P()).length).toBe(5);
  });
});

// ------------------------------------------------------------------ 装柜计划

describe('buildLoadingPlanWorkbook', () => {
  const mk = (poNo: string, style: string, hs: string, qty: number) =>
    line({ poNo, style, hsCode: hs, qty });

  it('层级 = 收货国块 → 定单块 → 每款一行；每块后跟小计，最后总计', async () => {
    const rows = packLines([
      mk('ELBDA263RSIN', 'A', '6202', 12), mk('ELBDA263RSIN', 'B', '6204', 6),
      mk('ELBDA263RSREP', 'A', '6202', 6),
      mk('ELBDA263BH1', 'A', '6202', 6),
    ], P());
    const wb = await buildLoadingPlanWorkbook(aggregateByStyle(rows), DEFAULT_LP_HEADER);
    const ws = wb.worksheets[0];
    expect(wb.worksheets).toHaveLength(1);
    expect(ws.getCell('A1').value).toBe('PURCHASE ORDER NUMBERS');
    expect([ws.getCell('F1').value, ws.getCell('G1').value, ws.getCell('I1').value, ws.getCell('J1').value])
      .toEqual(['QTY', 'CTNS', 'G.W.', 'N.W.']);
    const colE = (r: number) => ws.getCell(r, 5).value;
    const colF = (r: number) => ws.getCell(r, 6).value;
    expect([colE(2), colE(3)]).toEqual(['SERBIA', 'SERBIA']);          // RSIN 两个款号
    expect(colE(4)).toBe('ELBDA263RSIN 小计');
    expect(colF(4)).toBe(18);
    expect(colE(6)).toBe('ELBDA263RSREP 小计');
    expect([colE(7), colF(7)]).toEqual(['SERBIA 合计', 24]);            // 国家合计
    expect(colE(10)).toBe('BOSNIA 合计');
    expect([colE(11), colF(11)]).toEqual(['总计', 30]);
  });

  it('中文品名/10 位商编按 HS 归类落列；商编强制文本免得被转科学计数法', async () => {
    const rows = packLines([mk('ELBDA263RSIN', 'A', '6202', 6)], P());
    const wb = await buildLoadingPlanWorkbook(aggregateByStyle(rows), DEFAULT_LP_HEADER);
    const ws = wb.worksheets[0];
    expect([ws.getCell('C2').value, ws.getCell('D2').value]).toEqual(['女上衣', '6202409000']);
    expect(ws.getCell('D2').numFmt).toBe('@');
  });

  it('单证/柜号/卸货港在收货国块内合并成一格', async () => {
    const rows = packLines([
      mk('ELBDA263RSIN', 'A', '6202', 6), mk('ELBDA263RSREP', 'A', '6202', 6),
    ], P());
    const wb = await buildLoadingPlanWorkbook(aggregateByStyle(rows), {
      ...DEFAULT_LP_HEADER,
      containerByConsignee: { SERBIA: '5x40HQ 271568354' },
      dischargePortByConsignee: { SERBIA: 'RIJEKA PORT - BELGRADE' },
    });
    const ws = wb.worksheets[0];
    expect(ws.getCell('L2').value).toBe('5x40HQ 271568354');
    expect(ws.getCell('M2').value).toBe('RIJEKA PORT - BELGRADE');
    // 明细 2 行 + PO 小计 2 行 + 国家合计 1 行 = 第 2..6 行被合并
    const merged = (ws.model.merges ?? []).map(String);
    expect(merged).toContain('L2:L6');
    expect(merged).toContain('M2:M6');
  });

  it('没填收货国的定单归到「未指定」一组，不会被悄悄丢掉', async () => {
    const rows = packLines([mk('X9', 'A', '6202', 6)], P());
    const wb = await buildLoadingPlanWorkbook(aggregateByStyle(rows), DEFAULT_LP_HEADER);
    const ws = wb.worksheets[0];
    expect(ws.getCell('E2').value).toBe('（未指定）');
    expect(ws.getCell(4, 5).value).toBe('未指定收货国 合计');
  });
});

// ------------------------------------------------------------------ 三份互校

describe('三份单据同源', () => {
  it('件数：发票(源) = 箱单(装箱后) = 装柜计划(按款号汇总)', () => {
    const src = [
      line({ poNo: 'ELBDA263RSIN', style: 'A', size: 'XS', qty: 50, hsCode: '6202' }),
      line({ poNo: 'ELBDA263RSIN', style: 'A', size: 'S', qty: 132, hsCode: '6202' }),
      line({ poNo: 'ELBDA263RSIN', style: 'B', size: 'M', qty: 7, hsCode: '6204' }),
      line({ poNo: 'ELBDA263BH1', style: 'A', size: 'L', qty: 13, hsCode: '6202' }),
    ];
    const invQty = src.reduce((s, l) => s + l.qty, 0);
    for (const merge of [false, true]) {
      const rows = packLines(src, P({ mergeRemainder: merge }));
      const aggs = aggregateByStyle(rows);
      expect(packTotals(rows).pieces).toBe(invQty);
      expect(aggs.reduce((s, a) => s + a.qty, 0)).toBe(invQty);
      expect(aggs.reduce((s, a) => s + a.cartons, 0)).toBe(packTotals(rows).cartons);
    }
  });

  it('safeName 剔掉文件名非法字符（带 : 的名字在 Windows 上直接存不下来）', () => {
    expect(safeName('PL-S26/DTX:0027*.xlsx')).toBe('PL-S26-DTX-0027-.xlsx');
  });
});

// ------------------------------------------------------------------ 过程可见：跳过行 / 列映射改写

describe('跳过行统计（少的那些去哪了）', () => {
  it('按原因归类并带源文件行号，空行排最后（表尾留白不该抢注意力）', () => {
    const rows = poSheetRows('PO1', [
      poRow('PO1', 'S1', 'BLACK', 'M', 50),
      poRow('PO1', 'S1', 'BLACK', 'L', 0),          // 数量不是正数
      ['PO1', '', '', '', '', '', '', 'XL', '9'],    // 款号为空
      ['PO1', 'S2', 'X', '', '', '', '', '', '9'],   // 尺码为空
    ]);
    const { lines, skipped } = rowsToPoLines(rows);
    expect(lines).toHaveLength(1);
    const byReason = Object.fromEntries(skipped.map((s) => [s.reason, s.count]));
    // 表尾的「特别声明:」单独归「说明/条款行」，不混进「款号为空」让人以为真明细丢了
    expect(byReason).toMatchObject({ 数量不是正数: 1, 款号为空: 1, 尺码为空: 1, 合计行: 1, '说明/条款行': 1 });
    expect(skipped[skipped.length - 1].reason).toBe('空行');
    // 行号按 Excel 的 1 起：第 14 行是表头，第 15 行起是明细
    expect(skipped.find((s) => s.reason === '数量不是正数')!.samples[0]).toContain('第 16 行');
  });

  it('整行合并单元格的条款行归「说明/条款行」，不冒充「数量不是正数」', () => {
    // exceljs 读合并区会把同一句话在每列都返回一遍 → 款号/尺码/数量全是那句话，
    // 不特判的话会显示成「款号和尺码都有、只是数量不对」，看的人一头雾水
    const clause = '2、除此事先言明，装箱起卸等项，本公司概不负担。';
    const rows = poSheetRows('PO1', [
      poRow('PO1', 'S1', 'BLACK', 'M', 50),
      Array.from({ length: 12 }, () => clause),
    ]);
    const { lines, skipped } = rowsToPoLines(rows);
    expect(lines).toHaveLength(1);
    const s = skipped.find((x) => x.reason === '说明/条款行')!;
    expect(s.count).toBe(2); // 合并条款行 + 表尾「特别声明:」
    expect(s.samples[0]).toContain('第 16 行');
    expect(skipped.find((x) => x.reason === '数量不是正数')).toBeUndefined();
  });

  it('每类最多留 3 条例子（几百行异常也不会把界面撑爆）', () => {
    const bad = Array.from({ length: 10 }, () => ['PO1', '', '', '', '', '', '', 'M', '9']);
    const { skipped } = rowsToPoLines(poSheetRows('PO1', [poRow('PO1', 'S1', 'BLACK', 'M', 50), ...bad]));
    const s = skipped.find((x) => x.reason === '款号为空')!;
    expect(s.count).toBe(10);
    expect(s.samples).toHaveLength(3);
  });

  it('列映射可被覆盖——认错的列改回来就能重算（界面上「核对」面板靠这个）', () => {
    const rows = poSheetRows('PO1', [poRow('PO1', 'S1', 'BLACK', 'M', 50)]);
    // 故意把「数量」指到「单价」那一列：件数会变成 169.64
    const wrong = rowsToPoLines(rows, { headerRow: 13, cols: { style: 1, color: 3, size: 7, qty: 9 } });
    expect(wrong.lines[0].qty).toBe(169.64);
    // 指回正确的第 9 列（index 8）
    const right = rowsToPoLines(rows, { headerRow: 13, cols: { style: 1, color: 3, size: 7, qty: 8 } });
    expect(right.lines[0].qty).toBe(50);
  });

  it('明细行带源文件行号，一路传到箱单行上（「这条哪来的」）', () => {
    const { lines } = rowsToPoLines(poSheetRows('PO1', [poRow('PO1', 'S1', 'BLACK', 'M', 50)]));
    expect(lines[0].srcRow).toBe(15);
    expect(packLines(lines, P())[0].srcRow).toBe(15);
  });

  it('scanPoWorkbook 把原始行/表头行/列映射一起带出来，界面才有得核对', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PO1');
    poSheetRows('PO1', [poRow('PO1', 'S1', 'BLACK', 'M', 50)]).forEach((r) => ws.addRow(r));
    const scans = await scanPoWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(scans[0].headerRow).toBe(13);
    expect(scans[0].cols.qty).toBe(8);
    expect(scans[0].rows.length).toBeGreaterThan(13);
    expect(scans[0].skipped.some((s) => s.reason === '合计行')).toBe(true);
  });
});

// ------------------------------------------------------------------ 过程可见：体检 / 对账 / 算式

describe('inspectLines（源数据体检）', () => {
  it('缺 HS / 缺单价 算重，缺条码 / 缺款名 算轻，并说明会毁哪份单', () => {
    const issues = inspectLines([
      line({ qty: 10, hsCode: '', price: 0, barcode: '', styleName: '' }),
      line({ qty: 10, size: 'L', hsCode: '6202', price: 1, barcode: 'b', styleName: 'X' }),
    ]);
    const m = Object.fromEntries(issues.map((i) => [i.key, i]));
    expect(m.noHs).toMatchObject({ level: 'error', count: 1 });
    expect(m.noPrice).toMatchObject({ level: 'error', count: 1 });
    expect(m.noBarcode).toMatchObject({ level: 'warn', count: 1 });
    expect(m.noStyleName.affects).toContain('发票');
    // 重的排前面
    expect(issues[0].level).toBe('error');
  });

  it('件数不是整数要报（会算出小数箱）', () => {
    const m = inspectLines([line({ qty: 10.5, hsCode: '6202', price: 1 })]);
    expect(m.find((i) => i.key === 'fracQty')).toMatchObject({ level: 'error', count: 1 });
  });

  it('源文件自带金额与「单价×件数」对不上要提醒，差 1 分以内当舍入不报', () => {
    const near = inspectLines([line({ qty: 3, price: 10, amount: 30.005, hsCode: '6202' })]);
    expect(near.find((i) => i.key === 'amountMismatch')).toBeUndefined();
    const off = inspectLines([line({ qty: 3, price: 10, amount: 99, hsCode: '6202' })]);
    expect(off.find((i) => i.key === 'amountMismatch')).toMatchObject({ level: 'warn', count: 1 });
  });

  it('同一「定单号+款号+颜色+尺码」重复出现要提醒（件数不会自动合并）', () => {
    const dup = inspectLines([
      line({ qty: 10, hsCode: '6202', price: 1, barcode: 'b', styleName: 'X', srcRow: 15 }),
      line({ qty: 5, hsCode: '6202', price: 1, barcode: 'b', styleName: 'X', srcRow: 20 }),
    ]);
    const d = dup.find((i) => i.key === 'dupKey')!;
    expect(d.count).toBe(1);
    expect(d.samples[0]).toContain('共 2 行，合计 15 件');
  });

  it('数据干净时一条不报', () => {
    expect(inspectLines([line({ qty: 6, hsCode: '6202', price: 1, barcode: 'b', styleName: 'X' })])).toEqual([]);
  });
});

describe('fillHsByStyle（跨定单补 HS CODE）', () => {
  it('同款号在别的定单里有 HS 就补过来，并说清补了几行、哪些款号', () => {
    const r = fillHsByStyle([
      line({ poNo: 'RSIN', style: 'A', qty: 1, hsCode: '6202' }),
      line({ poNo: 'RSNS', style: 'A', qty: 1, hsCode: '' }),   // 该表整列没有 HS
      line({ poNo: 'RSNS', style: 'A', size: 'L', qty: 1, hsCode: '' }),
    ]);
    expect(r.filled).toBe(2);
    expect(r.filledStyles).toEqual(['A']);
    expect(r.lines.map((l) => l.hsCode)).toEqual(['6202', '6202', '6202']);
    expect(r.unresolved).toEqual([]);
  });

  it('整份文件里都没有 HS 的款号补不上，要点名（不能假装补上了）', () => {
    const r = fillHsByStyle([
      line({ style: 'A', qty: 1, hsCode: '6202' }),
      line({ style: 'Z', qty: 1, hsCode: '' }),
    ]);
    expect(r.filled).toBe(0);
    expect(r.unresolved).toEqual(['Z']);
  });

  it('【关键】同款号在不同定单里 HS 不一致：一律不补，报冲突交给人——静默取其一等于替客户瞎报关', () => {
    const r = fillHsByStyle([
      line({ poNo: 'P1', style: 'A', qty: 1, hsCode: '6202' }),
      line({ poNo: 'P2', style: 'A', qty: 1, hsCode: '6204' }),
      line({ poNo: 'P3', style: 'A', qty: 1, hsCode: '' }),
    ]);
    expect(r.conflicts).toEqual([{ style: 'A', codes: ['6202', '6204'] }]);
    expect(r.filled).toBe(0);
    expect(r.lines[2].hsCode).toBe('');   // 没被偷偷填上
    expect(r.unresolved).toEqual(['A']);
  });

  it('不改原数组，返回新行（原始明细要留着给「未修补」视图看）', () => {
    const src = [line({ style: 'A', qty: 1, hsCode: '6202' }), line({ style: 'A', qty: 1, hsCode: '' })];
    const r = fillHsByStyle(src);
    expect(src[1].hsCode).toBe('');
    expect(r.lines[1].hsCode).toBe('6202');
  });
});

describe('reconcile（三份逐款对账）', () => {
  const src = [
    line({ poNo: 'P1', style: 'A', size: 'S', qty: 50 }),
    line({ poNo: 'P1', style: 'B', size: 'M', qty: 13 }),
    line({ poNo: 'P2', style: 'A', size: 'L', qty: 7 }),
  ];

  it('正常路径：按款号、按定单号都一致，坏项为 0', () => {
    const rows = packLines(src, P());
    const r = reconcile(src, rows, aggregateByStyle(rows));
    expect(r.badCount).toBe(0);
    expect(r.byStyle.map((x) => [x.poNo, x.style, x.poQty, x.plQty, x.lpQty]))
      .toEqual([['P1', 'A', 50, 50, 50], ['P1', 'B', 13, 13, 13], ['P2', 'A', 7, 7, 7]]);
    expect(r.byPo.map((x) => [x.poNo, x.poQty, x.cartons])).toEqual([['P1', 63, 12], ['P2', 7, 2]]);
  });

  it('装箱结果被动过手脚就能揪出来，且精确到款号——总数一致也照样报', () => {
    const rows = packLines(src, P());
    // 造一处「P1 的款号 A 少 6 件、款号 B 多 6 件」：总数不变，逐款对不上
    const iA = rows.findIndex((x) => x.poNo === 'P1' && x.style === 'A');
    const iB = rows.findIndex((x) => x.poNo === 'P1' && x.style === 'B');
    const tampered = rows.map((x, i) => (i === iA ? { ...x, totalPcs: x.totalPcs - 6 }
      : i === iB ? { ...x, totalPcs: x.totalPcs + 6 } : x));
    const r = reconcile(src, tampered, aggregateByStyle(tampered));
    expect(packTotals(tampered).pieces).toBe(packTotals(rows).pieces); // 总数一样
    expect(r.badCount).toBe(2);                                        // 但两个款号露馅
    expect(r.byStyle.filter((x) => !x.ok).map((x) => x.style)).toEqual(['A', 'B']);
    expect(r.byPo.find((x) => x.poNo === 'P1')!.ok).toBe(true);        // 定单层面反而看不出来
  });
});

describe('explainRow（这一行怎么来的）', () => {
  it('整箱段 / 尾箱 / 并箱 各自说清楚', () => {
    const rows = packLines([line({ qty: 50 })], P());
    expect(explainRow(rows[0])).toBe('源 50 件 ÷ 每箱 6 ＝ 8 整箱 余 2 件；本行＝整箱段 8 箱 × 6 件');
    expect(explainRow(rows[1])).toBe('源 50 件 ÷ 每箱 6 ＝ 8 整箱 余 2 件；本行＝尾箱 2 件');

    const merged = packLines([line({ size: 'S', qty: 8 }), line({ size: 'M', qty: 9 })], P({ mergeRemainder: true }));
    expect(explainRow(merged[3])).toContain('并入上一箱（不另计箱）');
  });

  it('正好装完时说「正好装完」，不显示余 0', () => {
    expect(explainRow(packLines([line({ qty: 12 })], P())[0]))
      .toBe('源 12 件 ÷ 每箱 6 ＝ 2 整箱（正好装完）；本行＝整箱段 2 箱 × 6 件');
  });

  it('设过款号预设的行，算式按该款生效的每箱件数讲，不按全局参数', () => {
    const rows = packLines([line({ style: 'A', qty: 50 })], P({ specByStyle: { A: { perCarton: 12 } } }));
    expect(rows[0].perCarton).toBe(12);
    expect(explainRow(rows[0])).toBe('源 50 件 ÷ 每箱 12 ＝ 4 整箱 余 2 件；本行＝整箱段 4 箱 × 12 件');
  });
});
