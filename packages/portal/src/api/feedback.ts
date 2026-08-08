import { http } from './index';

// 门户专用的反馈接口（走 /portal/feedbacks，由 SupplierGuard 放行）。
// 【别改成 /feedbacks】那套是内部管理端的，整体挂 @Roles(...INTERNAL_ROLES)，
// 供应商令牌调过去一律 403。
export const feedbackApi = {
  create: (data: { content: string; images?: string[]; page_url?: string }) =>
    http.post('/portal/feedbacks', data),
  mine: (params: { page?: number; size?: number }) =>
    http.get('/portal/feedbacks/mine', { params }),
  unread: () => http.get('/portal/feedbacks/mine/unread'),
  markRead: (id: number) => http.patch(`/portal/feedbacks/${id}/read`),
};
