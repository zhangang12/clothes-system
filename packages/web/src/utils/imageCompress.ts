// 上传前把大图压小 —— 用户反馈 2026-08-07 Grace：「上传图片超级慢，点上传至少要等 1-2 分钟才能出来」。
//
// 【为什么断定瓶颈在图本身，不在服务器】同日实测：往生产传 2MB 只要 2.9 秒（≈665KB/s），
// 后端 upload 也只是 multer 落盘、没有任何图像处理。而手机/相机原图普遍 3-10MB
// （上传上限 20MB，全都放得进来），在办公室那种上行窄的网络下，一张 8MB 的原图正好是
// 「1-2 分钟」这个量级。**传的是整张原图**才是真原因，压到几百 KB 就从分钟级回到秒级。
//
// 【尺寸口径】样衣照片/图稿是给人看款式和工艺的，长边 2000px 足够（打印也够）；
// 小于 1.5MB 的一律原样上传——截图、已经压过的图不该被再压一道白掉画质。
//
// 【为什么统一输出 JPEG】只有超过 1.5MB 的才会走到这里，那种体量基本是照片/高清扫描件，
// JPEG 的压缩比远好于 PNG。**代价**：带透明通道的 PNG 转 JPEG 会把透明填成黑色——
// 样衣照片/图稿没有透明需求，且小图根本不会进来，权衡后接受。
//
// 【一切失败都退回原图】canvas 在某些环境（含单测的 jsdom）不可用；压完反而更大也退回。
// 压缩是"锦上添花"，绝不能因为它让本来能传的图传不上去。

export const MAX_EDGE = 2000;
export const SKIP_UNDER = 1.5 * 1024 * 1024;
const QUALITY = 0.85;

/** 等比缩放系数：长边超过 maxEdge 才缩，否则保持原尺寸（只压画质不放大） */
export function fitScale(w: number, h: number, maxEdge: number = MAX_EDGE): number {
  const longest = Math.max(w, h);
  if (!Number.isFinite(longest) || longest <= 0) return 1;
  return longest > maxEdge ? maxEdge / longest : 1;
}

/** 这个文件该不该压：非图片、体积本来就小的都放过 */
export function shouldCompress(file: File, skipUnder: number = SKIP_UNDER): boolean {
  if (!file || typeof file.type !== 'string') return false;
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return false; // gif 动图压了会只剩一帧
  return file.size > skipUnder;
}

/** 解码成可画到 canvas 的位图；拿不到就返回 null（调用方退回原图） */
async function decode(file: File): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close?.() };
    } catch { /* 退到 Image */ }
  }
  if (typeof Image !== 'function' || typeof URL?.createObjectURL !== 'function') return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = url;
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/**
 * 压缩后的新 File；任何一步不成立都原样返回入参（调用方无需判空）。
 * 文件名统一换成 .jpg，否则后端按 magic bytes 判出 jpeg、扩展名却写着 png，对不上。
 */
export async function compressImage(file: File, maxEdge: number = MAX_EDGE): Promise<File> {
  if (!shouldCompress(file)) return file;
  let handle: Awaited<ReturnType<typeof decode>> = null;
  try {
    handle = await decode(file);
    if (!handle || !handle.w || !handle.h) return file;

    const k = fitScale(handle.w, handle.h, maxEdge);
    const cw = Math.max(1, Math.round(handle.w * k));
    const ch = Math.max(1, Math.round(handle.h * k));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.toBlob !== 'function') return file; // jsdom 等无 canvas 实现
    // 透明底转 JPEG 会变黑，先铺白底
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(handle.src, 0, 0, cw, ch);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    // 压完反而更大（本来就是高压缩比的小图被放大重编码）就用原图
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    handle?.done();
  }
}
