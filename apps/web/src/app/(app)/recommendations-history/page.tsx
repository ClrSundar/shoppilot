'use client';

import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import {
  RecommendationHistoryItem,
  recommendationsService,
} from '@/services/recommendations.service';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function feedbackLabel(item: RecommendationHistoryItem) {
  if (!item.feedback) {
    return 'Pending';
  }

  if (item.feedback.action === 'PARTIALLY_ACCEPTED') {
    return 'Changed Product';
  }

  if (item.feedback.action === 'ACCEPTED') {
    return 'Accepted';
  }

  if (item.feedback.action === 'REJECTED') {
    return 'Rejected';
  }

  return item.feedback.action;
}

export default function RecommendationsHistoryPage() {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['recommendation-history'],
    queryFn: () => recommendationsService.getHistory(40),
  });

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
        Recommendation History
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 2 }}>
        Date | Customer | Bore depth | Recommended motor | Quote created | Feedback
      </Typography>

      {isLoading ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <CircularProgress size={20} />
          <Typography variant="body2">Loading recommendation runs...</Typography>
        </Stack>
      ) : null}

      {isError ? (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          Failed to load recommendation history.
        </Alert>
      ) : null}

      {!isLoading && !isError && data.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No recommendation runs yet.
        </Alert>
      ) : null}

      <Stack spacing={1.25}>
        {data.map((item) => (
          <Card key={item.runId} variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 1.5 }}>
              <Stack spacing={0.8}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={1}
                  sx={{
                    justifyContent: 'space-between',
                    alignItems: { xs: 'flex-start', md: 'center' },
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {formatDate(item.date)}
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                    <Chip
                      size="small"
                      color={item.quoteCreated ? 'success' : 'default'}
                      label={item.quoteCreated ? 'Quote created' : 'No quote'}
                    />
                    <Chip
                      size="small"
                      color={
                        feedbackLabel(item) === 'Accepted'
                          ? 'success'
                          : feedbackLabel(item) === 'Changed Product'
                            ? 'warning'
                            : feedbackLabel(item) === 'Rejected'
                              ? 'error'
                              : 'default'
                      }
                      label={feedbackLabel(item)}
                    />
                  </Stack>
                </Stack>

                <Typography variant="body2">
                  Customer: {item.customer?.name ?? 'Walk-in / not tagged'}
                </Typography>
                <Typography variant="body2">
                  Bore depth: {item.boreDepthFt ?? '-'} ft
                </Typography>
                <Typography variant="body2">
                  Recommended motor: {item.recommendedMotor?.productName ?? '-'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Rule: {item.appliedRuleCode ?? '-'}
                </Typography>

                {item.quote ? (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Quote: {item.quote.quoteNumber}
                  </Typography>
                ) : null}

                {item.feedback?.notes ? (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Feedback note: {item.feedback.notes}
                  </Typography>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
