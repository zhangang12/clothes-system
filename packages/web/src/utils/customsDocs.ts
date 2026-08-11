// 【AI工具集·场景1】清关单据生成 —— PO 源文件 → 箱单 + 发票 + 装柜计划（三份一次出齐）
//
// 业务背景（对着客户真实的一套清关文件反推出来的口径，勿凭空改）：
//   一次出运有 4 份表格，只有 1 份是「源」——**客户**给的采购合同 PO（每 PO 一张工作表，
//   【别再写成「工厂给的」】文件标题是《采购合同》，但抬头是晋江必迪斯(BDS)、致南京达泰，
//   那是**客户的采购**，对达泰而言是销售订单，属下游；发票也印证：ISSUED TO 是 BDS、
//   受益人是南京达泰，钱从 BDS 流向达泰。写成「工厂给的」会把整件事读到上游（合同侧）去。
//   行粒度 = 定单号+款号+颜色+尺码，带件数/单价/条码/HS CODE）。另外 3 份
//   （箱单 PL / 发票 INV / 装柜计划 LOADING PLAN）今天全靠人拿计算器从 PO 抠出来。
//   本模块把这 3 份一起生成，它们共用同一份解析结果与同一次装箱：
//     · 箱单   ← 装箱结果，行粒度 = 定单号+款号+颜色+尺码+箱段
//     · 发票   ← PO 明细原样带单价/金额，行粒度与 PO 一致（不经装箱）
//     · 装柜计划 ← 装箱结果按「定单号+款号」汇总，再按收货国分块
//   三份的件数天然同源，不会像手工做那样对不上。
//
// 【从真实箱单里反推出来的三条硬口径】（下面的实现都以此为准）
//   1. 箱号按「同一 PO 的同一款号」重新从 1 起编——不是全表连号。真实文件里
//      ELA263F553-11 编到 46 箱、下一个款号 ELA263F553-01 又从 1 开始；装柜计划
//      LOADING PLAN 的 CTNS 列也正是「按款号」统计的，两边能对上。
//   2. 一个尺码先出整箱、尾数单独成行——同一尺码会出现两行（整箱行 + 尾箱行），
//      这不是重复数据，真实箱单就长这样。
//   3. 拼箱行（几个尺码合装一箱）只有第一行写箱号、TOTAL CTNS=1，后续行的
//      箱号/箱数/重量/体积全部留空计 0，否则一箱会被重复统计成好几箱。
//
// 【源文件里没有、必须由人给的参数】PO 上只有件数，箱规/净重/毛重一个都没有。
//   箱规默认 58×37.5×37.5cm（真实文件全表同一规格，CBM=0.0815625 对得上小数位）；
//   毛重−净重恒为 1kg（真实文件 9.5−8.5 / 7.8−6.8 / 13−12 / 10−9 全部成立），
//   故建模为「单件净重 × 件数 + 每箱皮重」，都放到界面上让人改。
//
// exceljs 一律动态 import（解包 20MB+，见 sheetPreview.ts 的说明），不进主包。

import { downloadBlob } from './docExcel';

// ---------------------------------------------------------------- 解析 PO 源文件

/** PO 明细行：粒度 = 定单号 + 款号 + 颜色 + 尺码 */
export interface PoLine {
  poNo: string;
  style: string;
  styleName: string;
  color: string;
  composition: string;
  gender: string;
  hsCode: string;
  size: string;
  qty: number;
  price: number;
  amount: number;
  barcode: string;
  /** 来自源文件第几行（Excel 的 1 起行号）——界面上「这条哪来的」全靠它 */
  srcRow: number;
}

/** 一张工作表的扫描结果（界面据此让人勾选用哪几张表 + 核对列识别对不对） */
export interface SheetScan {
  /** 工作表名 */
  name: string;
  /** 原始行（供界面预览原文 + 人工改列映射后重算） */
  rows: string[][];
  /** 认出来的表头行（0 起）；-1 = 没认出来 */
  headerRow: number;
  /** 认出来的列映射：字段 → 列号（0 起） */
  cols: Partial<Record<ColKey, number>>;
  lines: PoLine[];
  /** 表头行之下被跳过的行，按原因归类（让人看见「少的那些去哪了」） */
  skipped: SkipStat[];
  /** 该表出现过的定单号（去重，保持出现顺序） */
  poNos: string[];
  /** 件数合计 */
  totalQty: number;
  /** 表名恰好等于表内唯一定单号 —— 「一表一 PO」的标准结构，默认勾选 */
  isPerPo: boolean;
}

/** 跳过行的归类统计。**必须让用户看见**：解析器靠「款号/尺码为空、件数≤0」滤行，
 *  万一列认错了，会表现为「大量行被当成空行跳过」——不摊出来就是静默丢数据。 */
export interface SkipStat { reason: string; count: number; samples: string[] }

const COL_KEYS = {
  poNo: /定单号|订单号|po\s*(no|name)/i,
  style: /款号|style\s*code|^style$/i,
  styleName: /款名|style\s*name|品名/i,
  color: /颜色|color/i,
  composition: /材质|成份|成分|composition/i,
  gender: /性别|gender/i,
  hsCode: /hs\s*code|海关编码|商品编码/i,
  size: /尺码|尺寸|size/i,
  qty: /数量|qty|quantity/i,
  price: /单价|price/i,
  amount: /总金额|金额|amount/i,
  barcode: /条码|条形码|barcode|ean/i,
} as const;

export type ColKey = keyof typeof COL_KEYS;

/** 字段中文名（界面上的列识别面板照这个显示） */
export const COL_LABELS: Record<ColKey, string> = {
  poNo: '定单号', style: '款号', styleName: '款名', color: '颜色', composition: '材质',
  gender: '性别', hsCode: 'HS CODE', size: '尺码', qty: '数量', price: '单价',
  amount: '总金额', barcode: '条码',
};

export const COL_ORDER = Object.keys(COL_LABELS) as ColKey[];

/** 必须齐的列：缺任意一个就不当作 PO 明细表 */
export const REQUIRED_COLS: ColKey[] = ['style', 'color', 'size', 'qty'];

/** 三份单据分别依赖哪些列——界面上标出来，人一眼知道「这列认错会毁哪份单」 */
export const COL_USED_BY: Partial<Record<ColKey, string[]>> = {
  poNo: ['箱单', '发票', '装柜计划'],
  style: ['箱单', '发票', '装柜计划'],
  styleName: ['发票'],
  color: ['箱单', '发票'],
  composition: ['发票'],
  gender: ['发票'],
  hsCode: ['发票', '装柜计划'],
  size: ['箱单', '发票'],
  qty: ['箱单', '发票', '装柜计划'],
  price: ['发票'],
  barcode: ['箱单', '发票'],
};

/** 在前若干行里找表头行：命中关键词最多的一行胜出（PO 的表头在第 14 行，前面全是抬头/条款） */
export function findHeader(rows: string[][], scanRows = 30): { row: number; cols: Partial<Record<ColKey, number>>; hits: number } {
  let best = { row: -1, cols: {} as Partial<Record<ColKey, number>>, hits: 0 };
  const limit = Math.min(rows.length, scanRows);
  for (let r = 0; r < limit; r++) {
    const cols: Partial<Record<ColKey, number>> = {};
    let hits = 0;
    (Object.keys(COL_KEYS) as ColKey[]).forEach((k) => {
      const idx = (rows[r] ?? []).findIndex((c) => COL_KEYS[k].test(String(c ?? '').trim()));
      if (idx >= 0 && cols[k] === undefined) { cols[k] = idx; hits++; }
    });
    if (hits > best.hits) best = { row: r, cols, hits };
  }
  // HS CODE 这一列在真实 PO 里有的表写了表头、有的表头是空的（RSIN 那张就没写），
  // 但列位置固定夹在「性别」和「尺码」之间。表头找不到就按位置补，不然整列丢空。
  const { gender, size, hsCode } = best.cols;
  if (hsCode === undefined && gender !== undefined && size !== undefined && size - gender === 2) {
    best.cols.hsCode = gender + 1;
  }
  return best;
}

