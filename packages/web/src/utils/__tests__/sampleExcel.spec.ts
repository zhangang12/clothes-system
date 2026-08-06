import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { exportSampleExcel } from '../sampleExcel';

// 导出的是真 .xlsx（zip 二进制），字符串匹配没意义——直接把生成的文件用 exceljs 读回来断言，
// 这样验的是最终产物本身（含图片是否真被打包进去），而不是我们拼出来的中间字符串。
async function exportAndRead(detail: any): Promise<{ ws: ExcelJS.Worksheet; wb: ExcelJS.Workbook; name: string }> {
  let captured: any = null;
  let name = '';
  const OrigBlob = globalThis.Blob;
  // @ts-expect-error 测试替身：只截住写进 Blob 的 buffer
  globalThis.Blob = class { constructor(parts: any[]) { captured = parts[0]; } };
  const OrigClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { name = this.download; };
  try { await exportSampleExcel(detail); } finally {
    globalThis.Blob = OrigBlob;
    HTMLAnchorElement.prototype.click = OrigClick;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(captured);
  return { ws: wb.worksheets[0], wb, name };
}

/** 把整张表的文本铺平，便于「含某内容」这类断言 */
function flatten(ws: ExcelJS.Worksheet): string {
  const out: string[] = [];
  ws.eachRow((row) => row.eachCell((c) => out.push(String(c.text ?? ''))));
  return out.join('|');
}

// 1×1 透明 PNG
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const base = {
  sample_no: 'S-20260715-001',
  style_no: 'I27.230.03929',
  categories: '上衣,外套',
  materials: [{ item_name: '面料A', qty: 3, supplier_name: '苏州市坤业纺织有限公司' }],
};

const rounds = [
  { round_no: 1, size: 'M', qty: 2, ship_date: '2026-07-08', ship_no: 'FH-001', return_date: '2026-07-10', labor_unit_price: 30, labor_amount: 60 },
  { round_no: 2, size: 'L', qty: 3, ship_date: '2026-07-12', ship_no: 'FH-002', return_date: '2026-07-14', labor_unit_price: 30, labor_amount: 90 },
];

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.restoreAllMocks();
});

describe('样衣导出 Excel（真 .xlsx）', () => {
  it('款号按文本存，不会被 Excel 当数字截断成 27.23', async () => {
    const { ws } = await exportAndRead(base);
    expect(flatten(ws)).toContain('I27.230.03929');
    // 文本格式必须落到单元格上，否则 Excel 打开时照样按数字解析
    let sawTextFmt = false;
    ws.eachRow((row) => row.eachCell((c) => { if (c.numFmt === '@') sawTextFmt = true; }));
    expect(sawTextFmt).toBe(true);
  });

  it('基本信息与材料明细都在表里', async () => {
    const { ws } = await exportAndRead(base);
    const all = flatten(ws);
    expect(all).toContain('S-20260715-001');
    expect(all).toContain('上衣 / 外套');
    expect(all).toContain('面料A');
    expect(all).toContain('苏州市坤业纺织有限公司');
  });

  it('多轮寄样：每轮的尺码/单号/工价都进导出，并给出合计', async () => {
    const { ws } = await exportAndRead({ ...base, shipRounds: rounds });
    const all = flatten(ws);
    expect(all).toContain('FH-001');
    expect(all).toContain('FH-002');
    expect(all).toContain('5');    // 件数合计 2+3
    expect(all).toContain('150');  // 工价合计 60+90
  });

  it('照片真的被打包进 xlsx（这正是 8-06 反馈「下载后没有图片」的症结）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => ({ size: 1024, type: 'image/png' }),
    }));
    // FileReader 在 jsdom 里读不了假 blob，直接打桩成返回 data URI
    class FR {
      onload: any; onerror: any; result = `data:image/png;base64,${PNG_1PX}`;
      readAsDataURL() { setTimeout(() => this.onload?.(), 0); }
    }
    vi.stubGlobal('FileReader', FR as any);

    const { wb, ws } = await exportAndRead({ ...base, image1: '/api/v1/uploads/file?p=a.png' });
    expect(wb.model.media?.length ?? 0).toBeGreaterThan(0);   // 媒体真进了 zip
    expect((ws.getImages?.() ?? []).length).toBeGreaterThan(0); // 且锚定到了工作表
    expect(flatten(ws)).toContain('样衣照片/图稿');
  });

  it('图片抓取失败时退回可点链接，不让整个导出失败', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const { ws, wb } = await exportAndRead({ ...base, image1: '/api/v1/uploads/file?p=gone.png' });
    expect(wb.model.media?.length ?? 0).toBe(0);
    expect(flatten(ws)).toContain('图（未内联，点开查看）');
  });

  it('文件名用 .xlsx 后缀（换格式后别再发 .xls，否则 Excel 会报「格式与扩展名不符」）', async () => {
    const { name } = await exportAndRead(base);
    expect(name).toMatch(/\.xlsx$/);
    expect(name).toContain('S-20260715-001');
  });

  it('无材料明细也能正常导出', async () => {
    const { ws } = await exportAndRead({ ...base, materials: [] });
    expect(flatten(ws)).toContain('（无材料明细）');
  });
});
