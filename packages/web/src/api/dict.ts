import { http } from './index';

export interface DictItem { id: number; type: string; label: string; value?: string | null; sort: number }

export const dictApi = {
  list: (type: string) => http.get<unknown, { data: DictItem[] }>('/dicts', { params: { type } }),
  // 下拉自填的新值自动累积进字典(重复后端幂等忽略)
  create: (type: string, label: string, value?: string) =>
    http.post<unknown, { data: DictItem }>('/dicts', { type, label, value }),
  remove: (id: number) => http.delete(`/dicts/${id}`),
};