const txt = (v: unknown): string => String(v ?? '').trim();

/** 数字取值：允许 "1,234"、" 50 "；非数字回 0 */
const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

export interface ParseResult { lines: PoLine[]; skipped: SkipStat[] }

/** 单张工作表 → PO 明细行 + 跳过行统计。
 *  表头找不到或必填列缺失则回空（Description/字典表自然被滤掉）。
 *  `override` 让界面把人工改过的表头行/列映射传回来重算——列是靠关键词猜的，猜错必须能改。 */
export function rowsToPoLines(
  rows: string[][],
  override?: { headerRow?: number; cols?: Partial<Record<ColKey, number>> },
): ParseResult {
  const auto = findHeader(rows);
  const row = override?.headerRow ?? auto.row;
  const cols = override?.cols ?? auto.cols;
  if (row < 0 || REQUIRED_COLS.some((k) => cols[k] === undefined)) return { lines: [], skipped: [] };
  const at = (r: string[], k: ColKey): string => (cols[k] === undefined ? '' : txt(r[cols[k]!]));

  const out: PoLine[] = [];
  const skip = new Map<string, SkipStat>();
  const note = (reason: string, rowNo: number, why: string) => {
    let s = skip.get(reason);
    if (!s) { s = { reason, count: 0, samples: [] }; skip.set(reason, s); }
    s.count++;
    if (s.samples.length < 3) s.samples.push(`第 ${rowNo} 行${why ? `：${why}` : ''}`);
  };

  for (let i = row + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rowNo = i + 1; // 界面上按 Excel 的 1 起行号说话
    const style = at(r, 'style');
    const size = at(r, 'size');
    const qtyRaw = at(r, 'qty');
    const qty = num(qtyRaw);

    // 「TOTAL」这类汇总行有时也带款号列，先挡（否则会被归到「款号为空」里，看着莫名其妙）
    if (/^total/i.test(at(r, 'poNo')) || /^total/i.test(style)) { note('合计行', rowNo, at(r, 'poNo') || style); continue; }
    if (r.every((c) => !txt(c))) { note('空行', rowNo, ''); continue; }
    // 表尾的「特别声明 / 1、2、3… / 售方盖章」这类整行说明，有两种长相，都要单独归类——
    // 否则它们会混进「款号为空 / 数量不是正数」，让人以为真明细被丢了。
    //   a) 零星一两格有字、数量列是空的；
    //   b) **整行合并单元格**：exceljs 会把合并区的文字在每一列都返回一遍，于是款号/尺码/数量
    //      全是同一句条款文字，看着「款号和尺码都有、只是数量不对」，极具误导性。
    //      判据是「整行去重后只剩一个值」——真明细绝不可能款号=颜色=尺码。
    const nonEmpty = r.map((c) => txt(c)).filter(Boolean);
    const merged = nonEmpty.length > 1 && new Set(nonEmpty).size === 1;
    if ((merged || (!style && nonEmpty.length <= 2)) && !(qty > 0)) {
      note('说明/条款行', rowNo, (nonEmpty[0] ?? '').slice(0, 30));
      continue;
    }
    if (!style) { note('款号为空', rowNo, r.slice(0, 3).filter(Boolean).join(' / ').slice(0, 40)); continue; }
    if (!size) { note('尺码为空', rowNo, `款号 ${style}`); continue; }
    if (qty <= 0) { note(qtyRaw ? '数量不是正数' : '数量为空', rowNo, `款号 ${style} / ${size}${qtyRaw ? ` / 读到「${qtyRaw}」` : ''}`); continue; }

    out.push({
      poNo: at(r, 'poNo'),
      style,
      styleName: at(r, 'styleName'),
      color: at(r, 'color'),
      composition: at(r, 'composition'),
      gender: at(r, 'gender'),
      hsCode: at(r, 'hsCode'),
      size,
      qty,
      price: num(at(r, 'price')),
      amount: num(at(r, 'amount')),
      barcode: at(r, 'barcode'),
      srcRow: rowNo,
    });
  }
  // 空行排最后：它通常是表尾留白，不是「数据丢了」，不该抢占注意力
  const skipped = [...skip.values()].sort((a, b) => (a.reason === '空行' ? 1 : b.reason === '空行' ? -1 : b.count - a.count));
  return { lines: out, skipped };
}

/** 读整本 PO 工作簿：每张表各扫一遍，交给界面勾选。
 *  【为什么要勾选】真实 PO 文件里除了 10 张「一表一 PO」，还有一张 Sheet1 把所有 PO 平铺了一遍
 *  （1894 行）。全都算进去件数直接翻倍。默认只勾「表名 = 表内唯一定单号」的那种。 */
export async function scanPoWorkbook(buf: ArrayBuffer): Promise<SheetScan[]> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const scans: SheetScan[] = [];
  wb.eachSheet((ws) => {
    const rows: string[][] = [];
    const cols = ws.columnCount || 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= cols; c++) cells.push(cellText(row.getCell(c).value));
      rows.push(cells);
    }
    const auto = findHeader(rows);
    const { lines, skipped } = rowsToPoLines(rows);
    if (!lines.length) return;
    const poNos = [...new Set(lines.map((l) => l.poNo).filter(Boolean))];
    scans.push({
      name: ws.name,
      rows,
      headerRow: auto.row,
      cols: auto.cols,
      lines,
      skipped,
      poNos,
      totalQty: lines.reduce((s, l) => s + l.qty, 0),
      isPerPo: poNos.length === 1 && poNos[0] === ws.name.trim(),
    });
  });
  if (!scans.length) throw new Error('没在这个文件里找到 PO 明细表（需要有「款号/颜色/尺码/数量」这几列的表头行）');
  return scans;
}

/** 单元格取显示值：公式取缓存结果、富文本拼文本、日期取本地日期 */
function cellText(v: any): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toLocaleDateString('zh-CN');
  if (typeof v === 'object') {
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return v.result === undefined ? '' : String(v.result);
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join('');
    if ('error' in v) return String(v.error);
    return '';
  }
  return String(v);
}

// ---------------------------------------------------------------- 装箱

/** 某个款号自己的装箱规格。留空的项落回全局参数。
 *  【为什么必须能按款号定】客户真实箱单里每箱件数 1~34 件不等、每箱净重按款在 6.8/8.5/9/12kg 之间跳——
 *  羽绒服和裤子本来就不可能一个箱规。全局一个值必然对不上真实件。 */
export interface StyleSpec {
  perCarton?: number;
  cartonL?: number;
  cartonW?: number;
  cartonH?: number;
  /** 净重，含义随 netBasis：按件=单件净重，按箱=每箱净重 */
  net?: number;
}

export type StyleSpecMap = Record<string, StyleSpec>;

