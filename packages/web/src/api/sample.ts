import { http } from './index';
import type { SampleGarment } from '@i9/types';

export const sampleApi = {
  list: (params?: Record<string, unknown>) =>
    http.get<unknown, { data: any }>('/samples', { params }),
  get: (id: number) =>
    http.get<unknown, { data: any }>(`/samples/${id}`),
  getVersionHistory: (id: number) =>
    http.get<unknown, { data: any[] }>(`/samples/${id}/versions`),
  create: (dto: Record<string, unknown>) =>
    http.post<unknown, { data: SampleGarment }>('/samples', dto),
  update: (id: number, dto: Record<string, unknown>) =>
    http.put<unknown, { data: SampleGarment }>(`/samples/${id}`, dto),
  // 推送版师 / 填材料寄出单号 → 打样中
  push: (id: number, dto: { patternmakerId?: number; patternmakerName?: string; materialShipNo?: string }) =>
    http.patch<unknown, { data: SampleGarment }>(`/samples/${id}/push`, dto),
  // 版师视图保存：实际耗用/拉链长度/寄回单号/件数/工时单价
  patternmakerSave: (id: number, dto: { materials?: any[]; returnNo?: string; pieceCount?: number; laborUnitPrice?: number; feedbackAttachments?: string }) =>
    http.patch<unknown, { data: SampleGarment }>(`/samples/${id}/patternmaker`, dto),
  ship: (id: number, dto: { shipSampleDate?: string } = {}) =>
    http.patch<unknown, { data: SampleGarment }>(`/samples/${id}/ship`, dto),
  complete: (id: number) =>
    http.patch<unknown, { data: SampleGarment }>(`/samples/${id}/complete`),
  copy: (id: number) =>
    http.post<unknown, { data: SampleGarment }>(`/samples/${id}/copy`),
  remove: (id: number) =>
    http.delete(`/samples/${id}`),
  // 历史样衣批量导入（CSV 行）
  importBatch: (rows: any[]) =>
    http.post<unknown, { data: { ok: number; fail: number; failures: Array<{ row: number; reason: string }> } }>('/samples/import', { rows }),
  // 制版师下拉（role=PATTERNMAKER 的内部用户）
  listPatternmakers: () =>
    http.get<unknown, { data: any[] }>('/auth/users', { params: { role: 'PATTERNMAKER' } }),
};
