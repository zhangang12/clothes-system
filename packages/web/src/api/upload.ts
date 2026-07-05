import { http } from './index';

export interface UploadResult {
  url: string;
  relativePath: string;
  originalName: string;
  size: number;
  mimeType: string;
}

export const uploadApi = {
  // 复用后端 /api/v1/uploads 端点（图片/PDF/Excel，≤20MB）
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return http.post<unknown, { data: UploadResult }>('/uploads', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
