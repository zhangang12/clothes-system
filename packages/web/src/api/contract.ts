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
  update: (id: number, dto: Record<string, unknown>) =>
    http.patch<unknown, { data: Contract }>(`/contracts/${id}`, dto),
  push: (id: number) =>
    http.patch<unknown, { data: Contract }>(`/contracts/${id}/push`),
  recall: (id: number) =>
    http.patch<unknown, { data: Contract }>(`/contracts/${id}/recall`),
  approve: (id: number) =>
    http.patch<unknown, { data: Contract }>(`/contracts/${id}/approve`),
  // 发货批次业务审批（通过后供应商门户方可勾选该批次对账，设计稿 门户 B2）
  approveShipment: (id: number, sid: number, approve: boolean) =>
    http.patch<unknown, { data: any }>(`/contracts/${id}/shipments/${sid}/approval`, { approve }),
  remove: (id: number) =>
    http.delete(`/contracts/${id}`),
};
