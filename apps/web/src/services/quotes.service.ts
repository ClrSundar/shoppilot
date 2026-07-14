import { api } from '@/lib/api';
import type { AgentCategory } from './tenant-settings.service';

export type Quote = {
  id: string;
  quoteNumber: string;
  status: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  validUntil?: string | null;
  discountAmount?: string;
  createdAt: string;
  notes?: string | null;
  agentId?: string | null;
  agentCommissionPercentage?: string;
  agentCommissionAmount?: string;
  metadata?: {
    quoteDiscount?: {
      agentCategory?: AgentCategory | null;
      discountPercentage?: number;
    };
    revisionOfQuoteId?: string | null;
    revisionOfQuoteNumber?: string | null;
  } | null;
  customer: {
    id: string;
    name: string;
    phone?: string | null;
    whatsappNumber?: string | null;
  };
  agent?: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
  } | null;
  items?: {
    id: string;
    productId: string;
    productName: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }[];
};

export type QuoteStatus =
  | 'DRAFT'
  | 'SENT'
  | 'APPROVED'
  | 'INVOICED'
  | 'DISPATCHED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export const quotesService = {
  getAll: async () => {
    const res = await api.get<Quote[]>('/quotes');
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get<Quote>(`/quotes/${id}`);
    return res.data;
  },

  create: async (payload: CreateQuotePayload) => {
    const res = await api.post(
      '/quotes',
      payload,
    );

    return res.data;
  },

  update: async (id: string, payload: UpdateQuotePayload) => {
    const res = await api.put<Quote>(`/quotes/${id}`, payload);
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
  agentId?: string;
  agentCommissionPercentage?: number;
  agentCategory?: AgentCategory;
  discountPercentage?: number;
  items: {
    productId: string;
    quantity: number;
    unitPrice?: number;
  }[];
  notes?: string;
  metadata?: Record<string, unknown>;
};

export type UpdateQuotePayload = CreateQuotePayload;

export type { AgentCategory } from './tenant-settings.service';



