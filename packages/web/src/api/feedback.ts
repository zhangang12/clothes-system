import { http } from './index';

export const feedbackApi = {
  create: (dto: { content: string; images?: string[]; page_url?: string }) =>
    http.post<unknown, any>('/feedbacks', dto),
  list: (params?: { page?: number; size?: number; status?: string }) =>
    http.get<unknown, any>('/feedbacks', { params }),
  markHandled: (id: number, handled: boolean, reply?: string) =>
    http.patch<unknown, any>(`/feedbacks/${id}/handled`, { handled, reply }),
};
