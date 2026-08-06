// 导出类测试的公共夹具（**不是 spec 文件，vitest 不会当用例跑**）。
//
// 导出的是真 .xlsx（zip 二进制），字符串匹配没意义——统一把生成的文件用 exceljs 读回来断言，
// 验的是最终产物本身（含图片是否真被打包进 zip），而不是我们拼出来的中间字符串。
import { vi } from 'vitest';
import ExcelJS from 'exceljs';

/** 1×1 透明 PNG */
export const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export interface XlsxResult { wb: ExcelJS.Workbook; ws: ExcelJS.Worksheet; name: string }

/** 跑一次导出，截住写进 Blob 的 buffer 与 <a download> 的文件名，再把 xlsx 读回来 */
export async function exportToXlsx(run: () => Promise<void> | void): Promise<XlsxResult> {
  let captured: any = null;
  let name = '';
  const OrigBlob = globalThis.Blob;
  // @ts-expect-error 测试替身：只截住写进 Blob 的 buffer
  globalThis.Blob = class { constructor(parts: any[]) { captured = parts[0]; } };
  const OrigClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { name = this.download; };
  try { await run(); } finally {
    globalThis.Blob = OrigBlob;
    HTMLAnchorElement.prototype.click = OrigClick;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(captured);
  return { wb, ws: wb.worksheets[0], name };
}

/** 把整张表的文本铺平，便于「含某内容」这类断言 */
export function flatten(ws: ExcelJS.Worksheet): string {
  const out: string[] = [];
  ws.eachRow((row) => row.eachCell((c) => out.push(String(c.text ?? ''))));
  return out.join('|');
}

/** 表里真嵌进去的图片张数（媒体条目 + 锚定到工作表，缺一不可） */
export function imageCount(r: XlsxResult): number {
  const media = r.wb.model.media?.length ?? 0;
  const anchored = r.ws.getImages?.().length ?? 0;
  return Math.min(media, anchored);
}

/** 打桩「图片抓得到」：jsdom 的 FileReader 读不了假 blob，直接让它回一个 data URI。
 *  传 body 可指定图像字节（配合下面的 pngHeader/jpegHeader 造指定尺寸的图，用来验等比缩放） */
export function stubImageOk(body: string = PNG_1PX, mime = 'image/png'): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    blob: async () => ({ size: 1024, type: mime }),
  }));
  class FR {
    onload: any; onerror: any; result = `data:${mime};base64,${body}`;
    readAsDataURL() { setTimeout(() => this.onload?.(), 0); }
  }
  vi.stubGlobal('FileReader', FR as any);
}

const b64 = (bytes: number[]): string => btoa(String.fromCharCode(...bytes));

/** 合成 PNG 文件头（imageSize 只读 IHDR 里的宽高，头部就够） */
export const pngHeader = (w: number, h: number): string => b64([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  (w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255,
  (h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255,
]);

/** 合成 JPEG：FFD8 [+ DHT 干扰段] + SOF0。withDht 用来验「不把 0xC4 误当 SOF」 */
export const jpegHeader = (w: number, h: number, withDht = false): string => {
  const b: number[] = [0xff, 0xd8];
  if (withDht) b.push(0xff, 0xc4, 0x00, 0x06, 1, 2, 3, 4); // 段长 6 = 2 字节长度 + 4 字节负载
  b.push(0xff, 0xc0, 0x00, 0x11, 8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255);
  while (b.length < 32) b.push(0); // imageSize 的扫描要求 i+9 < length
  return b64(b);
};

/** 合成 GIF：'GIF89a' + 小端宽高 */
export const gifHeader = (w: number, h: number): string => b64([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 255, (w >> 8) & 255, h & 255, (h >> 8) & 255, 0, 0, 0,
]);

/** 打桩「图片抓不到」（404 / 删档 / 断网） */
export function stubImageFail(): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
}

/** 打桩「图片超 2MB」——公共层的体积闸门，应退回链接而不是硬塞进文件 */
export function stubImageTooBig(): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    blob: async () => ({ size: 3 * 1024 * 1024, type: 'image/png' }),
  }));
}
