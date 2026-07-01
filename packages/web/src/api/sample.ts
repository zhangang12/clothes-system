import { http } from './index';
import type { SampleGarment } from '@i9/types';

export const sampleApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, { data: any }>('/samples', { params }),
  get: (id: number) =>
    http.get<unknown, { data: SampleGarment }>(`/samples/${id}`),
  getVersionHistory: (id: number) =>
    http.get<unknown, { data: any[] }>(`/samples/${id}/versions`),
  create: (dto: Record<string, unknown>) =>
    http.post<unknown, { data: SampleGarment }>('/samples', dto),
  update: (id: number, dto: Record<string, unknown>) =>
    http.put<unknown, { data: SampleGarment }>(`/samples/${id}`, dto),
  assign: (id: number, patternmaker_id: number) =>
    http.patch<unknown, { data: SampleGarment }>(`/samples/${id}/assign`, { patternmaker_id }),
  submit: (id: number, data: { remark?: string; attachments?: string[] }) =>
    http.patch<unknown, { data: SampleGarment }>(`/samples/${id}/submit`, data),
  reject: (id: number, reject_reason: string) =>
    http.patch<unknown, { data: SampleGarment }>(`/samples/${id}/reject`, { reject_reason }),
  confirm: (id: number) =>
    http.patch<unknown, { data: SampleGarment }>(`/samples/${id}/confirm`),
  remove: (id: number) =>
    http.delete(`/samples/${id}`),
};
