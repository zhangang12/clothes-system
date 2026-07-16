import { http } from './index';

export const authApi = {
  // 本人改密（内部用户与供应商共用，后端按 token type 分流）
  changePassword: (dto: { old_password: string; new_password: string }) =>
    http.patch<unknown, any>('/auth/change-password', dto),

  // ── 管理员：内部用户 ──
  adminListUsers: () => http.get<unknown, any>('/auth/admin/users'),
  createUser: (dto: { username: string; real_name: string; role: string; password: string }) =>
    http.post<unknown, any>('/auth/admin/users', dto),
  updateUser: (id: number, dto: { real_name?: string; role?: string; status?: number }) =>
    http.patch<unknown, any>(`/auth/admin/users/${id}`, dto),
  resetUserPassword: (id: number, new_password: string) =>
    http.patch<unknown, any>(`/auth/admin/users/${id}/password`, { new_password }),

  // ── 管理员：供应商门户账号 ──
  adminListSuppliers: () => http.get<unknown, any>('/auth/admin/suppliers'),
  resetSupplierPassword: (id: number, new_password: string) =>
    http.patch<unknown, any>(`/auth/admin/suppliers/${id}/password`, { new_password }),
  updateSupplier: (id: number, status: number) =>
    http.patch<unknown, any>(`/auth/admin/suppliers/${id}`, { status }),
};
