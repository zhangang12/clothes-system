import { http } from './index';

export interface UploadResult {
  url: string;
  relativePath: string;
  originalName: string;
  size: number;
  mimeType: string;
}

export const uploadApi = {
  // 复用后端 /api/v1/uploads 端点（供应商 JWT 通过 JwtAuthGuard）
  upload: (file: File, opts?: { sensitive?: boolean }) => {
    const fd = new FormData();
    fd.append('file', file);
    return http.post<unknown, { data: UploadResult }>(opts?.sensitive ? '/uploads?sensitive=1' : '/uploads', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
