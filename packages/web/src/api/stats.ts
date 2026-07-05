import { http } from './index';

export const statsApi = {
  funnel: () => http.get<unknown, any>('/stats/funnel'),
  winRate: (dimension: 'salesperson' | 'customer') =>
    http.get<unknown, any>('/stats/win-rate', { params: { dimension } }),
  profit: (dimension: 'style' | 'month') =>
    http.get<unknown, any>('/stats/profit', { params: { dimension } }),
};
