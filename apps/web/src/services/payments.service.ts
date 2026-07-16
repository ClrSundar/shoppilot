import { api } from '@/lib/api';

export type PaymentDirection = 'RECEIVED' | 'PAID';
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type Payment = {
  id: string;
  amount: string;
  direction: PaymentDirection;
  method: PaymentMethod;
  status: PaymentStatus;
  paymentDate: string;
  referenceNumber?: string | null;
  note?: string | null;
  quote?: {
    id: string;
    quoteNumber: string;
  } | null;
  purchaseOrder?: {
    id: string;
    orderNumber: string;
  } | null;
  customer?: {
    id: string;
    name: string;
  } | null;
};

export type CreatePaymentPayload = {
  quoteId?: string;
  purchaseOrderId?: string;
  customerId?: string;
  amount: number;
  direction?: PaymentDirection;
  method: PaymentMethod;
  status?: PaymentStatus;
  paymentDate?: string;
  referenceNumber?: string;
  note?: string;
};

export type ListPaymentsQuery = {
  customerId?: string;
  quoteId?: string;
  direction?: PaymentDirection;
  status?: PaymentStatus;
  fromDate?: string;
  toDate?: string;
  limit?: number;
};

export const paymentsService = {
  getAll: async (query?: ListPaymentsQuery) => {
    const res = await api.get<Payment[]>('/payments', {
      params: query,
    });
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get<Payment>(`/payments/${id}`);
    return res.data;
  },

  create: async (payload: CreatePaymentPayload) => {
    const res = await api.post<Payment>('/payments', payload);
    return res.data;
  },
};
