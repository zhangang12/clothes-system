import { http } from '@/api';

// 敏感附件(身份证/水单/发票等,存 private/ 子目录)读取须短时签名令牌(总览走查P0#7)
const privatePathOf = (url: string): string | null => {
  const m = /[?&]p=([^&]+)/.exec(url || '');
  if (!m) return null;
  const p = decodeURIComponent(m[1]);
  return p.startsWith('private/') ? p : null;
};

/** 是否敏感附件（private/ 目录）：裸 URL 直接放进 <img>/<a> 必 403 */
export const isPrivateFile = (url: string): boolean => privatePathOf(url) !== null;

// 公共文件原样返回;敏感附件换取带令牌的短时链接(5分钟)
export async function signedUrl(url: string): Promise<string> {
  const p = privatePathOf(url);
  if (!p) return url;
  const res: any = await http.get('/uploads/sign', { params: { p } });
  return res?.data?.url ?? res?.url ?? url;
}

/**
 * 新标签页打开（可能需要签名的）文件。
 *
 * 【为什么先开空窗再换地址】签名是一次网络请求，`await` 之后再 window.open 已脱离用户点击手势，
 * Safari / Firefox 以及开了拦截的国产浏览器会把它当弹窗拦掉——用户点了没反应（B090）。
 * 在点击的同步阶段先 window.open 一个空白页占住手势，签名回来再把地址替换进去；
 * 取不到链接就把空窗关掉，不留一个 about:blank。
 */
export async function openFile(url: string) {
  if (!url) return;
  const win = window.open('about:blank', '_blank');
  try {
    const u = await signedUrl(url);
    if (win && !win.closed) {
      win.opener = null;
      win.location.replace(u);
    } else {
      window.open(u, '_blank', 'noopener'); // 被拦下时再试一次（Chrome 的手势窗口通常还在）
    }
  } catch (e) {
    win?.close();
    throw e;
  }
}
