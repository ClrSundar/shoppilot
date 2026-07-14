import { api } from '@/lib/api';

export type Product = {
  id: string;
  categoryId: string;
  name: string;
  sku?: string | null;
  brand?: string | null;
  unit: string;
  costPrice: string;
  landingPrice?: string | null;
  sellingPrice: string;
  active: boolean;
  category: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type CreateProductPayload = {
  categoryId: string;
  name: string;
  brand?: string;
  unit?: string;
  costPrice: number;
  landingPrice?: number | null;
  sellingPrice: number;
};

export type UpdateProductPayload = Partial<CreateProductPayload>;

export type BulkUploadResult = {
  totalRows: number;
  created: number;
  skipped: number;
  errors: string[];
};

export type ArchivedProduct = Product & {
  stock: {
    id: string;
    onHand: string;
    reserved: string;
    reorderLevel: string;
    active: boolean;
    updatedAt: string;
  } | null;
};

export const productsService = {
  getAll: async () => {
    const res = await api.get<Product[]>('/products');
    return res.data;
  },

  getArchived: async () => {
    const res = await api.get<ArchivedProduct[]>('/products/archived');
    return res.data;
  },

  create: async (payload: CreateProductPayload) => {
    const res = await api.post<Product>('/products', payload);
    return res.data;
  },

  update: async (id: string, payload: UpdateProductPayload) => {
    const res = await api.put<Product>(`/products/${id}`, payload);
    return res.data;
  },

  delete: async (id: string) => {
    const res = await api.delete<Product>(`/products/${id}`);
    return res.data;
  },

  restore: async (id: string) => {
    const res = await api.post<Product>(`/products/${id}/restore`);
    return res.data;
  },

  bulkUpload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<BulkUploadResult>('/products/bulk-upload', formData);
    return res.data;
  },
};