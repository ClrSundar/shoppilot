import { api } from '@/lib/api';

export type Quote = {
  id: string;
  quoteNumber: string;
  status: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    phone?: string | null;
  };
  items?: {
    id: string;
    productName: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }[];
};

export const quotesService = {
  getAll: async () => {
    const res = await api.get<Quote[]>('/quotes');
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get<Quote>(`/quotes/${id}`);
    return res.data;
  },
  
  create: async (
    payload: CreateQuotePayload,
    ) => {
    const res = await api.post(
        '/quotes',
        payload,
    );

    return res.data;
  },
};

export type CreateQuotePayload = {
  customerId: string;
  items: {
    productId: string;
    quantity: number;
  }[];
};

