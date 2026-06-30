import { http } from './index';
import type { Customer, CreateCustomerDto } from '@i9/types';
import type { PageResult } from './factory';

export const customerApi = {
  list: (params?: { page?: number; size?: number; keyword?: string; grade?: string; status?: number }) =>
    http.get<unknown, { data: PageResult<Customer> }>('/customers', { params }),
  select: (grade?: string) =>
    http.get<unknown, { data: Customer[] }>('/customers/select', { params: grade ? { grade } : {} }),
  get: (id: number) =>
    http.get<unknown, { data: Customer }>(`/customers/${id}`),
  create: (dto: CreateCustomerDto) =>
    http.post<unknown, { data: Customer }>('/customers', dto),
  update: (id: number, dto: Partial<CreateCustomerDto>) =>
    http.put<unknown, { data: Customer }>(`/customers/${id}`, dto),
  toggleStatus: (id: number) =>
    http.patch<unknown, { data: Customer }>(`/customers/${id}/status`),
  remove: (id: number) =>
    http.delete(`/customers/${id}`),
};
