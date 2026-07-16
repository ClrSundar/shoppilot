import { api } from '@/lib/api';

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  customerTypeId?: string | null;
  active: boolean;
};

export type CustomerType = {
  id: string;
  code: string;
  name: string;
  defaultDiscountPercentage: string | number;
  active: boolean;
  _count?: {
    customers: number;
  };
};

export type CustomerLedgerSummary = {
  totalInvoiced: number;
  totalReceived: number;
  outstanding: number;
};

export type CreateCustomerPayload = {
  name: string;
  phone?: string;
  whatsappNumber?: string;
  email?: string;
  address?: string;
  gstNumber?: string;
  customerTypeId?: string;
};

export type CreateCustomerTypePayload = {
  code: string;
  name: string;
  defaultDiscountPercentage: number;
  active?: boolean;
};

export type UpdateCustomerTypePayload = Partial<CreateCustomerTypePayload>;

export type BulkUploadResult = {
  totalRows: number;
  created: number;
  skipped: number;
  errors: string[];
};

export const customersService = {
  getAll: async () => {
    const res = await api.get<Customer[]>('/customers');
    return res.data;
  },

  update: async (id: string, payload: Partial<Customer>) => {
    const res = await api.put<Customer>(`/customers/${id}`, payload);
    return res.data;
  },

  create: async (payload: CreateCustomerPayload) => {
    const res = await api.post<Customer>('/customers', payload);
    return res.data;
  },

  getCustomerTypes: async () => {
    const res = await api.get<CustomerType[]>('/customer-types');
    return res.data;
  },

  createCustomerType: async (payload: CreateCustomerTypePayload) => {
    const res = await api.post<CustomerType>('/customer-types', payload);
    return res.data;
  },

  updateCustomerType: async (id: string, payload: UpdateCustomerTypePayload) => {
    const res = await api.put<CustomerType>(`/customer-types/${id}`, payload);
    return res.data;
  },

  deleteCustomerType: async (id: string) => {
    const res = await api.delete<CustomerType>(`/customer-types/${id}`);
    return res.data;
  },

  delete: async (id: string) => {
    const res = await api.delete<Customer>(`/customers/${id}`);
    return res.data;
  },

  bulkUpload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<BulkUploadResult>('/customers/bulk-upload', formData);
    return res.data;
  },

  getOutstanding: async () => {
    const res = await api.get<{
      totalOutstanding: number;
      customerCountWithOutstanding: number;
      rows: Array<{
        customerId: string;
        customerName: string;
        customerPhone: string | null;
        totalInvoiced: number;
        totalPaid: number;
        outstanding: number;
      }>;
    }>('/customer-accounts/outstanding/list');

    return res.data;
  },
};