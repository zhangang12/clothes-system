import { http } from './index';
import type { Factory, CreateFactoryDto, PageResult } from '@i9/types';

export const factoryApi = {
  list: (params?: { page?: number; size?: number; keyword?: string }) =>
    http.get<unknown, { data: Factory[]; total: number }>('/factories', { params }),
  get: (id: number) => http.get<unknown, { data: Factory }>(`/factories/${id}`),
  create: (dto: CreateFactoryDto) => http.post<unknown, { data: Factory }>('/factories', dto),
  update: (id: number, dto: Partial<CreateFactoryDto>) => http.put<unknown, { data: Factory }>(`/factories/${id}`, dto),
  remove: (id: number) => http.delete(`/factories/${id}`),
};
