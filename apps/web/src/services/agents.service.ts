import { api } from '@/lib/api';

export type Agent = {
  id: string;
  name: string;
  phone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
  address?: string | null;
  referenceCode?: string | null;
  defaultCommissionPercentage: string;
  active: boolean;
};

export type CreateAgentPayload = {
  name: string;
  phone?: string;
  whatsappNumber?: string;
  email?: string;
  address?: string;
  referenceCode?: string;
  defaultCommissionPercentage?: number;
};

export type BulkUploadResult = {
  totalRows: number;
  created: number;
  skipped: number;
  errors: string[];
};

export type AgentOverviewStats = {
  totalAgents: number;
  activeAgents: number;
  inactiveAgents: number;
  totalReferredQuotes: number;
  totalReferredAmount: number;
  totalCommissionAmount: number;
  topAgentsByCommission: Array<{
    agentId: string | null;
    agent: {
      id: string;
      name: string;
      phone?: string | null;
      email?: string | null;
    } | null;
    quoteCount: number;
    totalAmount: number;
    totalCommissionAmount: number;
  }>;
};

export type AgentQuoteSummary = {
  id: string;
  quoteNumber: string;
  status: string;
  totalAmount: string;
  agentCommissionAmount: string;
  createdAt: string;
  customer: {
    id: string;
    name: string;
  };
};

export type AgentStats = {
  agent: Agent;
  totalQuotes: number;
  convertedQuotes: number;
  conversionRate: number;
  totalReferredAmount: number;
  totalCommissionAmount: number;
  recentQuotes: AgentQuoteSummary[];
};

export const agentsService = {
  getAll: async () => {
    const res = await api.get<Agent[]>('/agents');
    return res.data;
  },

  create: async (payload: CreateAgentPayload) => {
    const res = await api.post<Agent>('/agents', payload);
    return res.data;
  },

  update: async (id: string, payload: Partial<CreateAgentPayload>) => {
    const res = await api.put<Agent>(`/agents/${id}`, payload);
    return res.data;
  },

  delete: async (id: string) => {
    const res = await api.delete<Agent>(`/agents/${id}`);
    return res.data;
  },

  bulkUpload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<BulkUploadResult>('/agents/bulk-upload', formData);
    return res.data;
  },

  getOverviewStats: async () => {
    const res = await api.get<AgentOverviewStats>('/agents/stats/overview');
    return res.data;
  },

  getAgentStats: async (id: string) => {
    const res = await api.get<AgentStats>(`/agents/${id}/stats`);
    return res.data;
  },
};
