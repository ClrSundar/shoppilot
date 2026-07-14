import { api } from '@/lib/api';

export type Supplier = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  active: boolean;
};

export type CreateSupplierPayload = {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstNumber?: string;
};

export const suppliersService = {
  getAll: async () => {
    const res = await api.get<Supplier[]>('/suppliers');
    return res.data;
  },

  create: async (payload: CreateSupplierPayload) => {
    const res = await api.post<Supplier>('/suppliers', payload);
    return res.data;
  },

  update: async (id: string, payload: Partial<CreateSupplierPayload>) => {
    const res = await api.put<Supplier>(`/suppliers/${id}`, payload);
    return res.data;
  },

  remove: async (id: string) => {
    const res = await api.delete<Supplier>(`/suppliers/${id}`);
    return res.data;
  },
};
