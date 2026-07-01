import { http } from './index';

export const prepaymentApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, any>('/payments/prepayments', { params }),
  getBalance: (factoryId: number) =>
    http.get<unknown, any>('/payments/prepayments/balance', { params: { factory_id: factoryId } }),
  create: (dto: Record<string, unknown>) =>
    http.post<unknown, any>('/payments/prepayments', dto),
};

export const paymentRequestApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, any>('/payments/requests', { params }),
  create: (dto: Record<string, unknown>) =>
    http.post<unknown, any>('/payments/requests', dto),
  submit: (id: number) =>
    http.patch<unknown, any>(`/payments/requests/${id}/submit`),
  approve: (id: number) =>
    http.patch<unknown, any>(`/payments/requests/${id}/approve`),
  reject: (id: number, reason: string) =>
    http.patch<unknown, any>(`/payments/requests/${id}/reject`, { reason }),
  markPaid: (id: number, slipUrl: string) =>
    http.patch<unknown, any>(`/payments/requests/${id}/paid`, { slip_url: slipUrl }),
  remove: (id: number) =>
    http.delete(`/payments/requests/${id}`),
};