export interface PackParams {
  /** 每箱件数（全局默认，本场景默认 6） */
  perCarton: number;
  /** 箱规 cm（全局默认） */
  cartonL: number;
  cartonW: number;
  cartonH: number;
  /** 按款号覆盖装箱规格；没配的款走全局默认 */
  specByStyle?: StyleSpecMap;
  /** 计重口径：
   *  'piece' = 每箱净重按该箱实际件数算（尾箱更轻，讲得通，默认）
   *  'carton' = 每箱净重固定（复刻客户真实件：他们的箱单里同一款号每箱净重恒为一个值，
   *             哪怕那箱只装了 6 件里的 2 件也照记全重） */
  netBasis: 'piece' | 'carton';
  /** 单件净重 kg（netBasis='piece' 时用；全局默认值） */
  netPerPiece: number;
  /** 每箱净重 kg（netBasis='carton' 时用；全局默认值） */
  netPerCartonFixed: number;
  /** 每箱皮重 kg（毛重 = 净重 + 皮重）。真实件里毛重−净重恒为 1kg，故独立成一个参数 */
  tarePerCarton: number;
  /** 同款尾数拼箱：true=同款各尺码的尾数按源顺序依次合装（装不下开新箱）；false=每个尾数各占一箱 */
  mergeRemainder: boolean;
}

export const DEFAULT_PACK: PackParams = {
  perCarton: 6,
  cartonL: 58,
  cartonW: 37.5,
  cartonH: 37.5,
  netBasis: 'piece',
  netPerPiece: 0.8,
  netPerCartonFixed: 8.5,
  tarePerCarton: 1,
  mergeRemainder: false,
};

// ------------------------------------------------ 款号装箱预设：本地保存 + 导出/导入
//
// 【为什么先落在浏览器本地而不是入库】（2026-08-08 用户拍板）
//   装箱规格本质上是款号的物理属性，长远该挂在款号主数据上；但那要动表、走红线一。
//   先做成本地预设 + 可导出导入的 JSON：业务自己维护一份、跑几票把口径验稳，
//   确认之后再决定要不要入库。这样零 schema 风险，也不耽误现在就能复现真实箱单。

const SPEC_KEY = 'i9.customsDocs.styleSpec';

/** 预设文件的外层结构：带版本号，日后字段变了好识别。
 *  **必须记下当时的计重口径**：预设里的 net 一列，按件口径下是「单件净重」、按箱口径下是「每箱净重」，
 *  两者差着一个箱的件数（真实数据里差 8~20 倍）。口径对不上而不提示，重量会静默虚高好几倍。 */
export interface StyleSpecFile {
  kind: 'i9-customs-style-spec';
  version: 1;
  savedAt: string;
  netBasis: 'piece' | 'carton';
  specs: StyleSpecMap;
}

const cleanSpec = (s: unknown): StyleSpec | null => {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  const pick = (k: string): number | undefined => {
    const v = Number(o[k]);
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const out: StyleSpec = {
    perCarton: pick('perCarton') ? Math.floor(pick('perCarton')!) : undefined,
    cartonL: pick('cartonL'), cartonW: pick('cartonW'), cartonH: pick('cartonH'), net: pick('net'),
  };
  // 一项都没填的条目不留，免得预设表里堆满空壳
  return Object.values(out).some((v) => v !== undefined) ? out : null;
};

/** 只留真正填了值的款号（界面上的空行不该被当成预设） */
export function normalizeSpecs(map: StyleSpecMap): StyleSpecMap {
  const out: StyleSpecMap = {};
  for (const [style, s] of Object.entries(map ?? {})) {
    const c = cleanSpec(s);
    if (c && style.trim()) out[style.trim()] = c;
  }
  return out;
}

export function loadStyleSpecs(): StyleSpecMap {
  try {
    const raw = localStorage.getItem(SPEC_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw);
    return normalizeSpecs(j?.specs ?? j);
  } catch { return {}; }
}

export function saveStyleSpecs(map: StyleSpecMap, netBasis: 'piece' | 'carton' = 'piece'): void {
  try {
    localStorage.setItem(SPEC_KEY, JSON.stringify(toSpecFile(map, '', netBasis)));
  } catch { /* 隐私模式/配额满：存不下就算了，不该因此挡住出单 */ }
}

export function toSpecFile(map: StyleSpecMap, savedAt = '', netBasis: 'piece' | 'carton' = 'piece'): StyleSpecFile {
  return { kind: 'i9-customs-style-spec', version: 1, savedAt, netBasis, specs: normalizeSpecs(map) };
}

/** 解析导入的预设文件；不认的内容直接报错，不静默吞掉——预设错了会静默改变全部箱数。
 *  同时把文件里记的计重口径带出来，让调用方去核对（口径错了重量会差近一个数量级）。 */
export function parseSpecFile(text: string): { specs: StyleSpecMap; netBasis?: 'piece' | 'carton' } {
  let j: any;
  try { j = JSON.parse(text); } catch { throw new Error('不是合法的 JSON 文件'); }
  const specs = j?.specs ?? j;
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) {
    throw new Error('文件里找不到款号预设（应形如 {"款号": {"perCarton": 10, ...}}）');
  }
  const out = normalizeSpecs(specs);
  if (!Object.keys(out).length) throw new Error('文件里没有任何有效预设（每条至少要填一项且为正数）');
  const nb = j?.netBasis;
  return { specs: out, netBasis: nb === 'piece' || nb === 'carton' ? nb : undefined };
}

/** 箱单的一行。拼箱的后续行 cartonFrom=null —— 箱号/箱数/体积/重量都不再计，避免一箱统计成几箱 */
export interface CartonLine {
  poNo: string;
  style: string;
  styleName: string;
  color: string;
  size: string;
  barcode: string;
  hsCode: string;
  /** 本行每箱装几件（尾箱就是尾数） */
  inCtn: number;
  /** 本行这个款号**生效的**每箱件数（可能来自款号预设，也可能是全局默认）。
   *  界面上「这一行怎么来的」要拿它讲算式，不能拿全局参数讲——那样按款号设过的行会解释错。 */
  perCarton: number;
  /** 本行合计件数 = inCtn × 箱数（拼箱续行则等于该行件数） */
  totalPcs: number;
  cartonFrom: number | null;
  cartonTo: number | null;
  /** 本行占几箱（拼箱续行为 0） */
  cartons: number;
  /** 箱规 cm（每行都要打印，随参数走） */
  cartonL: number;
  cartonW: number;
  cartonH: number;
  cbm: number;
  netPerCarton: number;
  netTotal: number;
  grossPerCarton: number;
  grossTotal: number;
  /** 拼箱续行标记（界面上淡显，导出时箱号列留空） */
  continuation: boolean;
  // —— 以下三个字段不进导出件，只为界面「这一行怎么来的」服务 ——
  /** 该 (定单号,款号,颜色,尺码) 在 PO 上的原始件数 */
  srcQty: number;
  /** 源文件行号（Excel 的 1 起行号） */
  srcRow: number;
  /** 本行属于整箱段还是尾数段 */
  seg: 'full' | 'tail';
}

// 体积留 8 位：58×37.5×37.5 的单箱 CBM 是 0.0815625（7 位小数），真实箱单也是这么打的；
// 只截到 6 位会把最后一位抹掉，整柜体积累加起来跟客户对不上。8 位纯粹是压浮点噪声。
const rv = (n: number): number => +n.toFixed(8);
const r3 = (n: number): number => +n.toFixed(3);
const r2 = (n: number): number => +n.toFixed(2);

/**
 * 按 (PO,款号,颜色,尺码) 的件数装箱。
 * 顺序：同一 PO 同一款号内，先把所有尺码的整箱排完，再排尾数；箱号在款号内从 1 起。
 */
