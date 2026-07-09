import { http } from './index';
import type { Customer, CreateCustomerDto } from '@i9/types';
import type { PageResult } from './factory';

export const customerApi = {
  list: (params?: { page?: number; size?: number; keyword?: string; type?: string; grade?: string; status?: number }) =>
    http.get<unknown, { data: PageResult<Customer> }>('/customers', { params }),
  select: (grade?: string) =>
    http.get<unknown, { data: Customer[] }>('/customers/select', { params: grade ? { grade } : {} }),
  get: (id: number) =>
    http.get<unknown, { data: Customer }>(`/customers/${id}`),
  create: (dto: CreateCustomerDto) =>
    http.post<unknown, { data: Customer }>('/customers', dto),
  importBatch: (rows: any[]) =>
    http.post<unknown, { data: any }>('/customers/import', { rows }),
  update: (id: number, dto: Partial<CreateCustomerDto>) =>
    http.put<unknown, { data: Customer }>(`/customers/${id}`, dto),
  toggleStatus: (id: number) =>
    http.patch<unknown, { data: Customer }>(`/customers/${id}/status`),
  remove: (id: number) =>
    http.delete(`/customers/${id}`),
  // 机密授权（设计稿 01 §D.3：批量授权仅管理员）
  grantBatch: (customer_ids: number[], user_ids: number[], can_edit: boolean) =>
    http.post<unknown, { data: any }>('/customers/grants', { customer_ids, user_ids, can_edit }),
  getGrants: (id: number) =>
    http.get<unknown, { data: any[] }>(`/customers/${id}/grants`),
  revokeGrant: (id: number, userId: number) =>
    http.delete(`/customers/${id}/grants/${userId}`),
  listUsers: () =>
    http.get<unknown, { data: any[] }>('/auth/users'),
};
