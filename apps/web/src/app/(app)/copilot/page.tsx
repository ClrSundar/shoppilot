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
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { useMutation } from '@tanstack/react-query';

import { AppToast } from '@/components/common/AppToast';
import { useAppToast } from '@/hooks/use-app-toast';
import { CopilotToolCall, copilotService } from '@/services/copilot.service';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: CopilotToolCall[];
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

  const sessionId = useMemo(
    () => `session-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  const chatMutation = useMutation({
    mutationFn: (message: string) => copilotService.chat(message, sessionId),
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
          toolCalls: data.toolCalls,
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

                    {message.toolCalls && message.toolCalls.length > 0 ? (
                      <>
                        <Divider sx={{ my: 1, opacity: 0.5 }} />
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>
                          Tool calls
                        </Typography>
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                          {message.toolCalls.map((tool, index) => (
                            <Typography key={`${message.id}-tool-${index}`} variant="caption">
                              - {tool.tool}: {tool.resultSummary}
                            </Typography>
                          ))}
                        </Stack>
                      </>
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