export function packLines(lines: PoLine[], p: PackParams): CartonLine[] {
  // 按「PO + 款号」分组，保持源文件出现顺序
  const groups = new Map<string, PoLine[]>();
  for (const l of lines) {
    const k = `${l.poNo}\u0000${l.style}`;
    const g = groups.get(k);
    if (g) g.push(l); else groups.set(k, [l]);
  }

  const out: CartonLine[] = [];
  for (const g of groups.values()) {
    // 每个款号先把「生效规格」解出来：款号预设优先，没配的落回全局默认
    const spec = p.specByStyle?.[g[0].style] ?? {};
    const per = Math.max(1, Math.floor(spec.perCarton ?? p.perCarton));
    const L = spec.cartonL ?? p.cartonL;
    const W = spec.cartonW ?? p.cartonW;
    const H = spec.cartonH ?? p.cartonH;
    const cbmPerCarton = rv((L * W * H) / 1_000_000);
    // 净重的含义跟着 netBasis 走：按件时是「单件净重」，按箱时是「每箱净重」
    const base = spec.net ?? (p.netBasis === 'carton' ? p.netPerCartonFixed : p.netPerPiece);

    let ctn = 0; // 箱号游标：款号内从 1 起
    const row = (l: PoLine, inCtn: number, cartons: number, from: number | null,
      seg: 'full' | 'tail', continuation = false): CartonLine => {
      const netPerCarton = r3(p.netBasis === 'carton' ? base : inCtn * base);
      const grossPerCarton = r3(netPerCarton + p.tarePerCarton);
      return {
        poNo: l.poNo, style: l.style, styleName: l.styleName, color: l.color,
        size: l.size, barcode: l.barcode, hsCode: l.hsCode,
        inCtn,
        perCarton: per,
        totalPcs: inCtn * cartons,
        cartonFrom: from,
        cartonTo: from === null ? null : from + cartons - 1,
        cartons: continuation ? 0 : cartons,
        cartonL: L, cartonW: W, cartonH: H,
        cbm: continuation ? 0 : rv(cbmPerCarton * cartons),
        netPerCarton,
        netTotal: continuation ? 0 : r3(netPerCarton * cartons),
        grossPerCarton,
        grossTotal: continuation ? 0 : r3(grossPerCarton * cartons),
        continuation,
        srcQty: l.qty, srcRow: l.srcRow, seg,
      };
    };

    // ① 整箱
    const rest: Array<{ line: PoLine; qty: number }> = [];
    for (const l of g) {
      const full = Math.floor(l.qty / per);
      const rem = l.qty % per;
      if (full > 0) { out.push(row(l, per, full, ctn + 1, 'full')); ctn += full; }
      if (rem > 0) rest.push({ line: l, qty: rem });
    }

    // ② 尾数
    if (!p.mergeRemainder) {
      for (const { line, qty } of rest) { out.push(row(line, qty, 1, ctn + 1, 'tail')); ctn += 1; }
    } else {
      // 同款尾数按源顺序依次装（next-fit）：当前箱放得下就放，放不下开新箱。
      // 每个尾数都 < 每箱件数，所以永远不必把一个尾数拆到两箱里。
      let load = 0; // 当前箱已装件数；0 表示还没开箱
      for (const { line, qty } of rest) {
        if (load === 0 || load + qty > per) {
          ctn += 1; load = qty;
          out.push(row(line, qty, 1, ctn, 'tail'));
        } else {
          load += qty;
          out.push(row(line, qty, 1, null, 'tail', true)); // 续行：并入上一箱
        }
      }
    }
  }
  return out;
}

/** 「这一行怎么来的」——把装箱算式写成一句人话，界面上逐行显示。
 *  用户最想知道的就是这个：50 件是怎么变成「8 箱 + 1 尾箱」的。
 *  每箱件数取本行**生效值**（款号预设优先），不取全局参数——否则设过预设的款会解释错。 */
export function explainRow(r: CartonLine): string {
  const perCarton = r.perCarton;
  const full = Math.floor(r.srcQty / perCarton);
  const rem = r.srcQty % perCarton;
  const calc = `源 ${r.srcQty} 件 ÷ 每箱 ${perCarton} ＝ ${full} 整箱`
    + (rem > 0 ? ` 余 ${rem} 件` : '（正好装完）');
  if (r.seg === 'full') return `${calc}；本行＝整箱段 ${r.cartons} 箱 × ${r.inCtn} 件`;
  if (r.continuation) return `${calc}；本行＝尾数 ${r.inCtn} 件，并入上一箱（不另计箱）`;
  return `${calc}；本行＝尾箱 ${r.inCtn} 件`;
}

export interface PackTotals { pieces: number; cartons: number; cbm: number; net: number; gross: number }

export function packTotals(rows: CartonLine[]): PackTotals {
  return {
    pieces: rows.reduce((s, r) => s + r.totalPcs, 0),
    cartons: rows.reduce((s, r) => s + r.cartons, 0),
    cbm: rv(rows.reduce((s, r) => s + r.cbm, 0)),
    net: r3(rows.reduce((s, r) => s + r.netTotal, 0)),
    gross: r3(rows.reduce((s, r) => s + r.grossTotal, 0)),
  };
}

// ---------------------------------------------------------------- 跨定单补 HS CODE

/** 按同款号跨定单补 HS CODE 的结果 */
export interface HsFillResult {
  lines: PoLine[];
  /** 补上了多少行 */
  filled: number;
  /** 补上的行涉及哪些款号 */
  filledStyles: string[];
  /** 补不上的款号（整份文件里它就没有 HS） */
  unresolved: string[];
  /** 同一款号在不同定单里 HS 不一致——**不自动补**，必须人来定 */
  conflicts: Array<{ style: string; codes: string[] }>;
}

/**
 * 真实 PO 文件里，**10 张定单表只有 2 张带 HS CODE 列**（其余表压根没这一列，还有一张有表头没数据）。
 * 但同一个款号会跨定单反复出现，所以缺的那些能从别的定单补回来——本函数干这件事。
 *
 * 【为什么必须是「可见的一步」而不是偷偷补】
 *   ① 补不上的要点名（那些款号只在没有 HS 的表里出现过）；
 *   ② **同款号 HS 冲突的一律不补**——真实文件里就有一个款号在两张定单上分别写了 6202 和 6204，
 *      静默取其一等于替客户瞎报关。这种必须报出来让人定。
 */
export function fillHsByStyle(lines: PoLine[]): HsFillResult {
  const codes = new Map<string, Set<string>>();
  for (const l of lines) {
    const hs = String(l.hsCode ?? '').trim();
    if (!hs) continue;
    const s = codes.get(l.style) ?? new Set<string>();
    s.add(hs);
    codes.set(l.style, s);
  }
  const conflicts = [...codes.entries()]
    .filter(([, v]) => v.size > 1)
    .map(([style, v]) => ({ style, codes: [...v] }));
  const conflictStyles = new Set(conflicts.map((c) => c.style));

  const filledStyles = new Set<string>();
  const unresolved = new Set<string>();
  let filled = 0;
  const out = lines.map((l) => {
    if (String(l.hsCode ?? '').trim()) return l;
    const s = codes.get(l.style);
    if (!s || conflictStyles.has(l.style)) { unresolved.add(l.style); return l; }
    filled++;
    filledStyles.add(l.style);
    return { ...l, hsCode: [...s][0] };
  });
  return { lines: out, filled, filledStyles: [...filledStyles], unresolved: [...unresolved], conflicts };
}

// ---------------------------------------------------------------- 数据体检 & 逐级对账

/** 源数据体检：解析出来了不等于对。这些异常单独拎出来，不然会一路带进报关件。 */
export interface DataIssue {
  key: string;
  label: string;
  /** error = 会让某份单据出错；warn = 单据能出但内容有缺 */
  level: 'error' | 'warn';
  /** 受影响的单据 */
  affects: string;
  count: number;
  samples: string[];
}

const sampleOf = (l: PoLine) => `第 ${l.srcRow} 行 ${l.style} / ${l.color} / ${l.size}`;

