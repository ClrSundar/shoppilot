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
    whatsappNumber?: string | null;
  };
  items?: {
    id: string;
    productName: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }[];
};

export type QuoteStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

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

  updateStatus: async (id: string, status: QuoteStatus) => {
    const res = await api.patch<Quote>(`/quotes/${id}/status`, { status });
    return res.data;
  },

  downloadPdf: async (id: string) => {
    const res = await api.get(`/quotes/${id}/pdf`, {
      responseType: 'blob',
    });

    const blob = new Blob([res.data], {
      type: 'application/pdf',
    });

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `quote-${id}.pdf`;
    link.click();

    window.URL.revokeObjectURL(url);
  },
};

export type CreateQuotePayload = {
  customerId: string;
  items: {
    productId: string;
    quantity: number;
  }[];
};



