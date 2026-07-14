'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppToast } from '@/components/common/AppToast';
import { useAppToast } from '@/hooks/use-app-toast';
import { productsService } from '@/services/products.service';
import { purchasesService } from '@/services/purchases.service';
import { quotesService } from '@/services/quotes.service';
import { ProductReturn, ProductReturnType, returnsService } from '@/services/returns.service';

const returnTypes: ProductReturnType[] = ['SALES_RETURN', 'PURCHASE_RETURN'];

export default function ReturnsPage() {
  const queryClient = useQueryClient();
  const { toast, showToast, closeToast } = useAppToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [type, setType] = useState<ProductReturnType>('SALES_RETURN');
  const [quoteId, setQuoteId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [restockToInventory, setRestockToInventory] = useState(true);

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ['returns'],
    queryFn: returnsService.getAll,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: productsService.getAll,
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ['quotes'],
    queryFn: quotesService.getAll,
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: purchasesService.getAll,
  });

  const createMutation = useMutation({
    mutationFn: returnsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      setDialogOpen(false);
      setType('SALES_RETURN');
      setQuoteId('');
      setPurchaseOrderId('');
      setProductId('');
      setQuantity('1');
      setUnitPrice('0');
      setReason('');
      setNotes('');
      setRestockToInventory(true);
      showToast('Return created', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to create return', 'error');
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => returnsService.updateStatus(id, 'COMPLETED'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      showToast('Return completed and inventory updated', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to complete return', 'error');
    },
  });

  const columns: GridColDef<ProductReturn>[] = [
    { field: 'returnNumber', headerName: 'Return #', width: 140 },
    { field: 'type', headerName: 'Type', width: 160 },
    { field: 'status', headerName: 'Status', width: 140 },
    {
      field: 'itemCount',
      headerName: 'Items',
      width: 100,
      valueGetter: (_value, row) => row.items.length,
    },
    {
      field: 'createdAt',
      headerName: 'Created',
      width: 180,
      valueGetter: (_value, row) => new Date(row.createdAt).toLocaleString(),
    },
    {
      field: 'action',
      headerName: 'Action',
      width: 160,
      sortable: false,
      renderCell: ({ row }) => (
        <Button
          size="small"
          variant="outlined"
          disabled={row.status === 'COMPLETED' || completeMutation.isPending}
          onClick={() => completeMutation.mutate(row.id)}
        >
          Complete
        </Button>
      ),
    },
  ];

  const handleCreate = () => {
    createMutation.mutate({
      type,
      quoteId: type === 'SALES_RETURN' ? quoteId || undefined : undefined,
      purchaseOrderId: type === 'PURCHASE_RETURN' ? purchaseOrderId || undefined : undefined,
      reason: reason || undefined,
      notes: notes || undefined,
      items: [
        {
          productId,
          quantity: Number(quantity),
          unitPrice: Number(unitPrice),
          restockToInventory,
        },
      ],
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Returns</Typography>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          Create Return
        </Button>
      </Box>

      <Box sx={{ height: 520 }}>
        <DataGrid
          rows={returns}
          columns={columns}
          getRowId={(row) => row.id}
          loading={isLoading}
          disableRowSelectionOnClick
        />
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create Product Return</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Return Type"
              value={type}
              onChange={(e) => setType(e.target.value as ProductReturnType)}
              fullWidth
            >
              {returnTypes.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>

            {type === 'SALES_RETURN' ? (
              <TextField
                select
                label="Related Quote"
                value={quoteId}
                onChange={(e) => setQuoteId(e.target.value)}
                fullWidth
              >
                <MenuItem value="">Select Quote</MenuItem>
                {quotes.map((quote) => (
                  <MenuItem key={quote.id} value={quote.id}>
                    {quote.quoteNumber}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                select
                label="Related Purchase Order"
                value={purchaseOrderId}
                onChange={(e) => setPurchaseOrderId(e.target.value)}
                fullWidth
              >
                <MenuItem value="">Select Purchase Order</MenuItem>
                {purchases.map((purchase) => (
                  <MenuItem key={purchase.id} value={purchase.id}>
                    {purchase.orderNumber}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              select
              label="Product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              fullWidth
            >
              {products.map((product) => (
                <MenuItem key={product.id} value={product.id}>
                  {product.name}
                </MenuItem>
              ))}
            </TextField>

            <Stack direction="row" spacing={2}>
              <TextField
                label="Quantity"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                fullWidth
              />
              <TextField
                label="Unit Price"
                type="number"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                fullWidth
              />
            </Stack>

            <FormControlLabel
              control={
                <Checkbox
                  checked={restockToInventory}
                  onChange={(e) => setRestockToInventory(e.target.checked)}
                />
              }
              label="Restock to Inventory"
            />

            <TextField
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
            />

            <TextField
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!productId || createMutation.isPending}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}