export function inspectLines(lines: PoLine[]): DataIssue[] {
  const defs: Array<{ key: string; label: string; level: 'error' | 'warn'; affects: string; hit: (l: PoLine) => boolean }> = [
    { key: 'noPo', label: '定单号为空', level: 'error', affects: '三份都会归到同一张无名表', hit: (l) => !l.poNo },
    { key: 'noHs', label: '没有 HS CODE', level: 'error', affects: '装柜计划的中文品名/10 位商编会空', hit: (l) => !l.hsCode },
    { key: 'noPrice', label: '单价为 0 或空', level: 'error', affects: '发票金额算不出来', hit: (l) => !(l.price > 0) },
    { key: 'noBarcode', label: '没有条码', level: 'warn', affects: '箱单、发票的条码列会空', hit: (l) => !l.barcode },
    { key: 'noColor', label: '颜色为空', level: 'warn', affects: '箱单按颜色分不开', hit: (l) => !l.color },
    { key: 'noStyleName', label: '款名为空', level: 'warn', affects: '发票的 STYLE NAME 会空', hit: (l) => !l.styleName },
    { key: 'fracQty', label: '件数不是整数', level: 'error', affects: '装箱会算出小数箱', hit: (l) => !Number.isInteger(l.qty) },
    {
      key: 'amountMismatch',
      label: '源文件自带的总金额与「单价×件数」对不上',
      level: 'warn',
      affects: '发票金额以「单价×件数」为准，源文件那一列不采信',
      // 源文件的金额列可能是手改过的死值；差 1 分以内算舍入，不报
      hit: (l) => l.amount > 0 && Math.abs(l.amount - l.qty * l.price) > 0.01,
    },
  ];
  const out: DataIssue[] = [];
  for (const d of defs) {
    const hits = lines.filter(d.hit);
    if (hits.length) {
      out.push({
        key: d.key, label: d.label, level: d.level, affects: d.affects,
        count: hits.length, samples: hits.slice(0, 3).map(sampleOf),
      });
    }
  }
  // 同一个 (定单号,款号,颜色,尺码) 在源里出现多次：不是错，但件数会被合并装箱，得让人知道
  const seen = new Map<string, PoLine[]>();
  for (const l of lines) {
    const k = `${l.poNo}/${l.style}/${l.color}/${l.size}`;
    const g = seen.get(k);
    if (g) g.push(l); else seen.set(k, [l]);
  }
  const dups = [...seen.values()].filter((g) => g.length > 1);
  if (dups.length) {
    out.push({
      key: 'dupKey', label: '同一「定单号+款号+颜色+尺码」在源文件里出现多次', level: 'warn',
      affects: '这些行的件数会各自独立装箱，不会自动合并',
      count: dups.length,
      samples: dups.slice(0, 3).map((g) => `${sampleOf(g[0])}（共 ${g.length} 行，合计 ${g.reduce((s, l) => s + l.qty, 0)} 件）`),
    });
  }
  return out.sort((a, b) => (a.level === b.level ? b.count - a.count : a.level === 'error' ? -1 : 1));
}

/** 逐级对账的一行：把「源 → 箱单 → 装柜计划」三个口径摆在一起，对不上就标出来。
 *  这是「数据哪里搞错了」最直接的答案——总数一致不代表每个定单/款号都一致。 */
export interface ReconRow {
  key: string;
  poNo: string;
  style: string;
  /** PO 源件数（也是发票件数：发票不经装箱，与源一一对应） */
  poQty: number;
  /** 箱单件数（装箱后各行合计） */
  plQty: number;
  /** 装柜计划件数（按款号汇总） */
  lpQty: number;
  cartons: number;
  ok: boolean;
}

export function reconcile(lines: PoLine[], rows: CartonLine[], aggs: StyleAgg[]): {
  byStyle: ReconRow[];
  byPo: ReconRow[];
  badCount: number;
} {
  const acc = (map: Map<string, ReconRow>, key: string, poNo: string, style: string) => {
    let x = map.get(key);
    if (!x) { x = { key, poNo, style, poQty: 0, plQty: 0, lpQty: 0, cartons: 0, ok: true }; map.set(key, x); }
    return x;
  };
  const byStyleMap = new Map<string, ReconRow>();
  for (const l of lines) acc(byStyleMap, `${l.poNo} ${l.style}`, l.poNo, l.style).poQty += l.qty;
  for (const r of rows) {
    const x = acc(byStyleMap, `${r.poNo} ${r.style}`, r.poNo, r.style);
    x.plQty += r.totalPcs;
    x.cartons += r.cartons;
  }
  for (const a of aggs) acc(byStyleMap, `${a.poNo} ${a.style}`, a.poNo, a.style).lpQty += a.qty;

  const byStyle = [...byStyleMap.values()];
  for (const x of byStyle) x.ok = x.poQty === x.plQty && x.plQty === x.lpQty;

  const byPoMap = new Map<string, ReconRow>();
  for (const x of byStyle) {
    const p = acc(byPoMap, x.poNo, x.poNo, '');
    p.poQty += x.poQty; p.plQty += x.plQty; p.lpQty += x.lpQty; p.cartons += x.cartons;
  }
  const byPo = [...byPoMap.values()];
  for (const p of byPo) p.ok = p.poQty === p.plQty && p.plQty === p.lpQty;

  return { byStyle, byPo, badCount: byStyle.filter((x) => !x.ok).length };
}

// ---------------------------------------------------------------- 报关归类 & 按款号汇总

/** HS 归类：PO 上只有 4 位章号，报关件要的是中文品名 + 10 位商编。
 *  下表是从客户真实装柜计划的 364 行里统计出来的（4 种组合各自唯一，无歧义），界面上可改。
 *  【顺带修了他们手工件的一处毛病】真实装柜计划里 ELA263M132-01 同时被归成「男裤子/6203439090」
 *  和「男上衣/6201409000」，ELA263G150-01、ELA263G151-71 也各有两种归法——手工填必然的漂移。
 *  这里一律按 PO 上的 HS 4 位推，同一款号不可能出现两种归类。 */
export interface HsClass { nameCn: string; hs10: string }

export const DEFAULT_HS_MAP: Record<string, HsClass> = {
  6201: { nameCn: '男上衣', hs10: '6201409000' },
  6202: { nameCn: '女上衣', hs10: '6202409000' },
  6203: { nameCn: '男裤子', hs10: '6203439090' },
  6204: { nameCn: '女裤子', hs10: '6204630000' },
};

/** 定单号 → 收货国的猜测：PO 号里的字母段是本司自己的目的地代号（RS=塞尔维亚、BH=波黑…）。
 *  只是**预填**，界面上逐单可改——猜不出就留空，绝不瞎填一个国家进报关件。 */
const PO_COUNTRY_HINT: Array<[RegExp, string]> = [
  [/RS(IN|REP|NS)?$/i, 'SERBIA'],
  [/BH\d*$/i, 'BOSNIA'],
  [/EC(IN|REP)?$/i, 'ROMANIA'],
  [/WC(IN|REP)?$/i, 'SLOVAKIA'],
];

export function guessConsignee(poNo: string): string {
  for (const [re, c] of PO_COUNTRY_HINT) if (re.test(poNo)) return c;
  return '';
}

/** 装柜计划的一行：按「定单号 + 款号」汇总装箱结果 */
export interface StyleAgg {
  poNo: string;
  style: string;
  nameCn: string;
  hs10: string;
  consignee: string;
  qty: number;
  cartons: number;
  cbm: number;
  gross: number;
  net: number;
}

