import { api } from '@/lib/api';

export type CopilotToolCall = {
  tool: string;
  resultSummary: string;
};

export type CopilotChatResponse = {
  reply: string;
  toolCalls: CopilotToolCall[];
  requiresConfirmation: boolean;
  proposedAction: null | {
    type: string;
    payload: Record<string, unknown>;
  };
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
};
