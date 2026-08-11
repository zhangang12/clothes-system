import { http } from './index';

export const reconciliationApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, any>('/reconciliations', { params }),
  get: (id: number) =>
    http.get<unknown, any>(`/reconciliations/${id}`),
  create: (dto: Record<string, unknown>) =>
    http.post<unknown, any>('/reconciliations', dto),
  // 样衣打样工时对账：勾选多款样衣（同一版师）合并生成工时对账单
  generateLabor: (sampleIds: number[]) =>
    http.post<unknown, any>('/reconciliations/labor', { sampleIds }),
  // 改草稿：只放开发票/税率/说明（结构性的批次费用行请删掉重建）
  updateDraft: (id: number, dto: Record<string, unknown>) =>
    http.patch(`/reconciliations/${id}`, dto),
  submit: (id: number) =>
    http.patch<unknown, any>(`/reconciliations/${id}/submit`),
  confirm: (id: number, overReason?: string) =>
    http.patch<unknown, any>(`/reconciliations/${id}/confirm`, overReason ? { over_reason: overReason } : {}),
  reject: (id: number, remark?: string) =>
    http.patch<unknown, any>(`/reconciliations/${id}/reject`, { remark }),
  remove: (id: number) =>
    http.delete(`/reconciliations/${id}`),
};
