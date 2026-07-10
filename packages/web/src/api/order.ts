import { http } from './index';

export const orderApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, { data: any }>('/orders', { params }),
  get: (id: number) =>
    http.get<unknown, { data: any }>(`/orders/${id}`),
  create: (dto: Record<string, unknown>) =>
    http.post<unknown, { data: any }>('/orders', dto),
  update: (id: number, dto: Record<string, unknown>) =>
    http.put<unknown, { data: any }>(`/orders/${id}`, dto),
  importFromQuote: (id: number, quoteId: number) =>
    http.patch<unknown, { data: any }>(`/orders/${id}/import-quote/${quoteId}`),
  advance: (id: number) =>
    http.patch<unknown, { data: any }>(`/orders/${id}/advance`),
  approve: (id: number) =>
    http.patch<unknown, { data: any }>(`/orders/${id}/approve`),
  addShipment: (id: number, dto: Record<string, unknown>) =>
    http.post<unknown, { data: any }>(`/orders/${id}/shipments`, dto),
  updateMatrix: (id: number, matrix_data: Record<string, unknown>) =>
    http.patch<unknown, { data: any }>(`/orders/${id}/matrix`, { matrix_data }),
  remove: (id: number) =>
    http.delete(`/orders/${id}`),
  // 复制订单(P3#34):主表+用料+矩阵为新草稿
  copy: (id: number) =>
    http.post<unknown, any>(`/orders/${id}/copy`),
};
