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
  stats: () =>
    http.get<unknown, any>('/settlements/stats'),
  // 从出口发票同步收汇(Q12/Q3)
  pullInvoiceReceipts: (id: number) =>
    http.patch<unknown, any>(`/settlements/${id}/pull-invoice-receipts`),
  // 款号/订单累计汇总(Q18 分批结算)
  aggregate: (params: { style_no?: string; order_id?: number }) =>
    http.get<unknown, any>('/settlements/aggregate', { params }),
  refundReceived: (id: number, amount?: number) =>
    http.patch<unknown, any>(`/settlements/${id}/refund-received`, amount != null ? { amount } : {}),
  reopen: (id: number) =>
    http.patch<unknown, any>(`/settlements/${id}/reopen`),
  changeLogs: (id: number) =>
    http.get<unknown, any>('/change-logs', { params: { biz_type: 'SETTLEMENT', biz_id: id } }),
  confirm: (id: number) =>
    http.patch<unknown, any>(`/settlements/${id}/confirm`),
  remove: (id: number) =>
    http.delete(`/settlements/${id}`),
};
