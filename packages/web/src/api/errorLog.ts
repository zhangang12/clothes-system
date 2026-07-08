import { http } from './index';

export const errorLogApi = {
  list: (params?: { page?: number; size?: number; status?: string }) =>
    http.get<unknown, any>('/error-logs', { params }),
  get: (id: number) => http.get<unknown, any>(`/error-logs/${id}`),
  markHandled: (id: number, handled: boolean) =>
    http.patch<unknown, any>(`/error-logs/${id}/handled`, { handled }),
};

/** 导出 HTML(带鉴权头,绕过 JSON 响应拦截器) */
export async function downloadHtml(path: string, filename: string) {
  const res = await fetch(`/api/v1${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
  });
  if (!res.ok) throw new Error(`导出失败 (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
