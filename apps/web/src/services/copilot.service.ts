import { api } from '@/lib/api';

export type CopilotToolCall = {
  tool: string;
  resultSummary: string;
};

export type CopilotChatResponse = {
  sessionId: string;
  reply: string;
  toolCalls: CopilotToolCall[];
  requiresConfirmation: boolean;
  confirmationToken?: string;
  draftQuote: DraftQuotePreview | null;
  proposedAction: null | {
    type: string;
    payload: Record<string, unknown>;
  };
};

export type DraftQuotePreview = {
  depth: number;
  recommendedHp: string;
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
  }>;
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

  getLatestSession: async () => {
    const res = await api.get<CopilotSessionHistory>('/copilot/sessions/latest');
    return res.data;
  },

  getSession: async (sessionId: string) => {
    const res = await api.get<CopilotSessionHistory>(`/copilot/sessions/${sessionId}`);
    return res.data;
  },
};