/** 装箱结果 → 按款号汇总（保持出现顺序）。拼箱续行的箱数/体积/重量本就是 0，直接累加即可 */
export function aggregateByStyle(
  rows: CartonLine[],
  hsMap: Record<string, HsClass> = DEFAULT_HS_MAP,
  consigneeByPo: Record<string, string> = {},
): StyleAgg[] {
  const m = new Map<string, StyleAgg>();
  for (const r of rows) {
    const k = `${r.poNo} ${r.style}`;
    let a = m.get(k);
    if (!a) {
      const cls = hsMap[String(r.hsCode).trim()];
      a = {
        poNo: r.poNo, style: r.style,
        nameCn: cls?.nameCn ?? '', hs10: cls?.hs10 ?? '',
        consignee: consigneeByPo[r.poNo] ?? guessConsignee(r.poNo),
        qty: 0, cartons: 0, cbm: 0, gross: 0, net: 0,
      };
      m.set(k, a);
    }
    a.qty += r.totalPcs;
    a.cartons += r.cartons;
    a.cbm = rv(a.cbm + r.cbm);
    a.gross = r3(a.gross + r.grossTotal);
    a.net = r3(a.net + r.netTotal);
  }
  return [...m.values()];
}

/** 装柜计划里出现的收货国（保持出现顺序；空的归到「未指定」一组，让人一眼看见还没填） */
export function consigneesOf(aggs: StyleAgg[]): string[] {
  return [...new Set(aggs.map((a) => a.consignee || ''))];
}

// ---------------------------------------------------------------- 导出箱单 xlsx

/** 箱单抬头 —— PO 源文件里没有，全部由人填（默认值取自客户真实箱单，便于直接套用） */
export interface PlHeader {
  packListNo: string;
  packListDate: string;
  invoiceNo: string;
  issuedTo: string;
  issuedToShort: string;
  consignee: string;
  consigneeCountry: string;
  shipper: string;
  shipperAddress: string;
  shipperTaxNo: string;
  etd: string;
  eta: string;
  deliveryPort: string;
  madeIn: string;
}

/** 抬头默认值取自本司真实出运的那套清关文件，界面上全部可改（换客户/换航次就改这里的输入框） */
export const DEFAULT_PL_HEADER: PlHeader = {
  packListNo: '',
  packListDate: '',
  invoiceNo: '',
  issuedTo: 'BDS TRADE LIMITED  ROOM 9, 19TH FLOOR, KODAK HOUSE II, NO.39 HEALTHY STREET EAST, QUARRY BAY, HONG KONG',
  issuedToShort: 'BDS HK',
  consignee: 'SPORT VISION D.O.O. SERBIA',
  consigneeCountry: 'Serbia',
  shipper: 'NANJING DATEX FASHION CO.,LTD',
  shipperAddress: 'BUILDING C101, J6 CREATIVE INDUSTRY PARK, NO.6 JIANGJUN AVENUE,NANJING,CHINA',
  shipperTaxNo: '91320102593536520X',
  etd: '',
  eta: '',
  deliveryPort: 'Rijeka, Croatia',
  madeIn: 'China',
};

