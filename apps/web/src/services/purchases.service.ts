import { api } from '@/lib/api';

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'ORDERED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export type PurchaseOrder = {
  id: string;
  orderNumber: string;
  status: PurchaseOrderStatus;
  supplierName: string;
  supplierPhone?: string | null;
  supplierEmail?: string | null;
  supplierGstNumber?: string | null;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  expectedDate?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  items: {
    id: string;
    productId: string;
    productName: string;
    quantity: string;
    unitCost: string;
    lineTotal: string;
    receivedQuantity: string;
  }[];
};

export type CreatePurchaseOrderPayload = {
  supplierName: string;
  supplierPhone?: string;
  supplierEmail?: string;
  supplierGstNumber?: string;
  expectedDate?: string;
  notes?: string;
  taxPercentage?: number;
  items: {
    productId: string;
    quantity: number;
    unitCost: number;
  }[];
};

export const purchasesService = {
  getAll: async () => {
    const res = await api.get<PurchaseOrder[]>('/purchases');
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get<PurchaseOrder>(`/purchases/${id}`);
    return res.data;
  },

  create: async (payload: CreatePurchaseOrderPayload) => {
    const res = await api.post<PurchaseOrder>('/purchases', payload);
    return res.data;
  },

  updateStatus: async (id: string, status: PurchaseOrderStatus) => {
    const res = await api.patch<PurchaseOrder>(`/purchases/${id}/status`, { status });
    return res.data;
  },

  receive: async (
    id: string,
    payload?: {
      items?: {
        purchaseOrderItemId: string;
        receivedQuantity: number;
      }[];
      note?: string;
    },
  ) => {
    const res = await api.post<PurchaseOrder>(`/purchases/${id}/receive`, payload || {});
    return res.data;
  },
};
