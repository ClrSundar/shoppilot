import { api } from '@/lib/api';

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  active: boolean;
};

export type CreateCustomerPayload = {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstNumber?: string;
};

export const customersService = {
  getAll: async () => {
    const res = await api.get<Customer[]>('/customers');
    return res.data;
  },

  create: async (payload: CreateCustomerPayload) => {
    const res = await api.post<Customer>('/customers', payload);
    return res.data;
  },
};