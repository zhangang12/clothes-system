import { http } from './index';

export interface UploadResult {
  url: string;
  relativePath: string;
  originalName: string;
  size: number;
  mimeType: string;
}

/** 上传单独给更长的超时：后端允许 20MB 的 PDF/Excel，走全局 15 秒必报「上传失败」、
 *  而服务端其实可能已经落盘成孤儿文件（B089）。只放宽上传这一条请求，不动全局。 */
export const UPLOAD_TIMEOUT_MS = 120_000;

export const uploadApi = {
  // 复用后端 /api/v1/uploads 端点（图片/PDF/Excel，≤20MB）
  upload: (file: File, opts?: { sensitive?: boolean }) => {
    const fd = new FormData();
    fd.append('file', file);
    return http.post<unknown, { data: UploadResult }>(opts?.sensitive ? '/uploads?sensitive=1' : '/uploads', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT_MS,
    });
  },
};
