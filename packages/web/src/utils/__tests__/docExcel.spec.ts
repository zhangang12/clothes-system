import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildDocXls, sum, n2, d10, val, imgCell, isImageCell, imageSize, type Block } from '../docExcel';
import { exportQuoteExcel } from '../quoteExcel';
import { exportToXlsx, flatten, imageCount, stubImageOk, stubImageFail, stubImageTooBig, pngHeader, jpegHeader, gifHeader } from './xlsxTestKit';

// 抓取写入 Blob 的内容，断言 .xls(HTML) 路径实际写了什么
async function exportedHtml(fn: () => Promise<void> | void): Promise<string> {
  let captured = '';
  const OrigBlob = globalThis.Blob;
  // @ts-expect-error 测试替身
  globalThis.Blob = class { constructor(parts: any[]) { captured = parts.join(''); } };
  try { await fn(); } finally { globalThis.Blob = OrigBlob; }
  return captured;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

// .xls(HTML) 出口仍在服役——对账/付款/结算三张单还走它，下面这组是它的回归网
describe('docExcel 公共层 · HTML 工作表出口', () => {
  it('款号强制文本 + 工作表名进 x:Name（防 Excel 截断款号 / 标签页乱码）', async () => {
    const html = buildDocXls({ sheetName: '报价Q1', title: 'T', blocks: [] });
    expect(html).toContain('mso-number-format');
    expect(html).toContain('<x:Name>报价Q1</x:Name>');
  });

  it('kv 区按 perRow 排版，末行不足时补空单元格（否则 Excel 里表格右边缺一块）', async () => {
    const b: Block = { kind: 'kv', perRow: 2, pairs: [['a', 1], ['b', 2], ['c', 3]] };
    const html = buildDocXls({ sheetName: 's', title: 't', blocks: [b] });
    const rows = html.match(/<tr>(?:(?!<\/tr>).)*<\/tr>/g) ?? [];
    // 标题行 + 2 个数据行；末行 c 之后应补一对空单元格，使每行都是 4 个 td
    const dataRows = rows.filter((r) => /class="k">[abc]</.test(r));
    expect(dataRows).toHaveLength(2);
    for (const r of dataRows) expect((r.match(/<td/g) ?? [])).toHaveLength(4);
  });

  it('table 区无数据时给占位行而不是空表', async () => {
    const b: Block = { kind: 'table', head: ['x', 'y'], rows: [], empty: '（没有）' };
    expect(buildDocXls({ sheetName: 's', title: 't', blocks: [b] })).toContain('（没有）');
  });

  it('HTML 特殊字符转义，不破坏表格结构', async () => {
    const b: Block = { kind: 'table', head: ['h'], rows: [['<script>&"']] };
    const html = buildDocXls({ sheetName: 's', title: 't', blocks: [b] });
    expect(html).toContain('&lt;script&gt;&amp;');
    expect(html).not.toContain('<script>');
  });

  it('图片单元格误走 HTML 路径时退回文字，不能写出 [object Object]', async () => {
    const b: Block = { kind: 'table', head: ['照片'], rows: [[imgCell('/x.png', 96, '图（系统内查看）')]] };
    const html = buildDocXls({ sheetName: 's', title: 't', blocks: [b] });
    expect(html).toContain('图（系统内查看）');
    expect(html).not.toContain('[object Object]');
  });

  it('isImageCell 只认带 img 字符串的对象，别把普通值误判成图', async () => {
    expect(isImageCell(imgCell('/a.png'))).toBe(true);
    expect(isImageCell({ img: 1 })).toBe(false);
    expect(isImageCell('（无明细）')).toBe(false);
    expect(isImageCell(null)).toBe(false);
  });

  // 图片等比缩放全靠这个解析：读错尺寸 = 图被拉扁，正是 8-06 用真实生产照片实测到的问题
  it('imageSize 从字节里读出 PNG/JPEG/GIF 的原始宽高', async () => {
    expect(imageSize(pngHeader(2480, 3508))).toEqual({ w: 2480, h: 3508 });
    expect(imageSize(jpegHeader(1200, 800))).toEqual({ w: 1200, h: 800 });
    expect(imageSize(gifHeader(300, 200))).toEqual({ w: 300, h: 200 });
  });

  it('imageSize 跳过 DHT(0xC4) 这类长得像 SOF 的段，不读出垃圾尺寸', async () => {
    // 真实相机 JPEG 里 DHT 常排在 SOF 前面，按标记范围粗筛会命中它、读出一堆乱数
    expect(imageSize(jpegHeader(640, 480, true))).toEqual({ w: 640, h: 480 });
  });

  it('imageSize 认不出的格式给 null（调用方退回方框尺寸，不崩）', async () => {
    expect(imageSize('bm90IGFuIGltYWdl')).toBeNull();
    expect(imageSize('!!!not base64!!!')).toBeNull();
  });

  it('sum 忽略非数字并消掉浮点尾数', async () => {
    expect(sum([{ v: 0.1 }, { v: 0.2 }, { v: null }, { v: 'x' }], (r) => r.v)).toBe(0.3);
  });

  it('n2/d10/val 对空值给空串而不是 NaN/undefined', async () => {
    expect(n2(null)).toBe('');
    expect(n2('abc')).toBe('');
    expect(d10(null)).toBe('');
    expect(d10('2026-07-16T08:00:00.000Z')).toBe('2026-07-16');
    expect(val(undefined)).toBe('');
    expect(val(0)).toBe('0');
  });
});

describe('报价单导出 Excel（真 .xlsx）', () => {
  const base = {
    quote_no: 'C026063001',
    style_no: 'I27.230.03929',
    middleman_name: 'CTM099',
    buyer_name: 'ARGENTINA 买家',
    profit_rate: 12,
    rmb_total: 45000,
    usd_total: 6923.08,
    items: [
      { part: '面', item_name: '面料A', quote_usage: 1.2, rmb_price: 30, loss_amount: 36 },
      { part: '里', item_name: '里布B', quote_usage: 0.8, rmb_price: 10, loss_amount: 8 },
    ],
  };

  it('款号按文本存，不会被 Excel 当数字截断成 27.23', async () => {
    const { ws } = await exportToXlsx(() => exportQuoteExcel(base));
    expect(flatten(ws)).toContain('I27.230.03929');
    let sawTextFmt = false;
    ws.eachRow((row) => row.eachCell((c) => { if (c.numFmt === '@') sawTextFmt = true; }));
    expect(sawTextFmt).toBe(true);
  });

  it('明细逐行导出并给出含损金额合计', async () => {
    const { ws } = await exportToXlsx(() => exportQuoteExcel(base));
    const all = flatten(ws);
    expect(all).toContain('面料A');
    expect(all).toContain('里布B');
    expect(all).toContain('44.00'); // 36 + 8
  });

  it('业务要求全量不脱敏：中间商/买家/利润率都在导出件里', async () => {
    const all = flatten((await exportToXlsx(() => exportQuoteExcel(base))).ws);
    expect(all).toContain('CTM099');
    expect(all).toContain('ARGENTINA 买家');
    expect(all).toContain('12%');
  });

  it('费用金额 = 单价 × 数量，数量缺省按 1（与 quotePrint 口径一致）', async () => {
    const { ws } = await exportToXlsx(() => exportQuoteExcel({
      ...base,
      fees: [{ fee_name: '快递费', rmb_price: 50 }, { fee_name: '打样费', rmb_price: 100, quote_usage: 2 }],
    }));
    const all = flatten(ws);
    expect(all).toContain('费用明细');
    expect(all).toContain('250.00'); // 50×1 + 100×2
  });

  it('无费用时不输出空的费用明细表', async () => {
    expect(flatten((await exportToXlsx(() => exportQuoteExcel(base))).ws)).not.toContain('费用明细');
  });

  it('无报价明细时给占位而不是空表', async () => {
    const { ws } = await exportToXlsx(() => exportQuoteExcel({ quote_no: 'Q1' }));
    expect(flatten(ws)).toContain('（无报价明细）');
  });

  // ── 款图（8-06 修的正是这条：.xls 里 data: 图 Excel 根本不渲染）──────────
  it('款图真的被打包进 xlsx，而不只是写进单元格文本', async () => {
    stubImageOk();
    const r = await exportToXlsx(() => exportQuoteExcel({ ...base, image1: '/api/v1/uploads/file?p=a.png', image2: '/b.png' }));
    expect(imageCount(r)).toBe(2);
    expect(flatten(r.ws)).toContain('款图/图稿');
  });

  it('款图抓不到时退回可点链接，不让整份报价单导出失败', async () => {
    stubImageFail();
    const r = await exportToXlsx(() => exportQuoteExcel({ ...base, image1: '/gone.png' }));
    expect(imageCount(r)).toBe(0);
    expect(flatten(r.ws)).toContain('图（未内联，点开查看）');
  });

  it('竖图按原比例缩进方框，不被拉扁（真实款图多是竖构图）', async () => {
    stubImageOk(pngHeader(1000, 2000)); // 1:2 竖图，方框 240
    const r = await exportToXlsx(() => exportQuoteExcel({ ...base, image1: '/tall.png' }));
    const ext: any = (r.ws.getImages() as any[])[0].range.ext;
    expect(ext.height).toBe(240);
    expect(ext.width).toBe(120);        // 拉扁的话这里会是 240
  });

  it('横图同样按比例缩，不会被拉高', async () => {
    stubImageOk(jpegHeader(2000, 1000), 'image/jpeg');
    const r = await exportToXlsx(() => exportQuoteExcel({ ...base, image1: '/wide.jpg' }));
    const ext: any = (r.ws.getImages() as any[])[0].range.ext;
    expect(ext.width).toBe(240);
    expect(ext.height).toBe(120);
  });

  it('文件名用 .xlsx 后缀（换格式后别再发 .xls，否则 Excel 报「格式与扩展名不符」）', async () => {
    const { name } = await exportToXlsx(() => exportQuoteExcel(base));
    expect(name).toMatch(/\.xlsx$/);
    expect(name).toContain('C026063001');
  });

  it('超 2MB 的图不硬塞进文件，退回链接', async () => {
    stubImageTooBig();
    const r = await exportToXlsx(() => exportQuoteExcel({ ...base, image1: '/huge.png' }));
    expect(imageCount(r)).toBe(0);
    expect(flatten(r.ws)).toContain('图（未内联，点开查看）');
  });
});
