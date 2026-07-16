'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  alpha,
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { WarningAmber } from '@mui/icons-material';

import { dashboardService } from '@/services/dashboard.service';
import { quotesService } from '@/services/quotes.service';

export default function Dashboard() {
  const router = useRouter();

  const { data: lowStockProducts = [] } = useQuery({
    queryKey: ['dashboard-low-stock'],
    queryFn: dashboardService.getLowStockProducts,
  });

  const { data: outstandingPayments } = useQuery({
    queryKey: ['dashboard-outstanding-payments'],
    queryFn: dashboardService.getOutstandingPayments,
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ['quotes'],
    queryFn: quotesService.getAll,
  });

  const quoteActionBuckets = useMemo(() => {
    const now = Date.now();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

    const draftNotSent = quotes.filter((quote) => quote.status === 'DRAFT');

    const sentNearingExpiry = quotes.filter((quote) => {
      if (quote.status !== 'SENT' || !quote.validUntil) {
        return false;
      }

      const expiryTime = new Date(quote.validUntil).getTime();
      if (!Number.isFinite(expiryTime)) {
        return false;
      }

      const remaining = expiryTime - now;
      return remaining >= 0 && remaining <= twoDaysMs;
    });

    const approvedAwaitingInvoicing = quotes.filter(
      (quote) => quote.status === 'APPROVED',
    );

    const invoicedAwaitingDispatch = quotes.filter(
      (quote) => quote.status === 'INVOICED',
    );

    return {
      draftNotSent,
      sentNearingExpiry,
      approvedAwaitingInvoicing,
      invoicedAwaitingDispatch,
      totalRequiresAction:
        sentNearingExpiry.length +
        approvedAwaitingInvoicing.length +
        invoicedAwaitingDispatch.length,
    };
  }, [quotes]);

  const outOfStock = lowStockProducts.filter(
    (product) => product.status === 'OUT_OF_STOCK',
  );
  const lowStock = lowStockProducts.filter(
    (product) => product.status === 'LOW_STOCK',
  );

  const topRiskySkus = useMemo(
    () =>
      [...lowStockProducts]
        .sort((left, right) => {
          const leftGap = left.reorderLevel - left.onHand;
          const rightGap = right.reorderLevel - right.onHand;
          return rightGap - leftGap;
        })
        .slice(0, 5),
    [lowStockProducts],
  );

  const attentionCounters = [
    {
      label: 'Money to Collect',
      value: outstandingPayments?.customerCountWithOutstanding ?? 0,
      anchorId: 'money-to-collect',
    },
    {
      label: 'Quotes Needing Action',
      value: quoteActionBuckets.totalRequiresAction,
      anchorId: 'quotes-needing-action',
    },
    {
      label: 'Stock Alerts',
      value: outOfStock.length + lowStock.length,
      anchorId: 'stock-alerts',
    },
  ] as const;

  return (
    <Box>
      <Card
        sx={{
          mb: 2,
          borderRadius: 2,
          background:
            'linear-gradient(135deg, rgba(11, 27, 58, 1) 0%, rgba(20, 72, 117, 1) 60%, rgba(29, 114, 142, 1) 100%)',
          color: 'common.white',
          overflow: 'hidden',
        }}
      >
        <CardContent sx={{ p: { xs: 2, md: 2.25 } }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 5 }}>
              <Stack spacing={1}>
                <Chip
                  label="Business Home"
                  sx={{
                    alignSelf: 'flex-start',
                    bgcolor: alpha('#FFFFFF', 0.15),
                    color: 'common.white',
                    fontWeight: 600,
                  }}
                />

                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  What needs your attention this morning?
                </Typography>

                <Typography variant="body2" sx={{ color: alpha('#FFFFFF', 0.9) }}>
                  Start with owner decisions: cash collection, quote follow-up, and stock risks.
                </Typography>
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, md: 7 }}>
              <Grid container spacing={1}>
                {attentionCounters.map((counter) => (
                  <Grid key={counter.label} size={{ xs: 12, sm: 4 }}>
                    <Button
                      fullWidth
                      onClick={() =>
                        document
                          .getElementById(counter.anchorId)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                      sx={{
                        borderRadius: 2,
                        border: `1px solid ${alpha('#ffffff', 0.25)}`,
                        background: alpha('#ffffff', 0.14),
                        color: '#fff',
                        textTransform: 'none',
                        p: 1.1,
                        minHeight: 62,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        '&:hover': {
                          background: alpha('#ffffff', 0.24),
                        },
                      }}
                    >
                      <Stack spacing={0.2} sx={{ alignItems: 'flex-start' }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, opacity: 0.95 }}>
                          {counter.label}
                        </Typography>
                      </Stack>
                      <Chip
                        label={counter.value}
                        size="small"
                        sx={{
                          bgcolor: '#fff',
                          color: '#0f172a',
                          fontWeight: 700,
                        }}
                      />
                    </Button>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }} id="money-to-collect">
          <Card sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Stack spacing={1.5}>
                <Stack
                  direction="row"
                  sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Money to Collect
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => router.push('/payments')}
                  >
                    Record Payment
                  </Button>
                </Stack>

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Card sx={{ borderRadius: 2, bgcolor: '#fff8eb' }}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          Total outstanding
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 800 }}>
                          ₹{(outstandingPayments?.totalOutstanding ?? 0).toFixed(2)}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Card sx={{ borderRadius: 2, bgcolor: '#f8fafc' }}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          Customers with outstanding
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 800 }}>
                          {outstandingPayments?.customerCountWithOutstanding ?? 0}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                <Divider />

                <Typography variant="subtitle2" color="text.secondary">
                  Top customers by outstanding
                </Typography>

                {(outstandingPayments?.topCustomers ?? []).slice(0, 5).length > 0 ? (
                  <Stack spacing={0.75}>
                    {(outstandingPayments?.topCustomers ?? []).slice(0, 5).map((row) => (
                      <Stack
                        key={row.customerId}
                        direction="row"
                        sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <Typography variant="body2">
                          {row.customerName} - ₹{row.outstanding.toFixed(2)}
                        </Typography>
                        <Button
                          size="small"
                          onClick={() =>
                            router.push(`/customers?ledgerCustomerId=${row.customerId}`)
                          }
                        >
                          View Ledger
                        </Button>
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                  <Alert severity="success" sx={{ borderRadius: 2 }}>
                    No outstanding customer payments right now.
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }} id="quotes-needing-action">
          <Card sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Stack spacing={1.5}>
                <Stack
                  direction="row"
                  sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Quotes Needing Action
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => router.push('/quotes')}
                  >
                    Open Quotes
                  </Button>
                </Stack>

                <Card sx={{ borderRadius: 2, bgcolor: '#f8fafc' }}>
                  <CardContent sx={{ py: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Total quotes requiring owner action
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 800 }}>
                      {quoteActionBuckets.totalRequiresAction}
                    </Typography>
                  </CardContent>
                </Card>

                {quoteActionBuckets.totalRequiresAction > 0 ? (
                  <Alert severity="warning" sx={{ borderRadius: 2 }}>
                    <AlertTitle>Owner action needed</AlertTitle>
                    Prioritize expiring sent quotes, invoicing approved quotes, and dispatching invoiced quotes.
                  </Alert>
                ) : null}

                <Stack spacing={0.75}>
                  <ActionRow
                    label="Draft quotes not sent"
                    value={quoteActionBuckets.draftNotSent.length}
                    tone="info"
                    tag="Informational"
                  />
                  <ActionRow
                    label="Sent quotes nearing expiry"
                    value={quoteActionBuckets.sentNearingExpiry.length}
                    tone="warning"
                    tag="Requires Action"
                  />
                  <ActionRow
                    label="Approved quotes awaiting invoicing"
                    value={quoteActionBuckets.approvedAwaitingInvoicing.length}
                    tone="warning"
                    tag="Requires Action"
                  />
                  <ActionRow
                    label="Invoiced quotes awaiting dispatch"
                    value={quoteActionBuckets.invoicedAwaitingDispatch.length}
                    tone="warning"
                    tag="Requires Action"
                  />
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }} id="stock-alerts">
          <Card sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Stack spacing={1.5}>
                <Stack
                  direction="row"
                  sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Stock Requiring Attention
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => router.push('/inventory')}
                  >
                    Check Stock
                  </Button>
                </Stack>

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Alert severity="error" icon={<WarningAmber />} sx={{ borderRadius: 2 }}>
                      <AlertTitle>Out-of-stock products</AlertTitle>
                      <Typography variant="body2">{outOfStock.length}</Typography>
                    </Alert>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Alert severity="warning" icon={<WarningAmber />} sx={{ borderRadius: 2 }}>
                      <AlertTitle>Low-stock products</AlertTitle>
                      <Typography variant="body2">{lowStock.length}</Typography>
                    </Alert>
                  </Grid>
                </Grid>

                <Divider />

                <Typography variant="subtitle2" color="text.secondary">
                  Top risky SKUs
                </Typography>

                {topRiskySkus.length > 0 ? (
                  <Stack spacing={0.75}>
                    {topRiskySkus.map((product) => (
                      <Typography key={product.id} variant="body2">
                        {product.productName}
                        {product.sku ? ` (${product.sku})` : ''} - On hand {product.onHand} / Reorder {product.reorderLevel}
                      </Typography>
                    ))}
                  </Stack>
                ) : (
                  <Alert severity="success" sx={{ borderRadius: 2 }}>
                    No stock alerts right now.
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

function ActionRow({
  label,
  value,
  tone,
  tag,
}: {
  label: string;
  value: number;
  tone: 'info' | 'warning';
  tag: string;
}) {
  return (
    <Stack
      direction="row"
      sx={{
        justifyContent: 'space-between',
        alignItems: 'center',
        p: 1,
        borderRadius: 1.5,
        bgcolor: tone === 'warning' ? '#fff8eb' : '#f8fafc',
        border:
          tone === 'warning'
            ? '1px solid rgba(245, 158, 11, 0.35)'
            : '1px solid rgba(148, 163, 184, 0.25)',
      }}
    >
      <Stack spacing={0.3}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="caption" color="text.secondary">
          {tag}
        </Typography>
      </Stack>
      <Chip
        label={value}
        size="small"
        color={tone === 'warning' ? 'warning' : 'default'}
      />
    </Stack>
  );
}