const THIN = { style: 'thin' as const, color: { argb: 'FF999999' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/** 生成箱单工作簿（每个 PO 一张工作表，版式对齐客户真实 PL） */
export async function buildPackingListWorkbook(rows: CartonLine[], head: PlHeader): Promise<any> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();

  // 按 PO 拆表，保持出现顺序
  const byPo = new Map<string, CartonLine[]>();
  for (const r of rows) {
    const k = r.poNo || 'PO';
    const g = byPo.get(k);
    if (g) g.push(r); else byPo.set(k, [r]);
  }

  for (const [po, list] of byPo) {
    // 工作表名有 31 字符上限，且 : \ / ? * [ ] 不合法
    const ws = wb.addWorksheet(`${po} PL`.replace(/[:\\/?*[\]]/g, '-').slice(0, 31));
    ws.columns = [
      { width: 16 }, { width: 16 }, { width: 13 }, { width: 8 }, { width: 15 },
      { width: 8 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 10 },
      { width: 7 }, { width: 7 }, { width: 7 }, { width: 10 },
      { width: 11 }, { width: 10 }, { width: 11 }, { width: 10 }, { width: 18 },
    ];

    ws.mergeCells('A2:S3');
    const title = ws.getCell('A2');
    title.value = 'PACKING LIST';
    title.font = { size: 18, bold: true };
    title.alignment = { horizontal: 'center', vertical: 'middle' };

    const kv = (r: number, k: string, v: string) => {
      ws.getCell(r, 1).value = k;
      ws.getCell(r, 1).font = { bold: true };
      ws.getCell(r, 2).value = v;
    };
    kv(6, 'PACK LIST NO:', head.packListNo);
    kv(7, 'PACK LIST DATE:', head.packListDate);
    kv(8, 'INVOICE NO:', head.invoiceNo);
    kv(10, 'ISSUED TO:', head.issuedTo);
    ws.getCell(11, 2).value = head.issuedToShort;
    kv(14, 'CONSIGNEE:', head.consignee);
    ws.getCell(15, 2).value = head.consigneeCountry;
    kv(18, 'SHIPPER:', head.shipper);
    ws.getCell(19, 2).value = head.shipperAddress;
    ws.getCell(20, 2).value = head.shipperTaxNo;
    kv(22, 'ETD:', head.etd);
    kv(23, 'ETA:', head.eta);
    kv(24, 'DELIVERY PORT:', head.deliveryPort);

    // 两行表头（与真实箱单同结构：上行分组、下行子列）
    const H1 = 26, H2 = 27;
    ws.getCell(H1, 1).value = 'PO NAME';
    ws.getCell(H1, 2).value = 'ARTICLE';
    ws.getCell(H1, 6).value = 'QUANTITY';
    ws.getCell(H1, 8).value = 'CARTON NO';
    ws.getCell(H1, 11).value = 'CARTON SIZE';
    ws.getCell(H1, 15).value = 'NET WEIGHT';
    ws.getCell(H1, 17).value = 'GROSS WEIGHT';
    ws.getCell(H1, 19).value = 'CONTAINER NO';
    ws.mergeCells(H1, 2, H1, 5);
    ws.mergeCells(H1, 6, H1, 7);
    ws.mergeCells(H1, 8, H1, 10);
    ws.mergeCells(H1, 11, H1, 14);
    ws.mergeCells(H1, 15, H1, 16);
    ws.mergeCells(H1, 17, H1, 18);
    ws.mergeCells(H1, 1, H2, 1);
    ws.mergeCells(H1, 19, H2, 19);
    const sub = ['', 'STYLE', 'COLOR', 'SIZE', 'BARCODE', 'IN CTN', 'TOTAL PCS', 'FROM', 'TO', 'TOTAL CTNS',
      'L', 'W', 'H', 'CBM', 'PER CARTON', 'TOTAL', 'PER CARTON', 'TOTAL', ''];
    sub.forEach((v, i) => { if (v) ws.getCell(H2, i + 1).value = v; });
    for (let r = H1; r <= H2; r++) {
      for (let c = 1; c <= 19; c++) {
        const cell = ws.getCell(r, c);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = BORDER;
      }
    }

    // 明细
    let r = H2 + 1;
    for (const x of list) {
      // 拼箱续行：箱号/箱数/体积/重量合计一律留空——真实箱单就是这么表达「并入上一箱」的，
      // 写上数字会让这一箱在下游（装柜计划的 CTNS、订舱体积）被重复计一次。
      const cells: unknown[] = [
        x.poNo, x.style, x.color, x.size, x.barcode,
        x.inCtn, x.totalPcs,
        x.cartonFrom ?? '', x.cartonTo ?? '', x.cartons || '',
        x.cartonL, x.cartonW, x.cartonH, x.cbm || '',
        x.netPerCarton, x.netTotal || '', x.grossPerCarton, x.grossTotal || '', '',
      ];
      cells.forEach((v, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = v as any;
        cell.border = BORDER;
        cell.alignment = { horizontal: i >= 5 ? 'right' : 'left', vertical: 'middle' };
        // 条码是数字串，不强制文本会被 Excel 转科学计数法
        if (i === 4) cell.numFmt = '@';
      });
      r++;
    }

    // 合计
    const t = packTotals(list);
    const tr = r + 1;
    ws.getCell(tr, 1).value = 'TOTAL:';
    ws.getCell(tr, 7).value = t.pieces;
    ws.getCell(tr, 10).value = t.cartons;
    ws.getCell(tr, 14).value = t.cbm;
    ws.getCell(tr, 16).value = t.net;
    ws.getCell(tr, 18).value = t.gross;
    for (let c = 1; c <= 19; c++) { ws.getCell(tr, c).font = { bold: true }; ws.getCell(tr, c).border = BORDER; }

    const s = tr + 2;
    ws.getCell(s, 1).value = 'TOTAL GROSS:'; ws.getCell(s, 2).value = t.gross; ws.getCell(s, 3).value = 'KG';
    ws.getCell(s, 15).value = 'TOTAL CARTONS:'; ws.getCell(s, 17).value = t.cartons;
    ws.getCell(s + 1, 1).value = 'TOTAL NET:'; ws.getCell(s + 1, 2).value = t.net; ws.getCell(s + 1, 3).value = 'KG';
    ws.getCell(s + 1, 15).value = 'TOTAL PIECES:'; ws.getCell(s + 1, 17).value = t.pieces;
    ws.getCell(s + 2, 1).value = 'TOTAL VOLUME:'; ws.getCell(s + 2, 2).value = t.cbm; ws.getCell(s + 2, 3).value = 'm3';
    ws.getCell(s + 3, 1).value = 'MADE IN:'; ws.getCell(s + 3, 2).value = head.madeIn;
    for (let i = 0; i <= 3; i++) ws.getCell(s + i, 1).font = { bold: true };
    ws.getCell(s, 15).font = { bold: true };
    ws.getCell(s + 1, 15).font = { bold: true };
  }
  return wb;
}

// ---------------------------------------------------------------- 导出发票 xlsx

/** 发票抬头。默认值同样取自本司真实发票，界面全部可改 */
export interface InvHeader {
  invoiceNo: string;
  invoiceDate: string;
  issuedTo: string;
  issuedToShort: string;
  beneficiaryName: string;
  beneficiaryAddress: string;
  /** 中文开票资料四行：名称 / 税号 / 帐号 / 开户行 */
  bankLines: string[];
  paymentTerms: string;
  originalDocDelivery: string;
  incoterms: string;
  deliveryPort: string;
  latestShipmentDate: string;
  consigneeCountry: string;
  consignee: string;
  /** 明细行右侧两列固定值 */
  deliveryDate: string;
  shipmentFrom: string;
  /** 签名区买方抬头 */
  buyerCompany: string;
}

export const DEFAULT_INV_HEADER: InvHeader = {
  invoiceNo: '',
  invoiceDate: '',
  issuedTo: 'JINJIANG BDS SPORTSWEAR CO., LTD',
  issuedToShort: 'BDS HK',
  beneficiaryName: 'NANJING DATEX FASHION CO.,LTD',
  beneficiaryAddress: 'BUILDING C101, J6 CREATIVE INDUSTRY PARK, NO.6 JIANGJUN AVENUE,NANJING,CHINA',
  bankLines: [
    '名称：南京达泰服装有限公司',
    '税号：91320102593536520X',
    '帐号：01210120030012517',
    '开户行：南京银行大行宫支行',
  ],
  paymentTerms: '30%预付款，开船后90天收到真实有效增值税专用发票后付70%尾款。',
  originalDocDelivery: '21 DAYS AFTER SHIPPING OF GOODS',
  incoterms: 'FOB',
  deliveryPort: 'Rijeka, Croatia',
  latestShipmentDate: '',
  consigneeCountry: 'Serbia',
  consignee: 'SPORT VISION D.O.O. SERBIA',
  deliveryDate: '',
  shipmentFrom: 'SHANGHAI,CHINA',
  buyerCompany: 'JINJIANG BDS SPORTSWEAR CO., LTD',
};

const INV_HEAD = ['PO NAME', 'STYLE CODE', 'STYLE NAME', 'COLOR CODE', 'COMPOSITION', 'GENDER',
  'HS CODE', 'SIZE', 'QTY', 'PRICE', 'AMOUNT', 'BARCODE', 'DELIVERY DATE', 'SHIPMENT FROM', '订单数', '差额'];

/** 生成发票工作簿（每个 PO 一张表，行粒度与 PO 明细一致——发票不经装箱，件数就是订单件数）。
 *  末两列「订单数 / 差额」是真实件里就有的核对列：本工具从 PO 生成，故 QTY 恒等于订单数、差额恒为 0；
 *  真出运短装时人工改 QTY，差额立刻露出来——这正是那两列存在的意义，所以照留。 */
export async function buildInvoiceWorkbook(lines: PoLine[], head: InvHeader): Promise<any> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();

  const byPo = new Map<string, PoLine[]>();
  for (const l of lines) {
    const k = l.poNo || 'PO';
    const g = byPo.get(k);
    if (g) g.push(l); else byPo.set(k, [l]);
  }

  for (const [po, list] of byPo) {
    const ws = wb.addWorksheet(`${po} INV`.replace(/[:\\/?*[\]]/g, '-').slice(0, 31));
    ws.columns = [
      { width: 21 }, { width: 15.5 }, { width: 20 }, { width: 10.5 }, { width: 22.5 }, { width: 9 },
      { width: 9 }, { width: 6.5 }, { width: 6.5 }, { width: 9.5 }, { width: 15 }, { width: 18.5 },
      { width: 12.5 }, { width: 15.5 }, { width: 9 }, { width: 9 },
    ];

    ws.mergeCells('A1:N1');
    const t = ws.getCell('A1');
    t.value = 'INVOICE';
    t.font = { size: 18, bold: true };
    t.alignment = { horizontal: 'center', vertical: 'middle' };

    const kv = (r: number, k: string, v: string) => {
      ws.getCell(r, 1).value = k;
      ws.getCell(r, 1).font = { bold: true };
      ws.getCell(r, 2).value = v;
    };
    kv(3, 'ISSUED TO:', head.issuedTo);
    ws.mergeCells('B3:G4');
    ws.getCell('A4').value = head.issuedToShort;
    kv(5, 'DATE:', head.invoiceDate);
    kv(6, 'INVOICE NO:', head.invoiceNo);
    kv(7, 'NAME OF BENEFICIARY', head.beneficiaryName);
    kv(8, 'ADDRESS OF BENEFICIARY', head.beneficiaryAddress);
    head.bankLines.forEach((line, i) => { ws.getCell(11 + i, 1).value = line; });
    kv(15, 'PAYMENT TERMS', head.paymentTerms);
    kv(16, 'ORIGINAL DOC. DELIVERY', head.originalDocDelivery);
    ws.mergeCells('B16:H16');
    kv(17, 'INCOTERMS:', head.incoterms);
    kv(18, 'DELIVERY PORT:', head.deliveryPort);
    kv(19, 'LATEST SHIPMENT DATE', head.latestShipmentDate);
    kv(20, 'CONSIGNEE:', head.consigneeCountry);
    ws.getCell(20, 3).value = head.consignee;

    const H = 22;
    INV_HEAD.forEach((v, i) => {
      const c = ws.getCell(H, i + 1);
      c.value = v;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = BORDER;
    });

    let r = H + 1;
    for (const l of list) {
      const cells: unknown[] = [
        l.poNo, l.style, l.styleName, l.color, l.composition, l.gender, l.hsCode, l.size,
        l.qty, l.price, r2(l.qty * l.price), l.barcode,
        head.deliveryDate, head.shipmentFrom,
        l.qty, 0, // 订单数 / 差额：本工具由 PO 生成，两者必然相等
      ];
      cells.forEach((v, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = v as any;
        c.border = BORDER;
        c.alignment = { horizontal: i >= 8 && i <= 10 ? 'right' : 'left', vertical: 'middle' };
        if (i === 11) c.numFmt = '@';            // 条码强制文本
        if (i === 9 || i === 10) c.numFmt = '#,##0.00';
      });
      r++;
    }

    const tr = r;
    const qty = list.reduce((s, l) => s + l.qty, 0);
    ws.getCell(tr, 1).value = 'Total:';
    ws.getCell(tr, 9).value = qty;
    ws.getCell(tr, 11).value = r2(list.reduce((s, l) => s + l.qty * l.price, 0));
    ws.getCell(tr, 15).value = qty;
    ws.getCell(tr, 16).value = 0;
    for (let c = 1; c <= 16; c++) { ws.getCell(tr, c).font = { bold: true }; ws.getCell(tr, c).border = BORDER; }
    ws.getCell(tr, 11).numFmt = '#,##0.00';

    ws.getCell(tr + 2, 1).value = 'For & On Behalf of Seller:';
    ws.getCell(tr + 2, 10).value = 'For & On Behalf of Buyer:';
    ws.getCell(tr + 4, 10).value = head.buyerCompany;
    ws.mergeCells(tr + 4, 10, tr + 6, 14);
    ws.getCell(tr + 4, 10).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  return wb;
}

// ---------------------------------------------------------------- 导出装柜计划 xlsx

/** 装柜计划抬头。柜号/卸货港按**收货国**分别填（真实件里这两列正是按国家块合并的） */
export interface LpHeader {
  shippingDocuments: string;
  /** 收货国 → 柜号（'5x40HQ 271568354' 这种） */
  containerByConsignee: Record<string, string>;
  /** 收货国 → 卸货港（'RIJEKA PORT - BELGRADE' 这种） */
  dischargePortByConsignee: Record<string, string>;
  cargoReadyDay: string;
  piEtd: string;
  /** 出口方（真实件里恒为 DATEX） */
  exporter: string;
  /** 加工厂：PO 上没有，留空由人填 */
  maker: string;
  portOfLoading: string;
}

export const DEFAULT_LP_HEADER: LpHeader = {
  shippingDocuments: 'ONE SET \nOF DOC',
  containerByConsignee: {},
  dischargePortByConsignee: {},
  cargoReadyDay: '',
  piEtd: '',
  exporter: 'DATEX',
  maker: '',
  portOfLoading: 'SHANGHAI',
};

const LP_HEAD = ['PURCHASE ORDER NUMBERS', 'STYLE', '', '', 'CONSIGNEE', 'QTY', 'CTNS', 'CBM', 'G.W.', 'N.W.',
  'SHIPPING DOCUMENTS　', 'CONTAINER', 'PORT OF DISCHARGE', 'CARGO READY DAY', 'PI ETD',
  'FACTORY', 'FACTORY', 'PORT OF LOADING'];

/** 生成装柜计划工作簿（一张总表）。
 *  层级与真实件一致：**收货国块 → 定单号块 → 每款号一行**；每个定单号块后一行 PO 小计、
 *  每个收货国块后一行国家小计，最后一行总计。柜号/单证/卸货港在国家块内**纵向合并**成一格。 */
export async function buildLoadingPlanWorkbook(aggs: StyleAgg[], head: LpHeader): Promise<any> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('LOADING PLAN');
  ws.columns = [
    { width: 22 }, { width: 16 }, { width: 10 }, { width: 13 }, { width: 12 }, { width: 9 },
    { width: 8 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 14 }, { width: 24 },
    { width: 24 }, { width: 15 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 16 },
  ];

  LP_HEAD.forEach((v, i) => {
    const c = ws.getCell(1, i + 1);
    if (v) c.value = v;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = BORDER;
  });

  const sum = (rows: StyleAgg[]) => ({
    qty: rows.reduce((s, a) => s + a.qty, 0),
    cartons: rows.reduce((s, a) => s + a.cartons, 0),
    cbm: rv(rows.reduce((s, a) => s + a.cbm, 0)),
    gross: r3(rows.reduce((s, a) => s + a.gross, 0)),
    net: r3(rows.reduce((s, a) => s + a.net, 0)),
  });
  const writeSubtotal = (r: number, rows: StyleAgg[], label: string) => {
    const t = sum(rows);
    ws.getCell(r, 5).value = label;
    [t.qty, t.cartons, t.cbm, t.gross, t.net].forEach((v, i) => { ws.getCell(r, 6 + i).value = v; });
    for (let c = 1; c <= 18; c++) {
      ws.getCell(r, c).font = { bold: true };
      ws.getCell(r, c).border = BORDER;
      ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F1EA' } };
    }
  };

  let r = 2;
  for (const consignee of consigneesOf(aggs)) {
    const inCountry = aggs.filter((a) => (a.consignee || '') === consignee);
    const blockFrom = r;
    for (const po of [...new Set(inCountry.map((a) => a.poNo))]) {
      const inPo = inCountry.filter((a) => a.poNo === po);
      for (const a of inPo) {
        const cells: unknown[] = [
          a.poNo, a.style, a.nameCn, a.hs10, a.consignee || '（未指定）',
          a.qty, a.cartons, a.cbm, a.gross, a.net,
          '', '', '', head.cargoReadyDay, head.piEtd, head.exporter, head.maker, head.portOfLoading,
        ];
        cells.forEach((v, i) => {
          const c = ws.getCell(r, i + 1);
          c.value = v as any;
          c.border = BORDER;
          c.alignment = { horizontal: i >= 5 && i <= 9 ? 'right' : 'left', vertical: 'middle' };
          if (i === 3) c.numFmt = '@'; // 10 位商编是数字串，不强制文本会被转成科学计数法
        });
        r++;
      }
      writeSubtotal(r, inPo, `${po} 小计`);
      r++;
    }
    if (inCountry.length) {
      writeSubtotal(r, inCountry, `${consignee || '未指定收货国'} 合计`);
      r++;
      // 单证/柜号/卸货港在整个国家块内合并成一格（跟真实件一样）
      const vals = [head.shippingDocuments,
        head.containerByConsignee[consignee] ?? '',
        head.dischargePortByConsignee[consignee] ?? ''];
      vals.forEach((v, i) => {
        const col = 11 + i;
        ws.mergeCells(blockFrom, col, r - 1, col);
        const c = ws.getCell(blockFrom, col);
        c.value = v;
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        c.border = BORDER;
      });
    }
  }
  writeSubtotal(r, aggs, '总计');
  return wb;
}

// ---------------------------------------------------------------- 落盘

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function download(wb: any, filename: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: XLSX_MIME }), filename);
}

/** 文件名里不能有的字符一律换成 -（Windows 下带 : 的文件名直接存不下来） */
export const safeName = (s: string): string => s.replace(/[\\/:*?"<>|]/g, '-');

export async function exportPackingList(rows: CartonLine[], head: PlHeader, filename: string): Promise<void> {
  await download(await buildPackingListWorkbook(rows, head), filename);
}

export async function exportInvoice(lines: PoLine[], head: InvHeader, filename: string): Promise<void> {
  await download(await buildInvoiceWorkbook(lines, head), filename);
}

export async function exportLoadingPlan(aggs: StyleAgg[], head: LpHeader, filename: string): Promise<void> {
  await download(await buildLoadingPlanWorkbook(aggs, head), filename);
}
