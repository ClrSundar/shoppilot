import { api } from '@/lib/api';

export type RecommendationHistoryItem = {
  runId: string;
  date: string;
  customer: {
    id: string;
    name: string;
  } | null;
  boreDepthFt: number | null;
  recommendedMotor: {
    productId: string;
    productName: string;
  } | null;
  appliedRuleCode: string | null;
  quoteCreated: boolean;
  quote: {
    id: string;
    quoteNumber: string;
    createdAt: string;
  } | null;
  feedback: {
    action: string;
    notes: string | null;
    createdAt: string;
  } | null;
};

export const recommendationsService = {
  getHistory: async (limit = 30) => {
    const res = await api.get<RecommendationHistoryItem[]>('/decisions/history', {
      params: {
        limit,
      },
    });

    return res.data;
  },
};
