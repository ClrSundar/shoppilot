import { api } from '@/lib/api';

export type LoginPayload = {
  email: string;
  password: string;
  tenantId?: string;
};

export type TenantOption = {
  id: string;
  name: string;
};

export type LoginResponse = 
  | { accessToken: string; tenants?: never }
  | { tenants: TenantOption[]; accessToken?: never };

export type RegisterPayload = {
  shopName: string;
  shopCode: string;
  businessType: 'ELECTRICAL' | 'PLUMBING' | 'MOTOR' | 'GENERAL';
  ownerName: string;
  email: string;
  password: string;
};

export const authService = {
  login: async (payload: LoginPayload): Promise<LoginResponse> => {
    const res = await api.post('/auth/login', payload);
    return res.data;
  },

  register: async (payload: RegisterPayload) => {
    const res = await api.post('/auth/register', payload);
    return res.data;
  },
};