import { http } from './index';

export const statsApi = {
  funnel: () => http.get<unknown, any>('/stats/funnel'),
  winRate: (dimension: 'salesperson' | 'customer') =>
    http.get<unknown, any>('/stats/win-rate', { params: { dimension } }),
  profit: (dimension: 'style' | 'month' | 'customer') =>
    http.get<unknown, any>('/stats/profit', { params: { dimension } }),
  // 订单维度统计(P3#34/ORD D8)
  orders: (dimension: 'po' | 'customer' | 'factory' | 'currency') =>
    http.get<unknown, any>('/stats/orders', { params: { dimension } }),
};
