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
  // 下拉选项：失败不走全局红字（silent）。/factories/select 已挂 @MenuAccess('factories')，
  // 而财务等角色默认菜单里没有 factories，却要在付款/对账页用工厂选择器——
  // 让它安静地回空列表并由组件就地说明，别在一个跟工厂管理无关的页面上冒红字。
  select: (type?: string) =>
    http.get<unknown, { data: Factory[] }>('/factories/select', { params: type ? { type } : {}, silent: true } as any),
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
