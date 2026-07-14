'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Collapse,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { useMutation, useQuery } from '@tanstack/react-query';

import { AppToast } from '@/components/common/AppToast';
import { useAppToast } from '@/hooks/use-app-toast';
import { customersService } from '@/services/customers.service';
import { productsService } from '@/services/products.service';
import {
  CopilotRecommendation,
  DraftQuotePreview,
  PreviousMessage,
  copilotService,
} from '@/services/copilot.service';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  draftQuote?: DraftQuotePreview | null;
  recommendation?: CopilotRecommendation | null;
  proposedAction?: null | {
    type: string;
    payload: Record<string, unknown>;
  };
  confirmationToken?: string;
  requiresConfirmation?: boolean;
};

const starterPrompts = [
  'Show me my dashboard snapshot',
  'How many pending quotes do we have?',
  'How many workers are active?',
  'I have a borewell of depth 320ft what motor should i use and accessories needed',
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeDraftQuote(draft: DraftQuotePreview): DraftQuotePreview {
  const items = draft.items.map((item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);

    return {
      ...item,
      quantity,
      unitPrice,
      lineTotal: Number((quantity * unitPrice).toFixed(2)),
    };
  });

  const motorSubtotal = Number(
    items
      .filter((item) => item.kind === 'MOTOR')
      .reduce((sum, item) => sum + item.lineTotal, 0)
      .toFixed(2),
  );
  const accessorySubtotal = Number(
    items
      .filter((item) => item.kind === 'ACCESSORY')
      .reduce((sum, item) => sum + item.lineTotal, 0)
      .toFixed(2),
  );

  return {
    ...draft,
    items,
    itemCount: items.length,
    motorSubtotal,
    accessorySubtotal,
    estimatedTotal: Number((motorSubtotal + accessorySubtotal).toFixed(2)),
  };
}

function isDepthSensitiveAccessory(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized.includes('cable') || normalized.includes('pipe') || normalized.includes('rope');
}

type InstallationLengths = {
  cableLengthM: string;
  pipeLengthM: string;
  ropeLengthM: string;
};

function getDefaultInstallationLengths(depth: number): InstallationLengths {
  return {
    cableLengthM: String(Math.max(1, Math.round(depth))),
    pipeLengthM: String(Math.max(1, Math.round(depth))),
    ropeLengthM: String(Math.max(1, Math.round(depth) + 10)),
  };
}

function getLengthForAccessory(
  itemName: string,
  lengths: InstallationLengths,
): number | null {
  const normalized = itemName.toLowerCase();

  if (normalized.includes('cable')) {
    const length = Number(lengths.cableLengthM);
    return Number.isFinite(length) && length > 0 ? length : null;
  }

  if (normalized.includes('pipe')) {
    const length = Number(lengths.pipeLengthM);
    return Number.isFinite(length) && length > 0 ? length : null;
  }

  if (normalized.includes('rope')) {
    const length = Number(lengths.ropeLengthM);
    return Number.isFinite(length) && length > 0 ? length : null;
  }

  return null;
}

