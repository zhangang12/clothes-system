import { http } from './index';

export const portalContractApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, { data: any }>('/portal/contracts', { params }),
  get: (id: number) =>
    http.get<unknown, { data: any }>(`/portal/contracts/${id}`),
  stamp: (id: number, agreed = true) =>
    http.patch<unknown, { data: any }>(`/portal/contracts/${id}/stamp`, { agreed }),
  confirmShip: (id: number, dto: { qty?: number; remark?: string; force?: boolean; express_company?: string; express_no?: string; attach_url?: string } = {}) =>
    http.patch<unknown, { data: any }>(`/portal/contracts/${id}/ship`, dto),
  // 我要对账：勾选已审批发货批次生成对账单并推业务复核（设计稿 05 §C）
  createReconcile: (id: number, shipment_ids: number[]) =>
    http.patch<unknown, { data: any }>(`/portal/contracts/${id}/reconcile`, { shipment_ids }),
  uploadInvoice: (id: number, dto: { invoice_no?: string; invoice_amount?: number; invoice_url?: string; remark?: string }) =>
    http.patch(`/portal/contracts/${id}/invoice`, dto),
  // 发货完成（门户C3）：宣布后开票即闭环「已完成」
  shipDone: (id: number) =>
    http.patch<unknown, { data: any }>(`/portal/contracts/${id}/ship-done`),
  // 撤回发货批次（门户B3）：未被对账占用前可撤
  withdrawShipment: (id: number, sid: number) =>
    http.delete(`/portal/contracts/${id}/shipments/${sid}`),
};
