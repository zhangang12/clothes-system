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
  adjust: (id: number) =>
    http.patch<unknown, { data: Quotation }>(`/quotes/${id}/adjust`),
  toContract: (id: number) =>
    http.patch<unknown, { data: Quotation }>(`/quotes/${id}/to-contract`),
  copy: (id: number) =>
    http.post<unknown, { data: Quotation }>(`/quotes/${id}/copy`),
  remove: (id: number) =>
    http.delete(`/quotes/${id}`),
};
