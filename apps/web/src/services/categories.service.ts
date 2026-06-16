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

export type UpdateCategoryPayload = Partial<CreateCategoryPayload>;

export const categoriesService = {
  getAll: async () => {
    const res = await api.get<Category[]>('/categories');
    return res.data;
  },

  create: async (payload: CreateCategoryPayload) => {
    const res = await api.post<Category>('/categories', payload);
    return res.data;
  },

  update: async (id: string, payload: UpdateCategoryPayload) => {
    const res = await api.put<Category>(`/categories/${id}`, payload);
    return res.data;
  },

  delete: async (id: string) => {
    const res = await api.delete<Category>(`/categories/${id}`);
    return res.data;
  },
};