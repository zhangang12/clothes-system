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
  // 历史同款价提示(P3#41)
  priceHint: (styleNo: string, itemName?: string) =>
    http.get<unknown, { data: any[] }>('/contracts/price-hint', { params: { style_no: styleNo, ...(itemName ? { item_name: itemName } : {}) } }),
  // 按订单材料供应商拆单批量生成材料合同（设计稿 合同 A1 主流程入口）
  generateFromOrder: (orderId: number) =>
    http.post<unknown, { data: { created: number; contracts: any[]; unmatched: string[] } }>(`/contracts/generate-from-order/${orderId}`),
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
