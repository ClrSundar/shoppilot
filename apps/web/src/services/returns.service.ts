import { api } from '@/lib/api';

export type ProductReturnType = 'SALES_RETURN' | 'PURCHASE_RETURN';
export type ProductReturnStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

export type ProductReturn = {
  id: string;
  returnNumber: string;
  type: ProductReturnType;
  status: ProductReturnStatus;
  reason?: string | null;
  notes?: string | null;
  createdAt: string;
  quoteId?: string | null;
  purchaseOrderId?: string | null;
  customerId?: string | null;
  items: {
    id: string;
    productId: string;
    productName: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
    restockToInventory: boolean;
  }[];
};

export type CreateProductReturnPayload = {
  type: ProductReturnType;
  quoteId?: string;
  purchaseOrderId?: string;
  customerId?: string;
  reason?: string;
  notes?: string;
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
    restockToInventory?: boolean;
  }[];
};

export const returnsService = {
  getAll: async () => {
    const res = await api.get<ProductReturn[]>('/returns');
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get<ProductReturn>(`/returns/${id}`);
    return res.data;
  },

  create: async (payload: CreateProductReturnPayload) => {
    const res = await api.post<ProductReturn>('/returns', payload);
    return res.data;
  },

  updateStatus: async (id: string, status: ProductReturnStatus) => {
    const res = await api.patch<ProductReturn>(`/returns/${id}/status`, { status });
    return res.data;
  },
};
