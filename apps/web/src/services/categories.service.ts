import { api } from '@/lib/api';

export type Category = {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateCategoryPayload = {
  name: string;
  description?: string;
};

export const categoriesService = {
  getAll: async () => {
    const res = await api.get<Category[]>('/categories');
    return res.data;
  },

  create: async (payload: CreateCategoryPayload) => {
    const res = await api.post<Category>('/categories', payload);
    return res.data;
  },
};