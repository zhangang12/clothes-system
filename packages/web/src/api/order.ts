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
  advance: (id: number) =>
    http.patch<unknown, { data: any }>(`/orders/${id}/advance`),
  addShipment: (id: number, dto: Record<string, unknown>) =>
    http.post<unknown, { data: any }>(`/orders/${id}/shipments`, dto),
  updateMatrix: (id: number, matrix_data: Record<string, unknown>) =>
    http.patch<unknown, { data: any }>(`/orders/${id}/matrix`, { matrix_data }),
  remove: (id: number) =>
    http.delete(`/orders/${id}`),
};
