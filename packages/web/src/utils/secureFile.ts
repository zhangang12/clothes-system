import { http } from '@/api';

// 敏感附件(身份证/水单/发票等,存 private/ 子目录)读取须短时签名令牌(总览走查P0#7)
const privatePathOf = (url: string): string | null => {
  const m = /[?&]p=([^&]+)/.exec(url || '');
  if (!m) return null;
  const p = decodeURIComponent(m[1]);
  return p.startsWith('private/') ? p : null;
};

// 公共文件原样返回;敏感附件换取带令牌的短时链接(5分钟)
export async function signedUrl(url: string): Promise<string> {
  const p = privatePathOf(url);
  if (!p) return url;
  const res: any = await http.get('/uploads/sign', { params: { p } });
  return res?.data?.url ?? res?.url ?? url;
}

export async function openFile(url: string) {
  if (!url) return;
  window.open(await signedUrl(url), '_blank');
}
