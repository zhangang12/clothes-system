import { http } from './index';

export interface Thresholds { quote: number; order: number; contract: number }

export const configApi = {
  getThresholds: () => http.get<unknown, any>('/config/thresholds'),
  setThresholds: (dto: Partial<Thresholds>) => http.put<unknown, any>('/config/thresholds', dto),
};
