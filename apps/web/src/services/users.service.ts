import { api } from '@/lib/api';

export type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'SALES' | 'TECHNICIAN';
  active: boolean;
  createdAt: string;
};

export type CreateUserPayload = {
  name: string;
  email: string;
  role: TeamUser['role'];
  password: string;
};

export type BulkUploadResult = {
  totalRows: number;
  created: number;
  skipped: number;
  errors: string[];
};

export const usersService = {
  getAll: async (): Promise<TeamUser[]> => {
    const res = await api.get('/users');
    return res.data;
  },

  create: async (payload: CreateUserPayload): Promise<TeamUser> => {
    const res = await api.post('/users', payload);
    return res.data;
  },

  updateRole: async (id: string, role: TeamUser['role']): Promise<TeamUser> => {
    const res = await api.patch(`/users/${id}/role`, { role });
    return res.data;
  },

  toggleActive: async (id: string): Promise<TeamUser> => {
    const res = await api.patch(`/users/${id}/toggle-active`);
    return res.data;
  },

  bulkUpload: async (file: File): Promise<BulkUploadResult> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/users/bulk-upload', formData);
    return res.data;
  },
};
