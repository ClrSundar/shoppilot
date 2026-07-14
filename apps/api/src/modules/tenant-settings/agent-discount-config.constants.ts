import type { AgentDiscountCategory } from '../quotes/dto/create-quote.dto';

export const agentDiscountLabels: Record<AgentDiscountCategory, string> = {
  ENGINEER: 'Engineer',
  EXISTING_CUSTOMER: 'Existing Customer',
  DEALER: 'Dealer',
  CONTRACTOR: 'Contractor',
  OTHER: 'Other',
};

export const defaultAgentDiscountByCategory: Record<AgentDiscountCategory, number> = {
  ENGINEER: 5,
  EXISTING_CUSTOMER: 2,
  DEALER: 3,
  CONTRACTOR: 4,
  OTHER: 0,
};
