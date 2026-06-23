import { api } from '@/lib/api';

export type PlatformLoginPayload = {
  email: string;
  password: string;
};

export type PlatformLoginResponse = {
  accessToken: string;
  admin: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
};

export type Tenant = {
  id: string;
  name: string;
  code: string;
  businessType: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  rejectedReason?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  users: { id: string; name: string; email: string }[];
};

export const platformAuthService = {
  login: async (payload: PlatformLoginPayload): Promise<PlatformLoginResponse> => {
    const res = await api.post('/platform-auth/login', payload);
    return res.data;
  },
};

export const platformService = {
  getTenants: async (token: string, status?: string): Promise<Tenant[]> => {
    const res = await api.get('/platform/tenants', {
      params: status ? { status } : {},
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  },

  approveTenant: async (token: string, id: string): Promise<Tenant> => {
    const res = await api.patch(`/platform/tenants/${id}/approve`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  },

  rejectTenant: async (token: string, id: string, reason?: string): Promise<Tenant> => {
    const res = await api.patch(`/platform/tenants/${id}/reject`, { reason }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  },

  suspendTenant: async (token: string, id: string): Promise<Tenant> => {
    const res = await api.patch(`/platform/tenants/${id}/suspend`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  },

  unsuspendTenant: async (token: string, id: string): Promise<Tenant> => {
    const res = await api.patch(`/platform/tenants/${id}/unsuspend`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  },
};
