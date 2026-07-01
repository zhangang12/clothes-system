import { http } from './index';

export const reconciliationApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, any>('/reconciliations', { params }),
  get: (id: number) =>
    http.get<unknown, any>(`/reconciliations/${id}`),
  create: (dto: Record<string, unknown>) =>
    http.post<unknown, any>('/reconciliations', dto),
  confirm: (id: number) =>
    http.patch<unknown, any>(`/reconciliations/${id}/confirm`),
  remove: (id: number) =>
    http.delete(`/reconciliations/${id}`),
};
