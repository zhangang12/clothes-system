import { http } from './index';
import type { Quotation } from '@i9/types';

export const quoteApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, { data: any }>('/quotes', { params }),
  get: (id: number) =>
    http.get<unknown, { data: any }>(`/quotes/${id}`),
  create: (dto: Record<string, unknown>) =>
    http.post<unknown, { data: Quotation }>('/quotes', dto),
  update: (id: number, dto: Record<string, unknown>) =>
    http.put<unknown, { data: Quotation }>(`/quotes/${id}`, dto),
  importFromSample: (id: number, sampleId: number) =>
    http.patch<unknown, { data: Quotation }>(`/quotes/${id}/import-sample/${sampleId}`),
  submit: (id: number) =>
    http.patch<unknown, { data: Quotation }>(`/quotes/${id}/submit`),
  approve: (id: number) =>
    http.patch<unknown, { data: Quotation }>(`/quotes/${id}/approve`),
  adjust: (id: number) =>
    http.patch<unknown, { data: Quotation }>(`/quotes/${id}/adjust`),
  // 报价历史迁移导入(P3#43)
  importBatch: (rows: any[]) =>
    http.post<unknown, any>('/quotes/import', { rows }),
  toContract: (id: number) =>
    http.patch<unknown, { data: Quotation }>(`/quotes/${id}/to-contract`),
  copy: (id: number, withItems = true) =>
    http.post<unknown, { data: Quotation }>(`/quotes/${id}/copy`, { with_items: withItems }),
  remove: (id: number) =>
    http.delete(`/quotes/${id}`),
};
