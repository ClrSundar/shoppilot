import { api } from '@/lib/api';

export type CopilotToolCall = {
  tool: string;
  resultSummary: string;
};

export type CopilotChatResponse = {
  reply: string;
  toolCalls: CopilotToolCall[];
  requiresConfirmation: boolean;
  draftQuote: DraftQuotePreview | null;
  proposedAction: null | {
    type: string;
    payload: Record<string, unknown>;
  };
};

export type DraftQuotePreview = {
  depth: number;
  recommendedHp: string;
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
    }>('/copilot/confirm-draft', payload);

    return res.data;
  },
};
