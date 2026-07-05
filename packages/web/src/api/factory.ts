import { http } from './index';
import type { Factory, CreateFactoryDto } from '@i9/types';

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export const factoryApi = {
  list: (params?: { page?: number; size?: number; keyword?: string; type?: string; status?: number }) =>
    http.get<unknown, { data: PageResult<Factory> }>('/factories', { params }),
  select: (type?: string) =>
    http.get<unknown, { data: Factory[] }>('/factories/select', { params: type ? { type } : {} }),
  get: (id: number) =>
    http.get<unknown, { data: Factory }>(`/factories/${id}`),
  create: (dto: CreateFactoryDto) =>
    http.post<unknown, { data: Factory }>('/factories', dto),
  importBatch: (rows: any[]) =>
    http.post<unknown, { data: any }>('/factories/import', { rows }),
  update: (id: number, dto: Partial<CreateFactoryDto>) =>
    http.put<unknown, { data: Factory }>(`/factories/${id}`, dto),
  toggleStatus: (id: number) =>
    http.patch<unknown, { data: Factory }>(`/factories/${id}/status`),
  remove: (id: number) =>
    http.delete(`/factories/${id}`),
};
