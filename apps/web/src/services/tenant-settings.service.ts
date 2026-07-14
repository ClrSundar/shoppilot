import { api } from '@/lib/api';

export type AgentCategory =
  | 'ENGINEER'
  | 'EXISTING_CUSTOMER'
  | 'DEALER'
  | 'CONTRACTOR'
  | 'OTHER';

export type AgentDiscountConfigItem = {
  category: AgentCategory;
  label: string;
  defaultDiscountPercentage: number;
};

export type AgentDiscountConfigResponse = {
  items: AgentDiscountConfigItem[];
};

export const tenantSettingsService = {
  getAgentDiscountConfig: async (): Promise<AgentDiscountConfigResponse> => {
    const res = await api.get('/tenant-settings/agent-discounts');
    return res.data;
  },

  updateAgentDiscountConfig: async (
    items: AgentDiscountConfigItem[],
  ): Promise<AgentDiscountConfigResponse> => {
    const res = await api.put('/tenant-settings/agent-discounts', {
      items: items.map((item) => ({
        category: item.category,
        defaultDiscountPercentage: item.defaultDiscountPercentage,
      })),
    });

    return res.data;
  },
};
