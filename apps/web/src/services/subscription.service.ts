import { api } from '@/lib/api';

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  billingCycle: string;
  trialDays: number;
  features: {
    code: string;
    name: string;
    enabled: boolean;
    limitValue?: number;
  }[];
}

export interface Subscription {
  id: string;
  status: string;
  plan: {
    id: string;
    code: string;
    name: string;
    description?: string;
    priceAmount: number;
    billingCycle: string;
    currency: string;
    trialDays: number;
  };
  startAt: string;
  endAt?: string;
  trialEndAt?: string;
  features: {
    code: string;
    name: string;
    enabled: boolean;
    limitValue?: number;
  }[];
}

export const subscriptionService = {
  async getCurrentSubscription(): Promise<Subscription> {
    const { data } = await api.get('/subscriptions/me');
    return data;
  },

  async getAvailablePlans(): Promise<Plan[]> {
    const { data } = await api.get('/subscriptions/plans');
    return data;
  },

  async changePlan(planCode: string): Promise<{ message: string; subscription: Subscription }> {
    const { data } = await api.patch('/subscriptions/plan', { planCode });
    return data;
  },

  async cancelSubscription(): Promise<{ message: string }> {
    const { data } = await api.delete('/subscriptions');
    return data;
  },
};
