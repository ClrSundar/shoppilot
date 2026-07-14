'use client';

import { useMemo, useState } from 'react';
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
import { productsService } from '@/services/products.service';
import { suppliersService } from '@/services/suppliers.service';
import {
  PurchaseOrder,
  purchasesService,
} from '@/services/purchases.service';

export default function PurchasesPage() {
  const queryClient = useQueryClient();
  const { toast, showToast, closeToast } = useAppToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('0');
  const [taxPercentage, setTaxPercentage] = useState('0');
  const [notes, setNotes] = useState('');

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: purchasesService.getAll,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: productsService.getAll,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: suppliersService.getAll,
  });

  const createMutation = useMutation({
    mutationFn: purchasesService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setDialogOpen(false);
      setSupplierId('');
      setSupplierName('');
      setProductId('');
      setQuantity('1');
      setUnitCost('0');
      setTaxPercentage('0');
      setNotes('');
      showToast('Purchase order created', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to create purchase order', 'error');
    },
  });

  const receiveMutation = useMutation({
    mutationFn: (id: string) => purchasesService.receive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      showToast('Purchase order received and inventory updated', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to receive purchase order', 'error');
    },
  });

  const columns: GridColDef<PurchaseOrder>[] = [
    { field: 'orderNumber', headerName: 'PO Number', width: 140 },
    { field: 'supplierName', headerName: 'Supplier', flex: 1 },
    { field: 'status', headerName: 'Status', width: 180 },
    {
      field: 'totalAmount',
      headerName: 'Total',
      width: 120,
      valueGetter: (_value, row) => Number(row.totalAmount).toFixed(2),
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
      width: 140,
      sortable: false,
      renderCell: ({ row }) => (
        <Button
          size="small"
          variant="outlined"
          disabled={row.status === 'RECEIVED' || row.status === 'CANCELLED' || receiveMutation.isPending}
          onClick={() => receiveMutation.mutate(row.id)}
        >
          Receive
        </Button>
      ),
    },
  ];

  const totalOpenValue = useMemo(
    () =>
      purchases
        .filter((purchase) => purchase.status !== 'RECEIVED' && purchase.status !== 'CANCELLED')
        .reduce((sum, purchase) => sum + Number(purchase.totalAmount), 0),
    [purchases],
  );

  const handleCreate = () => {
    const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);

    createMutation.mutate({
      supplierId: supplierId || undefined,
      supplierName: selectedSupplier ? undefined : supplierName,
      taxPercentage: Number(taxPercentage),
      notes: notes || undefined,
      items: [
        {
          productId,
          quantity: Number(quantity),
          unitCost: Number(unitCost),
        },
      ],
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Purchase Orders</Typography>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          Create Purchase Order
        </Button>
      </Box>

      <Typography variant="body2" sx={{ mb: 2 }}>
        Open purchase value: {totalOpenValue.toFixed(2)}
      </Typography>

      <Box sx={{ height: 520 }}>
        <DataGrid
          rows={purchases}
          columns={columns}
          getRowId={(row) => row.id}
          loading={isLoading}
          disableRowSelectionOnClick
        />
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create Purchase Order</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Supplier (Optional)"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              fullWidth
            >
              <MenuItem value="">Use free text supplier</MenuItem>
              {suppliers.map((supplier) => (
                <MenuItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Supplier Name"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              fullWidth
              disabled={Boolean(supplierId)}
            />

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
                label="Unit Cost"
                type="number"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                fullWidth
              />
            </Stack>

            <TextField
              label="Tax %"
              type="number"
              value={taxPercentage}
              onChange={(e) => setTaxPercentage(e.target.value)}
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
            disabled={(!supplierId && !supplierName) || !productId || createMutation.isPending}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}
