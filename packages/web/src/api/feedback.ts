import { http } from './index';

export const feedbackApi = {
  create: (dto: { content: string; images?: string[]; page_url?: string }) =>
    http.post<unknown, any>('/feedbacks', dto),
  list: (params?: { page?: number; size?: number; status?: string }) =>
    http.get<unknown, any>('/feedbacks', { params }),
  markHandled: (id: number, handled: boolean, reply?: string) =>
    http.patch<unknown, any>(`/feedbacks/${id}/handled`, { handled, reply }),
  // 提交人自助:我的反馈(含回复) / 未读回复数 / 标记已读
  mine: (params?: { page?: number; size?: number }) =>
    http.get<unknown, any>('/feedbacks/mine', { params }),
  unread: () =>
    http.get<unknown, any>('/feedbacks/mine/unread'),
  markRead: (id: number) =>
    http.patch<unknown, any>(`/feedbacks/${id}/read`),
};
