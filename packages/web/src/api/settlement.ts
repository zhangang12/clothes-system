import { http } from './index';

export const settlementApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, any>('/settlements', { params }),
  get: (id: number) =>
    http.get<unknown, any>(`/settlements/${id}`),
  create: (dto: Record<string, unknown>) =>
    http.post<unknown, any>('/settlements', dto),
  update: (id: number, dto: Record<string, unknown>) =>
    http.patch<unknown, any>(`/settlements/${id}`, dto),
  addCost: (id: number, dto: Record<string, unknown>) =>
    http.post<unknown, any>(`/settlements/${id}/costs`, dto),
  removeCost: (id: number, costId: number) =>
    http.delete<unknown, any>(`/settlements/${id}/costs/${costId}`),
  addReceipt: (id: number, dto: Record<string, unknown>) =>
    http.post<unknown, any>(`/settlements/${id}/receipts`, dto),
  removeReceipt: (id: number, receiptId: number) =>
    http.delete<unknown, any>(`/settlements/${id}/receipts/${receiptId}`),
  refreshCost: (id: number) =>
    http.patch<unknown, any>(`/settlements/${id}/refresh-cost`),
  reopen: (id: number) =>
    http.patch<unknown, any>(`/settlements/${id}/reopen`),
  changeLogs: (id: number) =>
    http.get<unknown, any>('/change-logs', { params: { biz_type: 'SETTLEMENT', biz_id: id } }),
  confirm: (id: number) =>
    http.patch<unknown, any>(`/settlements/${id}/confirm`),
  remove: (id: number) =>
    http.delete(`/settlements/${id}`),
};
