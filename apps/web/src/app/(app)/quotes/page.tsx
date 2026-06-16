'use client';

import { useState } from 'react';
import {
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

import { Quote, quotesService } from '@/services/quotes.service';
import { productsService } from '@/services/products.service';
import { customersService } from '@/services/customers.service';
import { Select, FormControl, InputLabel } from '@mui/material';
import type { QuoteStatus } from '@/services/quotes.service';

type QuoteDraftItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

export default function QuotesPage() {
  const queryClient = useQueryClient();

  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [items, setItems] = useState<QuoteDraftItem[]>([]);

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: quotesService.getAll,
  });

  const { data: selectedQuote } = useQuery({
    queryKey: ['quote', selectedQuoteId],
    queryFn: () => quotesService.getById(selectedQuoteId as string),
    enabled: Boolean(selectedQuoteId),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: customersService.getAll,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: productsService.getAll,
  });

  const createMutation = useMutation({
    mutationFn: quotesService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });

      setCreateOpen(false);
      setCustomerId('');
      setProductId('');
      setQuantity('1');
      setItems([]);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: QuoteStatus;
    }) => quotesService.updateStatus(id, status),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({
        queryKey: ['quote', selectedQuoteId],
      });
    },
  });

  const columns: GridColDef<Quote>[] = [
    { field: 'quoteNumber', headerName: 'Quote No', width: 140 },
    {
      field: 'customer',
      headerName: 'Customer',
      flex: 1,
      valueGetter: (_value, row) => row.customer?.name,
    },
    { field: 'status', headerName: 'Status', width: 120 },
    { field: 'subtotal', headerName: 'Subtotal', width: 130 },
    { field: 'totalAmount', headerName: 'Total', width: 130 },
    { field: 'createdAt', headerName: 'Created At', flex: 1 },
  ];

  const handleAddItem = () => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const qty = Number(quantity);
    if (!qty || qty <= 0) return;

    const unitPrice = Number(product.sellingPrice);

    setItems((prevItems) => {
      const existing = prevItems.find((item) => item.productId === product.id);

      if (existing) {
        return prevItems.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + qty,
              }
            : item,
        );
      }

      return [
        ...prevItems,
        {
          productId: product.id,
          productName: product.name,
          quantity: qty,
          unitPrice,
        },
      ];
    });

    setProductId('');
    setQuantity('1');
  };

  const handleCreateQuote = () => {
    createMutation.mutate({
      customerId,
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });
  };

  const handleWhatsAppShare = () => {
    if (!selectedQuote) return;

    const phone = selectedQuote.customer.phone?.replace(/\D/g, '');

    const message = `
      Quotation ${selectedQuote.quoteNumber}

      Customer: ${selectedQuote.customer.name}

      Status: ${selectedQuote.status}

      Total: ₹${selectedQuote.totalAmount}

      Generated via ShopPilot.
      `;

    const url = phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(url, '_blank');
  };

  const draftTotal = items.reduce(
    (total, item) => total + item.quantity * item.unitPrice,
    0,
  );

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="h5">Quotes</Typography>

        <Button variant="contained" onClick={() => setCreateOpen(true)}>
          New Quote
        </Button>
      </Box>

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={quotes}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
          onRowClick={(params) => setSelectedQuoteId(params.row.id)}
        />
      </Box>

      <Dialog
        open={Boolean(selectedQuoteId)}
        onClose={() => setSelectedQuoteId(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Quote Details - {selectedQuote?.quoteNumber}</DialogTitle>

        <DialogContent>
          {selectedQuote && (
            <Box>
              <Typography>Customer: {selectedQuote.customer.name}</Typography>
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel>Status</InputLabel>

                <Select
                  label="Status"
                  value={selectedQuote.status}
                  onChange={(e) =>
                    updateStatusMutation.mutate({
                      id: selectedQuote.id,
                      status: e.target.value as QuoteStatus,
                    })
                  }
                >
                  <MenuItem value="DRAFT">Draft</MenuItem>
                  <MenuItem value="SENT">Sent</MenuItem>
                  <MenuItem value="APPROVED">Approved</MenuItem>
                  <MenuItem value="REJECTED">Rejected</MenuItem>
                  <MenuItem value="EXPIRED">Expired</MenuItem>
                </Select>
              </FormControl>

              <Typography sx={{ mt: 2, mb: 1 }}>Items</Typography>

              <Box
                component="table"
                sx={{
                  width: '100%',
                  borderCollapse: 'collapse',
                }}
              >
                <thead>
                  <tr>
                    <th align="left">Product</th>
                    <th align="right">Qty</th>
                    <th align="right">Unit Price</th>
                    <th align="right">Line Total</th>
                  </tr>
                </thead>

                <tbody>
                  {selectedQuote.items?.map((item) => (
                    <tr key={item.id}>
                      <td>{item.productName}</td>
                      <td align="right">{item.quantity}</td>
                      <td align="right">{item.unitPrice}</td>
                      <td align="right">{item.lineTotal}</td>
                    </tr>
                  ))}
                </tbody>
              </Box>

              <Typography sx={{ mt: 2 }} align="right">
                Total: ₹{selectedQuote.totalAmount}
              </Typography>

              <Button
                variant="contained"
                onClick={() => quotesService.downloadPdf(selectedQuote.id)}
              >
                Download PDF
              </Button>
              <Button
                variant="outlined"
                onClick={() => handleWhatsAppShare()}
              >
                Share on WhatsApp
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Create Quote</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              fullWidth
            >
              {customers.map((customer) => (
                <MenuItem key={customer.id} value={customer.id}>
                  {customer.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              fullWidth
            >
              {products.map((product) => (
                <MenuItem key={product.id} value={product.id}>
                  {product.name} - ₹{product.sellingPrice}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              fullWidth
            />

            <Button
              variant="outlined"
              onClick={handleAddItem}
              disabled={!productId || Number(quantity) <= 0}
            >
              Add Item
            </Button>

            {items.length > 0 && (
              <Box>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Quote Items
                </Typography>

                {items.map((item) => (
                  <Box
                    key={item.productId}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #eee',
                      py: 1,
                    }}
                  >
                    <span>
                      {item.productName} - Qty {item.quantity}
                    </span>

                    <strong>
                      ₹{item.quantity * item.unitPrice}
                    </strong>
                  </Box>
                ))}

                <Typography sx={{ mt: 2 }} align="right">
                  Draft Total: ₹{draftTotal}
                </Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>

          <Button
            variant="contained"
            onClick={handleCreateQuote}
            disabled={!customerId || items.length === 0 || createMutation.isPending}
          >
            Create Quote
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}