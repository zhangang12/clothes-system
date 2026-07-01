import { http } from './index';
import type { Quotation } from '@i9/types';

export const quoteApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, { data: any }>('/quotes', { params }),
  get: (id: number) =>
    http.get<unknown, { data: Quotation & { items: any[] } }>(`/quotes/${id}`),
  create: (dto: Record<string, unknown>) =>
    http.post<unknown, { data: Quotation }>('/quotes', dto),
  update: (id: number, dto: Record<string, unknown>) =>
    http.put<unknown, { data: Quotation }>(`/quotes/${id}`, dto),
  send: (id: number) =>
    http.patch<unknown, { data: Quotation }>(`/quotes/${id}/send`),
  confirm: (id: number) =>
    http.patch<unknown, { data: Quotation }>(`/quotes/${id}/confirm`),
  toContract: (id: number) =>
    http.patch<unknown, { data: Quotation }>(`/quotes/${id}/to-contract`),
  remove: (id: number) =>
    http.delete(`/quotes/${id}`),
};
