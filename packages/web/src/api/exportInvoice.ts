import { http } from './index';

// 出口发票/收汇子模块(结算Q12):订单→发票→逐笔收汇留痕;拼柜按款项金额占比分摊(Q3)
export const exportInvoiceApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, any>('/export-invoices', { params }),
  get: (id: number) =>
    http.get<unknown, any>(`/export-invoices/${id}`),
  create: (dto: Record<string, unknown>) =>
    http.post<unknown, any>('/export-invoices', dto),
  addReceipt: (id: number, dto: Record<string, unknown>) =>
    http.post<unknown, any>(`/export-invoices/${id}/receipts`, dto),
  removeReceipt: (id: number, receiptId: number) =>
    http.delete(`/export-invoices/${id}/receipts/${receiptId}`),
  remove: (id: number) =>
    http.delete(`/export-invoices/${id}`),
};
