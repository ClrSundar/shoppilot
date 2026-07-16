'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppToast } from '@/components/common/AppToast';
import { useAppToast } from '@/hooks/use-app-toast';
import { paymentsService, Payment, PaymentDirection, PaymentMethod } from '@/services/payments.service';
import { purchasesService } from '@/services/purchases.service';
import { quotesService } from '@/services/quotes.service';

const methods: PaymentMethod[] = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'];
const directions: PaymentDirection[] = ['RECEIVED', 'PAID'];

export default function PaymentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast, showToast, closeToast } = useAppToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState('0');
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [direction, setDirection] = useState<PaymentDirection>('RECEIVED');
  const [quoteId, setQuoteId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [note, setNote] = useState('');

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () =>
      paymentsService.getAll({
        direction: 'RECEIVED',
      }),
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ['quotes'],
    queryFn: quotesService.getAll,
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: purchasesService.getAll,
  });

  const selectedQuote = quoteId
    ? quotes.find((quote) => quote.id === quoteId)
    : null;

  const selectedQuoteTotal = selectedQuote ? Number(selectedQuote.totalAmount) : 0;
  const selectedQuoteReceived = selectedQuote
    ? payments
        .filter(
          (payment) =>
            payment.quote?.id === selectedQuote.id &&
            payment.direction === 'RECEIVED' &&
            payment.status === 'COMPLETED',
        )
        .reduce((sum, payment) => sum + Number(payment.amount), 0)
    : 0;
  const selectedQuoteOutstanding = Math.max(
    selectedQuoteTotal - selectedQuoteReceived,
    0,
  );

  const createMutation = useMutation({
    mutationFn: paymentsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setDialogOpen(false);
      setAmount('0');
      setMethod('UPI');
      setDirection('RECEIVED');
      setQuoteId('');
      setPurchaseOrderId('');
      setReferenceNumber('');
      setNote('');
      showToast('Payment recorded', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to record payment', 'error');
    },
  });

  const columns: GridColDef<Payment>[] = [
    {
      field: 'paymentDate',
      headerName: 'Date',
      width: 180,
      valueGetter: (_value, row) => new Date(row.paymentDate).toLocaleString(),
    },
    { field: 'direction', headerName: 'Direction', width: 120 },
    { field: 'method', headerName: 'Method', width: 140 },
    {
      field: 'amount',
      headerName: 'Amount',
      width: 120,
      valueGetter: (_value, row) => Number(row.amount).toFixed(2),
    },
    {
      field: 'reference',
      headerName: 'Reference',
      flex: 1,
      valueGetter: (_value, row) => row.referenceNumber || row.quote?.quoteNumber || row.purchaseOrder?.orderNumber || '-',
    },
    {
      field: 'customer',
      headerName: 'Customer',
      width: 220,
      valueGetter: (_value, row) => row.customer?.name ?? '-',
    },
    { field: 'status', headerName: 'Status', width: 120 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 160,
      sortable: false,
      renderCell: ({ row }) =>
        row.customer?.id ? (
          <Button
            size="small"
            onClick={() => router.push(`/customers?ledgerCustomerId=${row.customer?.id}`)}
          >
            View Ledger
          </Button>
        ) : (
          <span>-</span>
        ),
    },
  ];

  const handleCreate = () => {
    if (direction === 'RECEIVED' && !quoteId) {
      showToast('Received payment must be linked to an invoiced quote', 'error');
      return;
    }

    if (direction === 'RECEIVED' && selectedQuote) {
      if (Number(amount) > selectedQuoteOutstanding) {
        showToast('Amount exceeds outstanding for selected quote', 'error');
        return;
      }
    }

    createMutation.mutate({
      amount: Number(amount),
      method,
      direction,
      quoteId: quoteId || undefined,
      purchaseOrderId: purchaseOrderId || undefined,
      referenceNumber: referenceNumber || undefined,
      note: note || undefined,
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Payments</Typography>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          Record Payment
        </Button>
      </Box>

      <Box sx={{ height: 520 }}>
        <DataGrid
          rows={payments}
          columns={columns}
          getRowId={(row) => row.id}
          loading={isLoading}
          disableRowSelectionOnClick
        />
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Record Payment</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                fullWidth
              />
              <TextField
                select
                label="Method"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                fullWidth
              >
                {methods.map((item) => (
                  <MenuItem key={item} value={item}>
                    {item}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <TextField
              select
              label="Direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value as PaymentDirection)}
              fullWidth
            >
              {directions.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>

            {direction === 'RECEIVED' ? (
              <Alert severity="info">
                For V1, received customer payments must be linked to an invoiced/dispatched quote.
              </Alert>
            ) : null}

            <TextField
              select
              label="Related Quote (Optional)"
              value={quoteId}
              onChange={(e) => setQuoteId(e.target.value)}
              fullWidth
            >
              <MenuItem value="">None</MenuItem>
              {quotes.map((quote) => (
                <MenuItem key={quote.id} value={quote.id}>
                  {quote.quoteNumber} • {quote.status} • ₹{Number(quote.totalAmount).toFixed(2)}
                </MenuItem>
              ))}
            </TextField>

            {selectedQuote ? (
              <Alert severity="success">
                Quote Total: ₹{selectedQuoteTotal.toFixed(2)} | Received: ₹{selectedQuoteReceived.toFixed(2)} | Outstanding: ₹{selectedQuoteOutstanding.toFixed(2)}
              </Alert>
            ) : null}

            <TextField
              select
              label="Related Purchase Order (Optional)"
              value={purchaseOrderId}
              onChange={(e) => setPurchaseOrderId(e.target.value)}
              fullWidth
            >
              <MenuItem value="">None</MenuItem>
              {purchases.map((purchase) => (
                <MenuItem key={purchase.id} value={purchase.id}>
                  {purchase.orderNumber}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Reference Number"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              fullWidth
            />

            <TextField
              label="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={createMutation.isPending}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}
