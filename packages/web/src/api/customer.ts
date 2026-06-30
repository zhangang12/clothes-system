import { http } from './index';
import type { Customer, CreateCustomerDto } from '@i9/types';

export const customerApi = {
  list: (params?: { page?: number; size?: number; keyword?: string }) =>
    http.get<unknown, { data: Customer[]; total: number }>('/customers', { params }),
  get: (id: number) => http.get<unknown, { data: Customer }>(`/customers/${id}`),
  create: (dto: CreateCustomerDto) => http.post<unknown, { data: Customer }>('/customers', dto),
  update: (id: number, dto: Partial<CreateCustomerDto>) => http.put<unknown, { data: Customer }>(`/customers/${id}`, dto),
  remove: (id: number) => http.delete(`/customers/${id}`),
};
