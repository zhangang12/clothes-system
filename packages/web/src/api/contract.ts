import { http } from './index';
import type { Contract } from '@i9/types';

export const contractApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, { data: any }>('/contracts', { params }),
  get: (id: number) =>
    http.get<unknown, { data: any }>(`/contracts/${id}`),
  getLogs: (id: number) =>
    http.get<unknown, { data: any[] }>(`/contracts/${id}/logs`),
  create: (dto: Record<string, unknown>) =>
    http.post<unknown, { data: Contract }>('/contracts', dto),
  push: (id: number) =>
    http.patch<unknown, { data: Contract }>(`/contracts/${id}/push`),
  approve: (id: number) =>
    http.patch<unknown, { data: Contract }>(`/contracts/${id}/approve`),
  remove: (id: number) =>
    http.delete(`/contracts/${id}`),
};
