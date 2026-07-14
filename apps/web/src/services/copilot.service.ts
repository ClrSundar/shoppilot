import { api } from '@/lib/api';

export type CopilotToolCall = {
  tool: string;
  resultSummary: string;
};

export type RecommendationScoreBreakdown = {
  attributeMatch: number;
  stock: number;
  price: number;
  compatibility: number;
  total: number;
};

export type RecommendationCandidate = {
  rank: number;
  productId: string;
  productName: string;
  sku: string;
  sellingPrice: number;
  stockQty: number;
  scoreBreakdown: RecommendationScoreBreakdown;
  selectedReason: string;
};

export type CopilotRecommendation = {
  recommendationRunId: string;
  status: 'MATCHED' | 'NO_MATCH' | 'ERROR';
  appliedRule: {
    id: string;
    code: string;
    name: string;
    version: number;
    scope: 'tenant' | 'platform';
  } | null;
  explanation: string;
  primaryRecommendation: {
    productId: string;
    productName: string;
    sku: string;
    score: number;
    scoreBreakdown: RecommendationScoreBreakdown;
    selectedReason: string;
  } | null;
  alternatives: string[];
  solutionItems: {
    required: string[];
    recommended: string[];
    optional: string[];
  };
  candidates: RecommendationCandidate[];
  missingFields?: string[];
  reasonCode?: 'MISSING_REQUIRED_FIELDS' | 'NO_RULE_FOR_INPUT';
  suggestedAction?: string;
  warnings?: string[];
  errorMessage?: string;
};

export type CopilotChatResponse = {
  sessionId: string;
  reply: string;
  toolCalls: CopilotToolCall[];
  requiresConfirmation: boolean;
  confirmationToken?: string;
  draftQuote: DraftQuotePreview | null;
  recommendation: CopilotRecommendation | null;
  proposedAction: null | {
    type: string;
    payload: Record<string, unknown>;
  };
};

export type DraftQuotePreview = {
  depth: number;
  recommendedHp: string;
  recommendationRunId?: string;
  appliedRuleCode?: string;
  suggestedCustomerId?: string;
  suggestedCustomerName?: string;
  itemCount: number;
  motorSubtotal: number;
  accessorySubtotal: number;
  estimatedTotal: number;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    kind: 'MOTOR' | 'ACCESSORY';
    requirementType?: 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';
  }>;
  optionalItems?: Array<{
    productId: string;
    name: string;
    unitPrice: number;
  }>;
};

export type RecommendationFeedbackRequest = {
  runId: string;
  action: 'ACCEPTED' | 'CHANGED_PRODUCT' | 'REJECTED';
  selectedAlternativeProductId?: string;
  reason?: 'PRICE' | 'STOCK' | 'CUSTOMER_PREFERENCE' | 'BRAND_PREFERENCE' | 'OTHER';
  notes?: string;
};

export type PreviousMessage = {
  role: 'user' | 'assistant';
  text: string;
};

export type CopilotSessionHistory = {
  sessionId: string | null;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    text: string;
    metadata?: {
      draftQuote?: DraftQuotePreview | null;
      recommendation?: CopilotRecommendation | null;
      proposedAction?: null | {
        type: string;
        payload: Record<string, unknown>;
      };
      requiresConfirmation?: boolean;
      confirmationToken?: string;
    };
    createdAt: string;
  }>;
};

export const copilotService = {
  chat: async (
    message: string,
    previousMessages: PreviousMessage[] = [],
    sessionId?: string,
  ) => {
    const res = await api.post<CopilotChatResponse>('/copilot/chat', {
      message,
      previousMessages,
      sessionId,
    });

    return res.data;
  },

  confirmDraft: async (payload: {
    sessionId: string;
    confirmationToken: string;
    idempotencyKey: string;
    customerId: string;
    motorProductId?: string;
    accessories: Array<{ productId: string; quantity: number }>;
    depth?: number;
    recommendedHp?: string;
    recommendationRunId?: string;
    cableLengthM?: number;
    pipeLengthM?: number;
    ropeLengthM?: number;
    notes?: string;
  }) => {
    const res = await api.post<{
      success: boolean;
      quoteId: string;
      quoteNumber: string;
      status: string;
      totalAmount: number;
      customer: { id: string; name: string };
      idempotentReplay: boolean;
    }>('/copilot/confirm-draft', payload);

    return res.data;
  },

  submitRecommendationFeedback: async (payload: RecommendationFeedbackRequest) => {
    const res = await api.post<{
      runId: string;
      feedbackId: string;
      action: string;
      acceptedProductIds: string[];
      rejectedProductIds: string[];
      notes: string | null;
      createdAt: string;
    }>('/decisions/feedback', payload);

    return res.data;
  },

  getLatestSession: async () => {
    const res = await api.get<CopilotSessionHistory>('/copilot/sessions/latest');
    return res.data;
  },

  getSession: async (sessionId: string) => {
    const res = await api.get<CopilotSessionHistory>(`/copilot/sessions/${sessionId}`);
    return res.data;
  },
};
