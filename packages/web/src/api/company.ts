import { http } from './index';

export const companyApi = {
  list: () => http.get<unknown, any>('/company-profiles'),
  getDefault: () => http.get<unknown, any>('/company-profiles/default'),
  create: (dto: Record<string, unknown>) => http.post<unknown, any>('/company-profiles', dto),
  update: (id: number, dto: Record<string, unknown>) => http.put<unknown, any>(`/company-profiles/${id}`, dto),
  setDefault: (id: number) => http.patch<unknown, any>(`/company-profiles/${id}/set-default`),
  remove: (id: number) => http.delete(`/company-profiles/${id}`),
};
