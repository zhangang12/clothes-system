import { http } from './index';

export const portalContractApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, { data: any }>('/portal/contracts', { params }),
  get: (id: number) =>
    http.get<unknown, { data: any }>(`/portal/contracts/${id}`),
  stamp: (id: number) =>
    http.patch<unknown, { data: any }>(`/portal/contracts/${id}/stamp`),
  confirmShip: (id: number, dto: { qty?: number; remark?: string; force?: boolean } = {}) =>
    http.patch<unknown, { data: any }>(`/portal/contracts/${id}/ship`, dto),
  uploadInvoice: (id: number, dto: { invoice_no?: string; invoice_amount?: number; invoice_url?: string; remark?: string }) =>
    http.patch(`/portal/contracts/${id}/invoice`, dto),
};
