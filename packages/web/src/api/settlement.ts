import { http } from './index';

export const settlementApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, any>('/settlements', { params }),
  get: (id: number) =>
    http.get<unknown, any>(`/settlements/${id}`),
  create: (dto: Record<string, unknown>) =>
    http.post<unknown, any>('/settlements', dto),
  addCost: (id: number, dto: Record<string, unknown>) =>
    http.post<unknown, any>(`/settlements/${id}/costs`, dto),
  addReceipt: (id: number, dto: Record<string, unknown>) =>
    http.post<unknown, any>(`/settlements/${id}/receipts`, dto),
  confirm: (id: number) =>
    http.patch<unknown, any>(`/settlements/${id}/confirm`),
  remove: (id: number) =>
    http.delete(`/settlements/${id}`),
};
