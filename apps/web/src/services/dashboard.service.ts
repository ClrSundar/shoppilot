import { api } from '@/lib/api';

export type DashboardMetrics = {
  categories: number;
  products: number;
  customers: number;
  quotes: number;
};

export const dashboardService = {
  getMetrics: async () => {
    const res = await api.get<DashboardMetrics>('/dashboard/metrics');
    return res.data;
  },
};