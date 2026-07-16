import { api } from '@/lib/api';

export type DashboardMetrics = {
  categories: number;
  products: number;
  customers: number;
  quotes: number;
};

export type DashboardOutstanding = {
  totalOutstanding: number;
  customerCountWithOutstanding: number;
  topCustomers: Array<{
    customerId: string;
    customerName: string;
    customerPhone: string | null;
    totalInvoiced: number;
    totalPaid: number;
    outstanding: number;
  }>;
};

export type LowStockProduct = {
  id: string;
  productId: string;
  productName: string;
  sku?: string | null;
  categoryName?: string | null;
  onHand: number;
  reorderLevel: number;
  reserved: number;
  available: number;
  status: 'OUT_OF_STOCK' | 'LOW_STOCK';
};

export const dashboardService = {
  getMetrics: async () => {
    const res = await api.get<DashboardMetrics>('/dashboard/metrics');
    return res.data;
  },

  getLowStockProducts: async () => {
    const res = await api.get<LowStockProduct[]>('/dashboard/low-stock');
    return res.data;
  },

  getOutstandingPayments: async () => {
    const res = await api.get<DashboardOutstanding>('/dashboard/outstanding-payments');
    return res.data;
  },
};