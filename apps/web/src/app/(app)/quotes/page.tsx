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

import { AppToast } from '@/components/common/AppToast';
import { useAppToast } from '@/hooks/use-app-toast';
import { Quote, quotesService } from '@/services/quotes.service';
import { productsService } from '@/services/products.service';
import { customersService } from '@/services/customers.service';
import { inventoryService } from '@/services/inventory.service';
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
  const { toast, showToast, closeToast } = useAppToast();

  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [isEditingDraft, setIsEditingDraft] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<QuoteDraftItem[]>([]);

  const [editCustomerId, setEditCustomerId] = useState('');
  const [editProductId, setEditProductId] = useState('');
  const [editQuantity, setEditQuantity] = useState('1');
  const [editNotes, setEditNotes] = useState('');
  const [editItems, setEditItems] = useState<QuoteDraftItem[]>([]);

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

  const { data: inventoryStocks = [] } = useQuery({
    queryKey: ['inventory', 'stocks'],
    queryFn: inventoryService.getStocks,
  });

  const createMutation = useMutation({
    mutationFn: quotesService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });

      setCreateOpen(false);
      setCustomerId('');
      setProductId('');
      setQuantity('1');
      setNotes('');
      setItems([]);
      showToast('Quote created successfully', 'success');
    },
    onError: () => showToast('Failed to create quote', 'error'),
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

      showToast('Quote status updated successfully', 'success');
    },
    onError: () => showToast('Failed to update quote status', 'error'),
  });

  const updateDraftMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        customerId: string;
        notes?: string;
        items: {
          productId: string;
          quantity: number;
        }[];
      };
    }) => quotesService.update(id, payload),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({
        queryKey: ['quote', selectedQuoteId],
      });
      setIsEditingDraft(false);
      showToast('Draft quote updated successfully', 'success');
    },
    onError: () => showToast('Failed to update draft quote', 'error'),
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

    const stock = inventoryStocks.find((item) => item.productId === product.id);
    const available = stock
      ? Number(stock.onHand) - Number(stock.reserved)
      : Number.POSITIVE_INFINITY;

    setItems((prevItems) => {
      const existing = prevItems.find((item) => item.productId === product.id);

      if (existing && existing.quantity + qty > available) {
        showToast('Quantity exceeds available stock', 'error');
        return prevItems;
      }

      if (!existing && qty > available) {
        showToast('Quantity exceeds available stock', 'error');
        return prevItems;
      }

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
      notes,
    });
  };

  const handleStartDraftEdit = () => {
    if (!selectedQuote || selectedQuote.status !== 'DRAFT') {
      return;
    }

    setEditCustomerId(selectedQuote.customer.id);
    setEditNotes(selectedQuote.notes ?? '');
    setEditItems(
      (selectedQuote.items ?? []).map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
    );
    setEditProductId('');
    setEditQuantity('1');
    setIsEditingDraft(true);
  };

  const handleAddEditItem = () => {
    const product = products.find((p) => p.id === editProductId);

    if (!product) {
      return;
    }

    const qty = Number(editQuantity);

    if (!qty || qty <= 0) {
      return;
    }

    const unitPrice = Number(product.sellingPrice);

    const stock = inventoryStocks.find((item) => item.productId === product.id);
    const available = stock
      ? Number(stock.onHand) - Number(stock.reserved)
      : Number.POSITIVE_INFINITY;

    setEditItems((prevItems) => {
      const existing = prevItems.find((item) => item.productId === product.id);

      if (existing && existing.quantity + qty > available) {
        showToast('Quantity exceeds available stock', 'error');
        return prevItems;
      }

      if (!existing && qty > available) {
        showToast('Quantity exceeds available stock', 'error');
        return prevItems;
      }

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

    setEditProductId('');
    setEditQuantity('1');
  };

  const handleEditItemQuantityChange = (productIdToUpdate: string, value: string) => {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    setEditItems((prevItems) =>
      prevItems.map((item) =>
        item.productId === productIdToUpdate
          ? {
              ...item,
              quantity: parsed,
            }
          : item,
      ),
    );
  };

  const handleRemoveEditItem = (productIdToRemove: string) => {
    setEditItems((prevItems) =>
      prevItems.filter((item) => item.productId !== productIdToRemove),
    );
  };

  const handleSaveDraftEdits = () => {
    if (!selectedQuote || selectedQuote.status !== 'DRAFT') {
      return;
    }

    updateDraftMutation.mutate({
      id: selectedQuote.id,
      payload: {
        customerId: editCustomerId,
        notes: editNotes,
        items: editItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      },
    });
  };

  const handleDuplicateQuote = () => {
    if (!selectedQuote) {
      return;
    }

    setCustomerId(selectedQuote.customer.id);
    setNotes(selectedQuote.notes ?? '');
    setItems(
      (selectedQuote.items ?? []).map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
    );

    setCreateOpen(true);
    setSelectedQuoteId(null);
    showToast('Quote duplicated into a new draft', 'success');
  };

  const handleCancelQuote = () => {
    if (!selectedQuote) {
      return;
    }

    if (!window.confirm('Are you sure you want to cancel this quote?')) {
      return;
    }

    updateStatusMutation.mutate({
      id: selectedQuote.id,
      status: 'CANCELLED',
    });
  };

  const handleWhatsAppShare = () => {
    if (!selectedQuote) return;

    const phone = (
      selectedQuote.customer.whatsappNumber ||
      selectedQuote.customer.phone ||
      ''
    ).replace(/\D/g, '');

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
        onClose={() => {
          setSelectedQuoteId(null);
          setIsEditingDraft(false);
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Quote Details - {selectedQuote?.quoteNumber}</DialogTitle>

        <DialogContent>
          {selectedQuote && (
            <Box>
              {selectedQuote.status === 'DRAFT' && isEditingDraft ? (
                <Stack spacing={2} sx={{ mt: 1 }}>
                  <TextField
                    select
                    label="Customer"
                    value={editCustomerId}
                    onChange={(e) => setEditCustomerId(e.target.value)}
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
                    value={editProductId}
                    onChange={(e) => setEditProductId(e.target.value)}
                    fullWidth
                  >
                    {products.map((product) => (
                      <MenuItem key={product.id} value={product.id}>
                        {product.name} - ₹{product.sellingPrice}
                        {(() => {
                          const stock = inventoryStocks.find(
                            (item) => item.productId === product.id,
                          );

                          if (!stock) {
                            return ' (Avail: N/A)';
                          }

                          return ` (Avail: ${Number(stock.onHand) - Number(stock.reserved)})`;
                        })()}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    label="Quantity"
                    type="number"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    fullWidth
                  />

                  <Button
                    variant="outlined"
                    onClick={handleAddEditItem}
                    disabled={!editProductId || Number(editQuantity) <= 0}
                  >
                    Add Item
                  </Button>

                  {editItems.map((item) => (
                    <Stack
                      key={item.productId}
                      direction="row"
                      spacing={2}
                      sx={{ alignItems: 'center' }}
                    >
                      <Typography sx={{ minWidth: 180 }}>{item.productName}</Typography>

                      <TextField
                        label="Qty"
                        type="number"
                        size="small"
                        value={item.quantity}
                        onChange={(e) =>
                          handleEditItemQuantityChange(item.productId, e.target.value)
                        }
                        sx={{ width: 120 }}
                      />

                      <Typography sx={{ minWidth: 120 }}>
                        ₹{item.quantity * item.unitPrice}
                      </Typography>

                      <Button
                        color="error"
                        onClick={() => handleRemoveEditItem(item.productId)}
                      >
                        Remove
                      </Button>
                    </Stack>
                  ))}

                  <TextField
                    label="Notes"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    multiline
                    minRows={3}
                    fullWidth
                  />

                  <Stack direction="row" spacing={2}>
                    <Button
                      variant="contained"
                      onClick={handleSaveDraftEdits}
                      disabled={
                        !editCustomerId ||
                        editItems.length === 0 ||
                        updateDraftMutation.isPending
                      }
                    >
                      Save Draft Changes
                    </Button>

                    <Button onClick={() => setIsEditingDraft(false)}>Cancel</Button>
                  </Stack>
                </Stack>
              ) : (
                <>
                  <Typography>Customer: {selectedQuote.customer.name}</Typography>
                  {selectedQuote.notes && (
                    <Typography sx={{ mt: 1 }}>Notes: {selectedQuote.notes}</Typography>
                  )}
                </>
              )}

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
                  <MenuItem value="CANCELLED">Cancelled</MenuItem>
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

              <Stack direction="row" spacing={1} sx={{ mt: 2, mb: 2 }}>
                {selectedQuote.status === 'DRAFT' ? (
                  <Button variant="outlined" onClick={handleStartDraftEdit}>
                    Edit Draft Quote
                  </Button>
                ) : (
                  <Button variant="outlined" onClick={handleDuplicateQuote}>
                    Duplicate / Create Revision
                  </Button>
                )}

                {selectedQuote.status !== 'CANCELLED' && (
                  <Button color="error" variant="outlined" onClick={handleCancelQuote}>
                    Cancel Quote
                  </Button>
                )}
              </Stack>

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
        onClose={() => {
          setCreateOpen(false);
          setNotes('');
        }}
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
                  {(() => {
                    const stock = inventoryStocks.find(
                      (item) => item.productId === product.id,
                    );

                    if (!stock) {
                      return ' (Avail: N/A)';
                    }

                    return ` (Avail: ${Number(stock.onHand) - Number(stock.reserved)})`;
                  })()}
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

            <TextField
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              minRows={3}
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
          <Button
            onClick={() => {
              setCreateOpen(false);
              setNotes('');
            }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={handleCreateQuote}
            disabled={!customerId || items.length === 0 || createMutation.isPending}
          >
            Create Quote
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}