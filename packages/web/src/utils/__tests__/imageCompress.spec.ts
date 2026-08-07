import { describe, it, expect, vi, afterEach } from 'vitest';
import { fitScale, shouldCompress, compressImage, MAX_EDGE, SKIP_UNDER } from '../imageCompress';

// jsdom 没有 canvas 实现（getContext 返回 null / 无 toBlob），所以 compressImage 在这里
// 必然走"退回原图"那条路——这正是要守住的性质：压缩是锦上添花，绝不能让图传不上去。
// 真正的缩放算术抽成了 fitScale/shouldCompress 两个纯函数，在这儿逐条验。

const mkFile = (size: number, type = 'image/jpeg', name = 'a.jpg'): File => {
  const f = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('fitScale 等比缩放系数', () => {
  it('长边超过上限时按长边缩', () => {
    expect(fitScale(4000, 3000, 2000)).toBe(0.5);   // 横图按宽
    expect(fitScale(3000, 6000, 2000)).toBeCloseTo(1 / 3); // 竖图按高
  });

  it('本来就不大就不动——只压画质不放大（放大既糊又更占体积）', () => {
    expect(fitScale(800, 600, 2000)).toBe(1);
    expect(fitScale(2000, 2000, 2000)).toBe(1);
  });

  it('尺寸异常时退回 1，不产生 NaN/0 的画布', () => {
    expect(fitScale(0, 0, 2000)).toBe(1);
    expect(fitScale(NaN, 100, 2000)).toBe(1);
  });

  it('默认上限是 2000（样衣照片/图稿看款式与工艺够用，也够打印）', () => {
    expect(MAX_EDGE).toBe(2000);
    expect(fitScale(4000, 1000)).toBe(0.5);
  });
});

describe('shouldCompress 该不该压', () => {
  it('大图才压', () => {
    expect(shouldCompress(mkFile(8 * 1024 * 1024))).toBe(true);
    expect(shouldCompress(mkFile(200 * 1024))).toBe(false);
  });

  it('阈值以下原样上传：截图/已压过的图别再压一道白掉画质', () => {
    expect(shouldCompress(mkFile(SKIP_UNDER))).toBe(false);
    expect(shouldCompress(mkFile(SKIP_UNDER + 1))).toBe(true);
  });

  it('只认 jpeg/png/webp——PDF、Excel 这些附件绝不能被当图片重编码', () => {
    expect(shouldCompress(mkFile(9 * 1024 * 1024, 'application/pdf', 'a.pdf'))).toBe(false);
    expect(shouldCompress(mkFile(9 * 1024 * 1024, 'application/vnd.ms-excel', 'a.xls'))).toBe(false);
    expect(shouldCompress(mkFile(9 * 1024 * 1024, 'image/png', 'a.png'))).toBe(true);
    expect(shouldCompress(mkFile(9 * 1024 * 1024, 'image/webp', 'a.webp'))).toBe(true);
  });

  it('gif 不压——动图重编码只会剩一帧', () => {
    expect(shouldCompress(mkFile(9 * 1024 * 1024, 'image/gif', 'a.gif'))).toBe(false);
  });
});

describe('compressImage 兜底行为', () => {
  it('不该压的文件原样返回（同一个对象，没有多余拷贝）', async () => {
    const f = mkFile(100 * 1024);
    expect(await compressImage(f)).toBe(f);
  });

  it('canvas 不可用时退回原图，绝不让上传失败', async () => {
    const f = mkFile(8 * 1024 * 1024);
    // jsdom 的 getContext 本就返回 null；显式打桩把意图写死，防哪天换了环境静默改行为
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as any);
    expect(await compressImage(f)).toBe(f);
  });

  it('解码抛错时退回原图', async () => {
    const f = mkFile(8 * 1024 * 1024);
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('boom')));
    expect(await compressImage(f)).toBe(f);
  });

  it('压完反而更大就用原图（高压缩比的小图重编码会变胖）', async () => {
    const f = mkFile(2 * 1024 * 1024);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 100, height: 100, close: vi.fn() }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(), drawImage: vi.fn(), set fillStyle(_v: string) {},
    } as any);
    // 造一个"压完更大"的结果
    (HTMLCanvasElement.prototype as any).toBlob = (cb: any) => cb({ size: 9 * 1024 * 1024 });
    expect(await compressImage(f)).toBe(f);
  });

  it('压缩成功时给出更小的 .jpg（扩展名必须跟着变，否则后端按 magic bytes 判出 jpeg、名字却是 png）', async () => {
    const f = mkFile(8 * 1024 * 1024, 'image/png', '照片.png');
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(), drawImage: vi.fn(), set fillStyle(_v: string) {},
    } as any);
    (HTMLCanvasElement.prototype as any).toBlob = (cb: any) => cb(new Blob([new Uint8Array(1024)], { type: 'image/jpeg' }));
    const out = await compressImage(f);
    expect(out).not.toBe(f);
    expect(out.name).toBe('照片.jpg');
    expect(out.type).toBe('image/jpeg');
    expect(out.size).toBeLessThan(f.size);
  });
});
