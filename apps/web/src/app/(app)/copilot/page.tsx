'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { useMutation, useQuery } from '@tanstack/react-query';

import { AppToast } from '@/components/common/AppToast';
import { useAppToast } from '@/hooks/use-app-toast';
import { customersService } from '@/services/customers.service';
import {
  DraftQuotePreview,
  PreviousMessage,
  copilotService,
} from '@/services/copilot.service';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  draftQuote?: DraftQuotePreview | null;
  proposedAction?: null | {
    type: string;
    payload: Record<string, unknown>;
  };
  requiresConfirmation?: boolean;
};

const starterPrompts = [
  'Show me my dashboard snapshot',
  'How many pending quotes do we have?',
  'How many workers are active?',
  'I have a borewell of depth 320ft what motor should i use and accessories needed',
];

export default function CopilotPage() {
  const { toast, showToast, closeToast } = useAppToast();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: customersService.getAll,
  });

  const sessionId = useMemo(
    () => `session-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  const chatMutation = useMutation({
    mutationFn: (message: string) => {
      const context: PreviousMessage[] = messages.slice(-8).map((m) => ({
        role: m.role,
        text: m.text,
      }));
      return copilotService.chat(message, context, sessionId);
    },
    onSuccess: (data, message) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'user',
          text: message,
        },
        {
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          text: data.reply,
          draftQuote: data.draftQuote,
          proposedAction: data.proposedAction,
          requiresConfirmation: data.requiresConfirmation,
        },
      ]);
      setInput('');
    },
    onError: () => {
      showToast('Copilot request failed. Please try again.', 'error');
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const message = input.trim();

    if (!message || chatMutation.isPending) {
      return;
    }

    chatMutation.mutate(message);
  };

  const runStarterPrompt = (message: string) => {
    if (chatMutation.isPending) {
      return;
    }

    chatMutation.mutate(message);
  };

  const confirmDraftMutation = useMutation({
    mutationFn: (message: ChatMessage) => {
      if (!selectedCustomerId) {
        throw new Error('Please select a customer before confirming the quote.');
      }

      const payload = message.proposedAction?.payload as
        | {
            motorProductId?: string | null;
            accessories?: Array<{ productId: string; quantity: number }>;
            depth?: number;
            recommendedHp?: string;
          }
        | undefined;

      if (!payload) {
        throw new Error('Draft payload missing. Please regenerate the draft.');
      }

      return copilotService.confirmDraft({
        customerId: selectedCustomerId,
        motorProductId: payload.motorProductId ?? undefined,
        accessories: payload.accessories ?? [],
        depth: payload.depth,
        recommendedHp: payload.recommendedHp,
      });
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          text: `Quote created successfully: ${data.quoteNumber} (Rs ${data.totalAmount.toFixed(2)}) for ${data.customer.name}.`,
        },
      ]);
      showToast('Draft confirmed and quote created', 'success');
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to confirm draft quote. Please try again.';
      showToast(message, 'error');
    },
  });

  return (
    <Box>
      <Card
        sx={{
          mb: 3,
          borderRadius: 3,
          background:
            'linear-gradient(120deg, rgba(9, 27, 58, 1) 0%, rgba(5, 89, 127, 1) 55%, rgba(37, 146, 121, 1) 100%)',
          color: 'common.white',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
          <Stack spacing={1.2}>
            <Chip
              label="Copilot"
              sx={{
                alignSelf: 'flex-start',
                bgcolor: 'rgba(255, 255, 255, 0.16)',
                color: 'common.white',
                fontWeight: 700,
              }}
            />
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              Ask About Quotes, Team, Inventory, and Motor Suggestions
            </Typography>
            <Typography sx={{ opacity: 0.9 }}>
              This phase is read-first and confirmation-first for safety. Ask business questions or domain recommendations.
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, mb: 2 }}>
        {starterPrompts.map((prompt) => (
          <Button
            key={prompt}
            variant="outlined"
            size="small"
            onClick={() => runStarterPrompt(prompt)}
            disabled={chatMutation.isPending}
          >
            {prompt}
          </Button>
        ))}
      </Stack>

      <Card sx={{ borderRadius: 3, mb: 2 }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ maxHeight: 520, overflowY: 'auto', p: 2 }}>
            {messages.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Start with a prompt above or type your own question.
              </Alert>
            ) : (
              <Stack spacing={1.5}>
                {messages.map((message) => (
                  <Box
                    key={message.id}
                    sx={{
                      alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: { xs: '100%', md: '84%' },
                      px: 1.75,
                      py: 1.25,
                      borderRadius: 2,
                      bgcolor:
                        message.role === 'user'
                          ? 'primary.main'
                          : 'grey.100',
                      color:
                        message.role === 'user'
                          ? 'primary.contrastText'
                          : 'text.primary',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                      {message.role === 'user' ? 'You' : 'Copilot'}
                    </Typography>
                    <Typography variant="body2">{message.text}</Typography>

                    {message.draftQuote ? (
                      <Box
                        sx={{
                          mt: 1.2,
                          p: 1.25,
                          borderRadius: 1.5,
                          bgcolor: 'rgba(255,255,255,0.55)',
                          color: 'text.primary',
                        }}
                      >
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          Draft Quote Preview
                        </Typography>
                        <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
                          Depth: {message.draftQuote.depth} ft | Recommended HP: {message.draftQuote.recommendedHp}
                        </Typography>
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          Items: {message.draftQuote.itemCount} | Motor: Rs {message.draftQuote.motorSubtotal.toFixed(2)} | Accessories: Rs {message.draftQuote.accessorySubtotal.toFixed(2)}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                          Estimated Total: Rs {message.draftQuote.estimatedTotal.toFixed(2)}
                        </Typography>

                        {message.draftQuote.items.slice(0, 6).map((item, index) => (
                          <Typography key={`${message.id}-draft-item-${index}`} variant="caption" sx={{ display: 'block' }}>
                            {index + 1}) {item.name} x {item.quantity} = Rs {item.lineTotal.toFixed(2)}
                          </Typography>
                        ))}

                        {message.proposedAction?.type === 'DRAFT_QUOTE' ? (
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1 }}>
                            <TextField
                              select
                              size="small"
                              value={selectedCustomerId}
                              onChange={(event) => setSelectedCustomerId(event.target.value)}
                              sx={{ minWidth: 240, bgcolor: 'white' }}
                              label="Select Customer"
                            >
                              {customers.map((customer) => (
                                <MenuItem key={customer.id} value={customer.id}>
                                  {customer.name}
                                </MenuItem>
                              ))}
                            </TextField>
                            <Button
                              size="small"
                              variant="contained"
                              disabled={confirmDraftMutation.isPending}
                              onClick={() => confirmDraftMutation.mutate(message)}
                            >
                              {confirmDraftMutation.isPending
                                ? 'Creating...'
                                : 'Confirm and Create Quote'}
                            </Button>
                          </Stack>
                        ) : null}
                      </Box>
                    ) : null}

                    {message.requiresConfirmation ? (
                      <Chip
                        size="small"
                        label="Confirmation required"
                        color="warning"
                        sx={{ mt: 1 }}
                      />
                    ) : null}
                  </Box>
                ))}
              </Stack>
            )}
          </Box>

          <Divider />

          <Box component="form" onSubmit={handleSubmit} sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2}>
              <TextField
                fullWidth
                placeholder="Ask anything about your tenant data..."
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={chatMutation.isPending || input.trim().length === 0}
                sx={{ minWidth: 120 }}
              >
                {chatMutation.isPending ? <CircularProgress size={20} color="inherit" /> : 'Send'}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}
