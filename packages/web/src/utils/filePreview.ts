// 附件「按 URL 判类型」的公共口径（B021）。
//
// 调用方给预览弹窗的第二个参数是业务标题（「付款水单」「发票 xxx」「对账单」），没有扩展名；
// 此前弹窗拿标题判型，于是全站水单/发票/对账单点「查看」都落到「没法预览」。
// 上传接口返回的地址形如 /api/v1/uploads/file?p=private%2F2026%2F09%2Fxxx.pdf（签名后再带 &t=…），
// 真实文件名在 p 参数里（URL 编码过），解码后取尾段看扩展名；没有 p 的老地址取路径尾段。

export type PreviewKind = 'image' | 'pdf' | 'sheet' | 'other';

/** 从上传地址里解出真实文件名 */
export function fileNameOf(raw: string): string {
  const s = String(raw ?? '');
  const m = /[?&]p=([^&#]+)/.exec(s);
  let path = '';
  if (m) {
    try { path = decodeURIComponent(m[1]); } catch { path = m[1]; }
  } else {
    path = s.split(/[?#]/)[0];
  }
  return path.split('/').pop() || '';
}

export const extOf = (s: string): string => (/\.([a-z0-9]+)$/i.exec(s || '')?.[1] ?? '').toLowerCase();

/** 图片 → 弹窗 <img>；PDF → 弹窗 iframe；.xlsx → 解析成表格；其它（.xls/.docx/…）只能下载 */
export function kindOf(raw: string): PreviewKind {
  const e = extOf(fileNameOf(raw));
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  if (e === 'xlsx') return 'sheet';
  return 'other';
}