export default function CopilotPage() {
  const { toast, showToast, closeToast } = useAppToast();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [selectedCustomerByMessage, setSelectedCustomerByMessage] =
    useState<Record<string, string>>({});
  const [draftEdits, setDraftEdits] = useState<Record<string, DraftQuotePreview>>({});
  const [draftAdditions, setDraftAdditions] = useState<
    Record<string, { productId: string; quantity: string }>
  >({});
  const [showDraftByMessage, setShowDraftByMessage] = useState<Record<string, boolean>>({});
  const [showRecommendationDetailsByMessage, setShowRecommendationDetailsByMessage] = useState<
    Record<string, boolean>
  >({});
  const [installationLengthsByMessage, setInstallationLengthsByMessage] = useState<
    Record<string, InstallationLengths>
  >({});
  const [showFeedbackByMessage, setShowFeedbackByMessage] = useState<Record<string, boolean>>({});
  const [feedbackDraftByMessage, setFeedbackDraftByMessage] = useState<
    Record<
      string,
      {
        action?: 'ACCEPTED' | 'CHANGED_PRODUCT' | 'REJECTED';
        selectedAlternativeProductId?: string;
        reason?:
          | 'PRICE'
          | 'STOCK'
          | 'CUSTOMER_PREFERENCE'
          | 'BRAND_PREFERENCE'
          | 'OTHER';
      }
    >
  >({});
  const [feedbackSubmittedByMessage, setFeedbackSubmittedByMessage] = useState<
    Record<string, boolean>
  >({});
  const [selectedAlternativeByMessage, setSelectedAlternativeByMessage] = useState<
    Record<string, string>
  >({});

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: customersService.getAll,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: productsService.getAll,
  });

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const latest = await copilotService.getLatestSession();

        if (!isMounted) {
          return;
        }

        if (latest.sessionId) {
          setSessionId(latest.sessionId);
        }

        if (latest.messages.length > 0) {
          const restoredMessages: ChatMessage[] = latest.messages.map((message) => ({
            id: message.id,
            role: message.role,
            text: message.text,
            draftQuote: message.metadata?.draftQuote,
            recommendation: message.metadata?.recommendation,
            proposedAction: message.metadata?.proposedAction,
            confirmationToken: message.metadata?.confirmationToken,
            requiresConfirmation: message.metadata?.requiresConfirmation,
          }));

          setMessages(restoredMessages);

          const restoredDrafts: Record<string, DraftQuotePreview> = {};
          const restoredCustomers: Record<string, string> = {};
          const restoredInstallationLengths: Record<string, InstallationLengths> = {};

          restoredMessages.forEach((message) => {
            if (message.draftQuote) {
              restoredDrafts[message.id] = normalizeDraftQuote(message.draftQuote);
              restoredInstallationLengths[message.id] = getDefaultInstallationLengths(
                message.draftQuote.depth,
              );

              if (message.draftQuote.suggestedCustomerId) {
                restoredCustomers[message.id] =
                  message.draftQuote.suggestedCustomerId;
              }
            }
          });

          if (Object.keys(restoredDrafts).length > 0) {
            setDraftEdits(restoredDrafts);
          }

          if (Object.keys(restoredCustomers).length > 0) {
            setSelectedCustomerByMessage(restoredCustomers);
          }

          if (Object.keys(restoredInstallationLengths).length > 0) {
            setInstallationLengthsByMessage(restoredInstallationLengths);
          }
        }
      } catch {
        // Ignore restore errors; user can still start a fresh session.
      } finally {
        if (isMounted) {
          setSessionLoaded(true);
        }
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const chatMutation = useMutation({
    mutationFn: (message: string) => {
      const context: PreviousMessage[] = messages.slice(-8).map((m) => ({
        role: m.role,
        text: m.text,
      }));
      return copilotService.chat(message, context, sessionId || undefined);
    },
    onSuccess: (data, message) => {
      if (!sessionId && data.sessionId) {
        setSessionId(data.sessionId);
      }

      const userId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const assistantId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      setMessages((prev) => [
        ...prev,
        {
          id: userId,
          role: 'user',
          text: message,
        },
        {
          id: assistantId,
          role: 'assistant',
          text: data.reply,
          draftQuote: data.draftQuote,
          recommendation: data.recommendation,
          proposedAction: data.proposedAction,
          confirmationToken: data.confirmationToken,
          requiresConfirmation: data.requiresConfirmation,
        },
      ]);

      if (data.draftQuote) {
        const normalized = normalizeDraftQuote(data.draftQuote);

        setDraftEdits((prev) => ({
          ...prev,
          [assistantId]: normalized,
        }));

        setDraftAdditions((prev) => ({
          ...prev,
          [assistantId]: {
            productId: '',
            quantity: '1',
          },
        }));

        setShowDraftByMessage((prev) => ({
          ...prev,
          [assistantId]: false,
        }));

        setSelectedCustomerByMessage((prev) => ({
          ...prev,
          [assistantId]: data.draftQuote?.suggestedCustomerId ?? '',
        }));

        setInstallationLengthsByMessage((prev) => ({
          ...prev,
          [assistantId]: getDefaultInstallationLengths(data.draftQuote?.depth ?? 300),
        }));
      }

      setInput('');
    },
    onError: () => {
      showToast('Copilot request failed. Please try again.', 'error');
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const message = input.trim();

    if (!message || chatMutation.isPending || !sessionLoaded) {
      return;
    }

    chatMutation.mutate(message);
  };

  const runStarterPrompt = (message: string) => {
    if (chatMutation.isPending || !sessionLoaded) {
      return;
    }

    chatMutation.mutate(message);
  };

  const getEffectiveDraft = (message: ChatMessage) => {
    if (!message.draftQuote) {
      return null;
    }

    return draftEdits[message.id] ?? message.draftQuote;
  };

  const handleDraftRemoveItem = (messageId: string, index: number) => {
    setDraftEdits((prev) => {
      const current = prev[messageId];

      if (!current) {
        return prev;
      }

      const item = current.items[index];

      if (!item || item.requirementType === 'REQUIRED') {
        return prev;
      }

      const nextItems = current.items.filter((_, itemIndex) => itemIndex !== index);

      return {
        ...prev,
        [messageId]: normalizeDraftQuote({
          ...current,
          items: nextItems,
        }),
      };
    });
  };

  const handleDraftQuantityChange = (
    messageId: string,
    index: number,
    quantityInput: string,
  ) => {
    setDraftEdits((prev) => {
      const current = prev[messageId];

      if (!current) {
        return prev;
      }

      const qty = Number(quantityInput);

      if (!Number.isFinite(qty) || qty <= 0) {
        return prev;
      }

      const nextItems = current.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              quantity: qty,
              lineTotal: Number((qty * item.unitPrice).toFixed(2)),
            }
          : item,
      );

      return {
        ...prev,
        [messageId]: normalizeDraftQuote({
          ...current,
          items: nextItems,
        }),
      };
    });
  };

  const handleDraftReplaceProduct = (
    messageId: string,
    index: number,
    productId: string,
  ) => {
    const selectedProduct = products.find((product) => product.id === productId);

    if (!selectedProduct) {
      return;
    }

    setDraftEdits((prev) => {
      const current = prev[messageId];

      if (!current) {
        return prev;
      }

      if (current.items[index]?.requirementType === 'REQUIRED') {
        return prev;
      }

      const nextItems = current.items.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const unitPrice = Number(selectedProduct.sellingPrice);

        return {
          ...item,
          productId: selectedProduct.id,
          name: selectedProduct.name,
          unitPrice,
          lineTotal: Number((item.quantity * unitPrice).toFixed(2)),
        };
      });

      return {
        ...prev,
        [messageId]: normalizeDraftQuote({
          ...current,
          items: nextItems,
        }),
      };
    });
  };

  const handleDraftAdditionChange = (
    messageId: string,
    field: 'productId' | 'quantity',
    value: string,
  ) => {
    setDraftAdditions((prev) => ({
      ...prev,
      [messageId]: {
        productId: prev[messageId]?.productId ?? '',
        quantity: prev[messageId]?.quantity ?? '1',
        [field]: value,
      },
    }));
  };

  const handleDraftAddItem = (messageId: string) => {
    const addition = draftAdditions[messageId];

    if (!addition?.productId) {
      showToast('Select a product to add', 'error');
      return;
    }

    const qty = Number(addition.quantity);

    if (!Number.isFinite(qty) || qty <= 0) {
      showToast('Quantity must be greater than 0', 'error');
      return;
    }

    const selectedProduct = products.find((product) => product.id === addition.productId);

    if (!selectedProduct) {
      showToast('Selected product not found', 'error');
      return;
    }

    setDraftEdits((prev) => {
      const current = prev[messageId];

      if (!current) {
        return prev;
      }

      const unitPrice = Number(selectedProduct.sellingPrice);
      const nextItems = [
        ...current.items,
        {
          productId: selectedProduct.id,
          name: selectedProduct.name,
          quantity: qty,
          unitPrice,
          lineTotal: Number((qty * unitPrice).toFixed(2)),
          kind: 'ACCESSORY' as const,
        },
      ];

      return {
        ...prev,
        [messageId]: normalizeDraftQuote({
          ...current,
          items: nextItems,
        }),
      };
    });

    setDraftAdditions((prev) => ({
      ...prev,
      [messageId]: {
        productId: '',
        quantity: '1',
      },
    }));
  };

  const handleOptionalAccessoryToggle = (
    messageId: string,
    optionalItem: { productId: string; name: string; unitPrice: number },
    checked: boolean,
  ) => {
    setDraftEdits((prev) => {
      const current = prev[messageId];

      if (!current) {
        return prev;
      }

      const exists = current.items.some(
        (item) => item.productId === optionalItem.productId,
      );

      if (checked && !exists) {
        const nextItems = [
          ...current.items,
          {
            productId: optionalItem.productId,
            name: optionalItem.name,
            quantity: 1,
            unitPrice: optionalItem.unitPrice,
            lineTotal: Number(optionalItem.unitPrice.toFixed(2)),
            kind: 'ACCESSORY' as const,
            requirementType: 'OPTIONAL' as const,
          },
        ];

        return {
          ...prev,
          [messageId]: normalizeDraftQuote({
            ...current,
            items: nextItems,
          }),
        };
      }

      if (!checked && exists) {
        const nextItems = current.items.filter(
          (item) => item.productId !== optionalItem.productId,
        );

        return {
          ...prev,
          [messageId]: normalizeDraftQuote({
            ...current,
            items: nextItems,
          }),
        };
      }

      return prev;
    });
  };

  const applyInstallationLengthsToDraft = (
    messageId: string,
    lengths: InstallationLengths,
  ) => {
    setDraftEdits((prev) => {
      const current = prev[messageId];

      if (!current) {
        return prev;
      }

      const nextItems = current.items.map((item) => {
        if (item.kind !== 'ACCESSORY' || !isDepthSensitiveAccessory(item.name)) {
          return item;
        }

        const length = getLengthForAccessory(item.name, lengths);

        if (length === null) {
          return item;
        }

        return {
          ...item,
          quantity: length,
          lineTotal: Number((length * item.unitPrice).toFixed(2)),
        };
      });

      return {
        ...prev,
        [messageId]: normalizeDraftQuote({
          ...current,
          items: nextItems,
        }),
      };
    });
  };

  const handleInstallationLengthChange = (
    messageId: string,
    field: keyof InstallationLengths,
    value: string,
  ) => {
    setInstallationLengthsByMessage((prev) => {
      const current =
        prev[messageId] ??
        getDefaultInstallationLengths(
          (draftEdits[messageId] ?? messages.find((m) => m.id === messageId)?.draftQuote)?.depth ??
            300,
        );

      const next = {
        ...current,
        [field]: value,
      };

      applyInstallationLengthsToDraft(messageId, next);

      return {
        ...prev,
        [messageId]: next,
      };
    });
  };

  const confirmDraftMutation = useMutation({
    mutationFn: (message: ChatMessage) => {
      const selectedCustomerId = selectedCustomerByMessage[message.id] ?? '';

      if (!selectedCustomerId) {
        throw new Error('Please select a customer before confirming the quote.');
      }

      const effectiveDraft = getEffectiveDraft(message);

      if (!effectiveDraft) {
        throw new Error('Draft payload missing. Please regenerate the draft.');
      }

      const motorItem = effectiveDraft.items.find((item) => item.kind === 'MOTOR');
      const accessories = effectiveDraft.items
        .filter((item) => item.kind === 'ACCESSORY')
        .map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        }));

      const confirmationToken = message.confirmationToken;

      if (!confirmationToken) {
        throw new Error('Confirmation token missing. Please regenerate the draft.');
      }

      const installationLengths =
        installationLengthsByMessage[message.id] ??
        getDefaultInstallationLengths(effectiveDraft.depth);

      return copilotService.confirmDraft({
        sessionId,
        confirmationToken,
        idempotencyKey: message.id,
        customerId: selectedCustomerId,
        motorProductId: motorItem?.productId,
        accessories,
        depth: effectiveDraft.depth,
        recommendedHp: effectiveDraft.recommendedHp,
        recommendationRunId:
          effectiveDraft.recommendationRunId ??
          message.recommendation?.recommendationRunId,
        cableLengthM: Number(installationLengths.cableLengthM) || undefined,
        pipeLengthM: Number(installationLengths.pipeLengthM) || undefined,
        ropeLengthM: Number(installationLengths.ropeLengthM) || undefined,
      });
    },
    onSuccess: (data, message) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          text: data.idempotentReplay
            ? `Quote already confirmed earlier: ${data.quoteNumber} (Rs ${data.totalAmount.toFixed(2)}) for ${data.customer.name}.`
            : `Quote created successfully: ${data.quoteNumber} (Rs ${data.totalAmount.toFixed(2)}) for ${data.customer.name}.`,
        },
      ]);

      if (message.recommendation?.recommendationRunId) {
        setShowFeedbackByMessage((prev) => ({
          ...prev,
          [message.id]: true,
        }));
      }

      showToast(
        data.idempotentReplay
          ? 'Already confirmed earlier. Reused existing quote.'
          : 'Draft confirmed and quote created',
        'success',
      );
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to confirm draft quote. Please try again.';
      showToast(message, 'error');
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: (payload: {
      messageId: string;
      runId: string;
      action: 'ACCEPTED' | 'CHANGED_PRODUCT' | 'REJECTED';
      selectedAlternativeProductId?: string;
      reason?:
        | 'PRICE'
        | 'STOCK'
        | 'CUSTOMER_PREFERENCE'
        | 'BRAND_PREFERENCE'
        | 'OTHER';
    }) =>
      copilotService.submitRecommendationFeedback({
        runId: payload.runId,
        action: payload.action,
        selectedAlternativeProductId: payload.selectedAlternativeProductId,
        reason: payload.reason,
      }),
    onSuccess: (_data, variables) => {
      setFeedbackSubmittedByMessage((prev) => ({
        ...prev,
        [variables.messageId]: true,
      }));
      showToast('Recommendation feedback recorded', 'success');
    },
    onError: () => {
      showToast('Failed to save recommendation feedback', 'error');
    },
  });

  const handleDraftCustomerChange = (messageId: string, customerId: string) => {
    setSelectedCustomerByMessage((prev) => ({
      ...prev,
      [messageId]: customerId,
    }));
  };

  const openDraftEditor = (messageId: string) => {
    setShowDraftByMessage((prev) => ({
      ...prev,
      [messageId]: true,
    }));
  };

  const toggleRecommendationDetails = (messageId: string) => {
    setShowRecommendationDetailsByMessage((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const selectFeedbackAction = (
    messageId: string,
    action: 'ACCEPTED' | 'CHANGED_PRODUCT' | 'REJECTED',
  ) => {
    setFeedbackDraftByMessage((prev) => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        action,
      },
    }));
  };

  const updateFeedbackDraft = (
    messageId: string,
    key: 'selectedAlternativeProductId' | 'reason',
    value: string,
  ) => {
    setFeedbackDraftByMessage((prev) => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        [key]: value,
      },
    }));
  };

  const submitFeedback = (message: ChatMessage) => {
    if (!message.recommendation?.recommendationRunId) {
      showToast('Recommendation run not found for feedback', 'error');
      return;
    }

    const draft = feedbackDraftByMessage[message.id];

    if (!draft?.action) {
      showToast('Choose a feedback action first', 'error');
      return;
    }

    if (draft.action === 'CHANGED_PRODUCT' && !draft.selectedAlternativeProductId) {
      showToast('Select an alternative product for changed-product feedback', 'error');
      return;
    }

    feedbackMutation.mutate({
      messageId: message.id,
      runId: message.recommendation.recommendationRunId,
      action: draft.action,
      selectedAlternativeProductId: draft.selectedAlternativeProductId,
      reason: draft.reason,
    });
  };

  const buildWhyNotExplanation = (message: ChatMessage, alternativeProductId: string) => {
    const recommendation = message.recommendation;

    if (!recommendation) {
      return null;
    }

    const topCandidate = recommendation.candidates.find((candidate) => candidate.rank === 1);
    const alternativeCandidate = recommendation.candidates.find(
      (candidate) => candidate.productId === alternativeProductId,
    );

    if (!topCandidate || !alternativeCandidate) {
      return null;
    }

    const reasons: string[] = [];

    if (alternativeCandidate.stockQty < topCandidate.stockQty) {
      reasons.push(`lower stock (${alternativeCandidate.stockQty}) than ${topCandidate.productName} (${topCandidate.stockQty})`);
    }

    if (alternativeCandidate.sellingPrice > topCandidate.sellingPrice) {
      reasons.push(
        `higher selling price (${formatCurrency(alternativeCandidate.sellingPrice)}) than ${topCandidate.productName} (${formatCurrency(topCandidate.sellingPrice)})`,
      );
    }

    if (reasons.length === 0) {
      reasons.push('slightly lower composite score in this rule setup');
    }

    return `${alternativeCandidate.productName} is suitable, but ranked lower because ${reasons.join(' and ')}.`;
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

                    {message.recommendation ? (
                      <Card
                        variant="outlined"
                        sx={{
                          mt: 1.25,
                          borderRadius: 2,
                          bgcolor: 'background.paper',
                          color: 'text.primary',
                          borderColor: 'divider',
                        }}
                      >
                        <CardContent sx={{ p: 1.5 }}>
                          <Stack spacing={1.25}>
                            {(() => {
                              const primary = message.recommendation?.primaryRecommendation;
                              const primaryCandidate = message.recommendation?.candidates.find(
                                (candidate) =>
                                  candidate.rank === 1 ||
                                  candidate.productId === primary?.productId,
                              );

                              return (
                                <Box>
                                  <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                                    Best Match
                                  </Typography>
                                  <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                                    {primary?.productName ?? 'No suitable match found'}
                                  </Typography>
                                  {primaryCandidate ? (
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                      {`${formatCurrency(primaryCandidate.sellingPrice)} • ${primaryCandidate.stockQty} in stock`}
                                    </Typography>
                                  ) : null}
                                  <Typography variant="body2" sx={{ mt: 0.8 }}>
                                    {message.recommendation.explanation}
                                  </Typography>
                                </Box>
                              );
                            })()}

                            {message.recommendation.warnings?.length ? (
                              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                                {message.recommendation.warnings.join(' ')}
                              </Alert>
                            ) : null}

                            <Box
                              sx={{
                                p: 1.25,
                                borderRadius: 2,
                                bgcolor: 'grey.50',
                                border: '1px solid',
                                borderColor: 'divider',
                              }}
                            >
                              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>
                                Why this is recommended
                              </Typography>
                              <Typography variant="body2" sx={{ mb: 1 }}>
                                Matches your borewell depth and power supply.
                              </Typography>
                              <Typography variant="body2">
                                {message.recommendation.primaryRecommendation?.selectedReason ??
                                  'Available in stock and aligned with the configured recommendation rule.'}
                              </Typography>
                            </Box>

                            {message.recommendation.primaryRecommendation ? (
                              <Box>
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={() => toggleRecommendationDetails(message.id)}
                                  sx={{ px: 0, minWidth: 0 }}
                                >
                                  View recommendation details
                                </Button>
                                <Collapse in={showRecommendationDetailsByMessage[message.id] === true}>
                                  <Box
                                    sx={{
                                      mt: 0.8,
                                      p: 1,
                                      borderRadius: 1.5,
                                      bgcolor: 'grey.50',
                                      border: '1px solid',
                                      borderColor: 'divider',
                                    }}
                                  >
                                    <Typography variant="caption" sx={{ display: 'block' }}>
                                      Rule applied:{' '}
                                      {message.recommendation.appliedRule?.code ?? 'No rule applied'}
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'block' }}>
                                      Match score: {message.recommendation.primaryRecommendation.score}
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'block' }}>
                                      Attribute match:{' '}
                                      {
                                        message.recommendation.primaryRecommendation.scoreBreakdown
                                          .attributeMatch
                                      }
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'block' }}>
                                      Stock availability:{' '}
                                      {message.recommendation.primaryRecommendation.scoreBreakdown.stock}
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'block' }}>
                                      Price fit:{' '}
                                      {message.recommendation.primaryRecommendation.scoreBreakdown.price}
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'block' }}>
                                      Compatibility:{' '}
                                      {
                                        message.recommendation.primaryRecommendation.scoreBreakdown
                                          .compatibility
                                      }
                                    </Typography>
                                  </Box>
                                </Collapse>
                              </Box>
                            ) : null}

                            {message.recommendation.alternatives.length > 0 ? (
                              <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.75 }}>
                                  Other suitable options
                                </Typography>
                                <Stack spacing={0.5}>
                                  {message.recommendation.alternatives.map((alternative) => (
                                    <Typography key={alternative} variant="body2">
                                      {alternative}
                                    </Typography>
                                  ))}
                                </Stack>

                                <Stack
                                  direction={{ xs: 'column', md: 'row' }}
                                  spacing={0.75}
                                  sx={{ mt: 0.8, alignItems: { xs: 'stretch', md: 'center' } }}
                                >
                                  <TextField
                                    select
                                    size="small"
                                    label="Why not this?"
                                    value={selectedAlternativeByMessage[message.id] ?? ''}
                                    onChange={(event) =>
                                      setSelectedAlternativeByMessage((prev) => ({
                                        ...prev,
                                        [message.id]: event.target.value,
                                      }))
                                    }
                                    sx={{ minWidth: 260, bgcolor: 'white' }}
                                  >
                                    {message.recommendation.candidates
                                      .filter((candidate) => candidate.rank !== 1)
                                      .map((candidate) => (
                                        <MenuItem
                                          key={`${message.id}-why-not-${candidate.productId}`}
                                          value={candidate.productId}
                                        >
                                          {candidate.productName}
                                        </MenuItem>
                                      ))}
                                  </TextField>
                                </Stack>

                                {selectedAlternativeByMessage[message.id] ? (
                                  <Alert severity="info" sx={{ mt: 0.8, borderRadius: 2 }}>
                                    {buildWhyNotExplanation(
                                      message,
                                      selectedAlternativeByMessage[message.id],
                                    )}
                                  </Alert>
                                ) : null}
                              </Box>
                            ) : null}

                            <Stack spacing={1}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                Included in this solution
                              </Typography>
                              {[
                                { label: 'Required', items: message.recommendation.solutionItems.required },
                                { label: 'Recommended', items: message.recommendation.solutionItems.recommended },
                                { label: 'Optional', items: message.recommendation.solutionItems.optional },
                              ].map((section) =>
                                section.items.length > 0 ? (
                                  <Box key={section.label}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.75 }}>
                                      {section.label}
                                    </Typography>
                                    <Stack spacing={0.35}>
                                      {section.items.map((item) => (
                                        <Typography key={`${section.label}-${item}`} variant="body2">
                                          {section.label === 'Optional' ? '○' : '✓'} {item}
                                        </Typography>
                                      ))}
                                    </Stack>
                                  </Box>
                                ) : null,
                              )}
                            </Stack>

                            {message.draftQuote ? (
                              <Stack
                                direction={{ xs: 'column', md: 'row' }}
                                spacing={1}
                                sx={{ alignItems: { xs: 'stretch', md: 'center' } }}
                              >
                                <Button
                                  variant="contained"
                                  onClick={() => openDraftEditor(message.id)}
                                  disabled={showDraftByMessage[message.id] === true}
                                >
                                  {showDraftByMessage[message.id] ? 'Quote Draft Open' : 'Create Quote Draft'}
                                </Button>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                  Estimated solution total: {formatCurrency((getEffectiveDraft(message)?.estimatedTotal ?? 0))}
                                </Typography>
                              </Stack>
                            ) : null}
                          </Stack>
                        </CardContent>
                      </Card>
                    ) : null}

                    {message.draftQuote && (!message.recommendation || showDraftByMessage[message.id]) ? (
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
                        {(() => {
                          const effectiveDraft = getEffectiveDraft(message);

                          if (!effectiveDraft) {
                            return null;
                          }

                          const addition = draftAdditions[message.id] ?? {
                            productId: '',
                            quantity: '1',
                          };
                          const installationLengths =
                            installationLengthsByMessage[message.id] ??
                            getDefaultInstallationLengths(effectiveDraft.depth);

                          return (
                            <>
                              <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
                                Depth: {effectiveDraft.depth} ft | Recommended HP: {effectiveDraft.recommendedHp}
                              </Typography>
                              <Typography variant="caption" sx={{ display: 'block' }}>
                                Items: {effectiveDraft.itemCount} | Motor: Rs {effectiveDraft.motorSubtotal.toFixed(2)} | Accessories: Rs {effectiveDraft.accessorySubtotal.toFixed(2)}
                              </Typography>
                              {effectiveDraft.suggestedCustomerName ? (
                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  Suggested customer: {effectiveDraft.suggestedCustomerName}
                                </Typography>
                              ) : null}
                              <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                                Estimated Total: Rs {effectiveDraft.estimatedTotal.toFixed(2)}
                              </Typography>

                              <Box
                                sx={{
                                  mt: 1,
                                  p: 1,
                                  borderRadius: 1.5,
                                  border: '1px solid',
                                  borderColor: 'divider',
                                  bgcolor: 'white',
                                }}
                              >
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                                  Installation quantity confirmation
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', mb: 0.75 }}>
                                  Bore depth: {effectiveDraft.depth} ft
                                </Typography>
                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.8}>
                                  <TextField
                                    size="small"
                                    label="Cable length (m)"
                                    type="number"
                                    value={installationLengths.cableLengthM}
                                    onChange={(event) =>
                                      handleInstallationLengthChange(
                                        message.id,
                                        'cableLengthM',
                                        event.target.value,
                                      )
                                    }
                                    sx={{ width: 160, bgcolor: 'white' }}
                                  />
                                  <TextField
                                    size="small"
                                    label="Pipe length (m)"
                                    type="number"
                                    value={installationLengths.pipeLengthM}
                                    onChange={(event) =>
                                      handleInstallationLengthChange(
                                        message.id,
                                        'pipeLengthM',
                                        event.target.value,
                                      )
                                    }
                                    sx={{ width: 160, bgcolor: 'white' }}
                                  />
                                  <TextField
                                    size="small"
                                    label="Rope length (m)"
                                    type="number"
                                    value={installationLengths.ropeLengthM}
                                    onChange={(event) =>
                                      handleInstallationLengthChange(
                                        message.id,
                                        'ropeLengthM',
                                        event.target.value,
                                      )
                                    }
                                    sx={{ width: 160, bgcolor: 'white' }}
                                  />
                                </Stack>
                              </Box>

                              <Stack spacing={0.8} sx={{ mt: 0.8 }}>
                                {effectiveDraft.items.map((item, index) => (
                                  <Stack
                                    key={`${message.id}-draft-item-${index}`}
                                    direction={{ xs: 'column', md: 'row' }}
                                    spacing={0.8}
                                  >
                                    <TextField
                                      select
                                      size="small"
                                      value={item.productId}
                                      disabled={item.requirementType === 'REQUIRED'}
                                      onChange={(event) =>
                                        handleDraftReplaceProduct(
                                          message.id,
                                          index,
                                          event.target.value,
                                        )
                                      }
                                      sx={{ minWidth: 240, bgcolor: 'white' }}
                                    >
                                      {products.map((product) => (
                                        <MenuItem key={product.id} value={product.id}>
                                          {product.name}
                                        </MenuItem>
                                      ))}
                                    </TextField>

                                    <TextField
                                      size="small"
                                      type="number"
                                      label="Qty"
                                      value={item.quantity}
                                      onChange={(event) =>
                                        handleDraftQuantityChange(
                                          message.id,
                                          index,
                                          event.target.value,
                                        )
                                      }
                                      sx={{ width: 96, bgcolor: 'white' }}
                                      slotProps={{
                                        htmlInput: {
                                          min: 0.01,
                                          step: 0.01,
                                        },
                                      }}
                                    />

                                    <Typography
                                      variant="caption"
                                      sx={{ display: 'flex', alignItems: 'center', minWidth: 140 }}
                                    >
                                      Rs {item.lineTotal.toFixed(2)}
                                    </Typography>

                                    <Button
                                      size="small"
                                      color="error"
                                      variant="outlined"
                                      disabled={item.requirementType === 'REQUIRED'}
                                      onClick={() => handleDraftRemoveItem(message.id, index)}
                                    >
                                      Remove
                                    </Button>

                                    {item.kind === 'ACCESSORY' &&
                                    isDepthSensitiveAccessory(item.name) ? (
                                      <Typography
                                        variant="caption"
                                        sx={{ color: 'text.secondary', display: 'block' }}
                                      >
                                        Quantity to be confirmed during quote preparation
                                      </Typography>
                                    ) : null}
                                  </Stack>
                                ))}
                              </Stack>

                              {effectiveDraft.optionalItems && effectiveDraft.optionalItems.length > 0 ? (
                                <Box
                                  sx={{
                                    mt: 1,
                                    p: 1,
                                    borderRadius: 1.5,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    bgcolor: 'white',
                                  }}
                                >
                                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                                    Optional accessories (unchecked by default)
                                  </Typography>
                                  <Stack>
                                    {effectiveDraft.optionalItems.map((optionalItem) => {
                                      const isChecked = effectiveDraft.items.some(
                                        (item) => item.productId === optionalItem.productId,
                                      );

                                      return (
                                        <FormControlLabel
                                          key={`${message.id}-optional-${optionalItem.productId}`}
                                          control={
                                            <Checkbox
                                              checked={isChecked}
                                              onChange={(event) =>
                                                handleOptionalAccessoryToggle(
                                                  message.id,
                                                  optionalItem,
                                                  event.target.checked,
                                                )
                                              }
                                            />
                                          }
                                          label={`${optionalItem.name} (${formatCurrency(optionalItem.unitPrice)})`}
                                        />
                                      );
                                    })}
                                  </Stack>
                                </Box>
                              ) : null}

                              <Stack
                                direction={{ xs: 'column', md: 'row' }}
                                spacing={0.8}
                                sx={{ mt: 1 }}
                              >
                                <TextField
                                  select
                                  size="small"
                                  value={addition.productId}
                                  onChange={(event) =>
                                    handleDraftAdditionChange(
                                      message.id,
                                      'productId',
                                      event.target.value,
                                    )
                                  }
                                  sx={{ minWidth: 240, bgcolor: 'white' }}
                                  label="Add Product"
                                >
                                  {products.map((product) => (
                                    <MenuItem key={product.id} value={product.id}>
                                      {product.name}
                                    </MenuItem>
                                  ))}
                                </TextField>

                                <TextField
                                  size="small"
                                  type="number"
                                  label="Qty"
                                  value={addition.quantity}
                                  onChange={(event) =>
                                    handleDraftAdditionChange(
                                      message.id,
                                      'quantity',
                                      event.target.value,
                                    )
                                  }
                                  sx={{ width: 96, bgcolor: 'white' }}
                                  slotProps={{
                                    htmlInput: {
                                      min: 0.01,
                                      step: 0.01,
                                    },
                                  }}
                                />

                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => handleDraftAddItem(message.id)}
                                >
                                  Add Item
                                </Button>
                              </Stack>
                            </>
                          );
                        })()}

                        {message.proposedAction?.type === 'DRAFT_QUOTE' ? (
                          <Stack spacing={1} sx={{ mt: 1 }}>
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                              <TextField
                                select
                                size="small"
                                value={selectedCustomerByMessage[message.id] ?? ''}
                                onChange={(event) =>
                                  handleDraftCustomerChange(
                                    message.id,
                                    event.target.value,
                                  )
                                }
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
                                disabled={
                                  confirmDraftMutation.isPending ||
                                  !sessionId ||
                                  !message.confirmationToken
                                }
                                onClick={() => confirmDraftMutation.mutate(message)}
                              >
                                {confirmDraftMutation.isPending
                                  ? 'Creating...'
                                  : 'Confirm and Create Quote'}
                              </Button>
                            </Stack>

                            {showFeedbackByMessage[message.id] ? (
                              <Box
                                sx={{
                                  p: 1,
                                  borderRadius: 1.5,
                                  border: '1px solid',
                                  borderColor: 'divider',
                                  bgcolor: 'white',
                                }}
                              >
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                                  Was this recommendation useful?
                                </Typography>
                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.75}>
                                  <Button
                                    size="small"
                                    variant={
                                      feedbackDraftByMessage[message.id]?.action === 'ACCEPTED'
                                        ? 'contained'
                                        : 'outlined'
                                    }
                                    onClick={() => selectFeedbackAction(message.id, 'ACCEPTED')}
                                  >
                                    Accepted
                                  </Button>
                                  <Button
                                    size="small"
                                    variant={
                                      feedbackDraftByMessage[message.id]?.action ===
                                      'CHANGED_PRODUCT'
                                        ? 'contained'
                                        : 'outlined'
                                    }
                                    onClick={() =>
                                      selectFeedbackAction(message.id, 'CHANGED_PRODUCT')
                                    }
                                  >
                                    Changed Product
                                  </Button>
                                  <Button
                                    size="small"
                                    variant={
                                      feedbackDraftByMessage[message.id]?.action === 'REJECTED'
                                        ? 'contained'
                                        : 'outlined'
                                    }
                                    onClick={() => selectFeedbackAction(message.id, 'REJECTED')}
                                  >
                                    Rejected
                                  </Button>
                                </Stack>

                                {feedbackDraftByMessage[message.id]?.action ===
                                'CHANGED_PRODUCT' ? (
                                  <Stack
                                    direction={{ xs: 'column', md: 'row' }}
                                    spacing={0.75}
                                    sx={{ mt: 0.8 }}
                                  >
                                    <TextField
                                      select
                                      size="small"
                                      label="Selected alternative"
                                      value={
                                        feedbackDraftByMessage[message.id]
                                          ?.selectedAlternativeProductId ?? ''
                                      }
                                      onChange={(event) =>
                                        updateFeedbackDraft(
                                          message.id,
                                          'selectedAlternativeProductId',
                                          event.target.value,
                                        )
                                      }
                                      sx={{ minWidth: 240 }}
                                    >
                                      {message.recommendation?.candidates
                                        .filter((candidate) => candidate.rank !== 1)
                                        .map((candidate) => (
                                          <MenuItem
                                            key={`${message.id}-alt-${candidate.productId}`}
                                            value={candidate.productId}
                                          >
                                            {candidate.productName}
                                          </MenuItem>
                                        ))}
                                    </TextField>
                                  </Stack>
                                ) : null}

                                <Stack
                                  direction={{ xs: 'column', md: 'row' }}
                                  spacing={0.75}
                                  sx={{ mt: 0.8 }}
                                >
                                  <TextField
                                    select
                                    size="small"
                                    label="Reason"
                                    value={feedbackDraftByMessage[message.id]?.reason ?? ''}
                                    onChange={(event) =>
                                      updateFeedbackDraft(message.id, 'reason', event.target.value)
                                    }
                                    sx={{ minWidth: 220 }}
                                  >
                                    <MenuItem value="PRICE">Price</MenuItem>
                                    <MenuItem value="STOCK">Stock</MenuItem>
                                    <MenuItem value="CUSTOMER_PREFERENCE">
                                      Customer preference
                                    </MenuItem>
                                    <MenuItem value="BRAND_PREFERENCE">
                                      Brand preference
                                    </MenuItem>
                                    <MenuItem value="OTHER">Other</MenuItem>
                                  </TextField>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    disabled={
                                      feedbackMutation.isPending ||
                                      feedbackSubmittedByMessage[message.id] === true
                                    }
                                    onClick={() => submitFeedback(message)}
                                  >
                                    {feedbackSubmittedByMessage[message.id]
                                      ? 'Feedback saved'
                                      : feedbackMutation.isPending
                                        ? 'Saving...'
                                        : 'Save feedback'}
                                  </Button>
                                </Stack>
                              </Box>
                            ) : null}
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
                disabled={
                  chatMutation.isPending ||
                  input.trim().length === 0 ||
                  !sessionLoaded
                }
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
