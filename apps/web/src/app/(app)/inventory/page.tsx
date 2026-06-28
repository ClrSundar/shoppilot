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
import {
  inventoryService,
  InventoryMovementType,
  InventoryStock,
} from '@/services/inventory.service';

const movementOptions: InventoryMovementType[] = [
  'IN',
  'OUT',
  'ADJUST_IN',
  'ADJUST_OUT',
  'RESERVE',
  'RELEASE',
];

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const { toast, showToast, closeToast } = useAppToast();

  const [initializeOpen, setInitializeOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const [productId, setProductId] = useState('');
  const [openingStock, setOpeningStock] = useState('0');
  const [reorderLevel, setReorderLevel] = useState('0');
  const [initNote, setInitNote] = useState('');

  const [adjustProductId, setAdjustProductId] = useState('');
  const [movementType, setMovementType] = useState<InventoryMovementType>('IN');
  const [adjustQuantity, setAdjustQuantity] = useState('1');
  const [adjustNote, setAdjustNote] = useState('');

  const { data: stocks = [], isLoading } = useQuery({
    queryKey: ['inventory', 'stocks'],
    queryFn: inventoryService.getStocks,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: productsService.getAll,
  });

  const { data: recentLedger = [] } = useQuery({
    queryKey: ['inventory', 'ledger'],
    queryFn: () => inventoryService.getLedger(),
  });

  const initializeMutation = useMutation({
    mutationFn: inventoryService.initializeStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setInitializeOpen(false);
      setProductId('');
      setOpeningStock('0');
      setReorderLevel('0');
      setInitNote('');
      showToast('Stock initialized successfully', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to initialize stock', 'error');
    },
  });

  const adjustMutation = useMutation({
    mutationFn: inventoryService.adjustStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setAdjustOpen(false);
      setAdjustProductId('');
      setMovementType('IN');
      setAdjustQuantity('1');
      setAdjustNote('');
      showToast('Inventory updated successfully', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to update inventory', 'error');
    },
  });

  const lowStockCount = useMemo(
    () =>
      stocks.filter((stock) => Number(stock.onHand) <= Number(stock.reorderLevel))
        .length,
    [stocks],
  );

  const stockColumns: GridColDef<InventoryStock>[] = [
    {
      field: 'productName',
      headerName: 'Product',
      flex: 1,
      valueGetter: (_value, row) => row.product.name,
    },
    {
      field: 'category',
      headerName: 'Category',
      flex: 1,
      valueGetter: (_value, row) => row.product.category?.name,
    },
    {
      field: 'onHand',
      headerName: 'On Hand',
      width: 110,
      valueGetter: (_value, row) => Number(row.onHand),
    },
    {
      field: 'reserved',
      headerName: 'Reserved',
      width: 110,
      valueGetter: (_value, row) => Number(row.reserved),
    },
    {
      field: 'available',
      headerName: 'Available',
      width: 120,
      valueGetter: (_value, row) => Number(row.onHand) - Number(row.reserved),
    },
    {
      field: 'reorderLevel',
      headerName: 'Reorder Level',
      width: 130,
      valueGetter: (_value, row) => Number(row.reorderLevel),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      valueGetter: (_value, row) =>
        Number(row.onHand) <= Number(row.reorderLevel) ? 'LOW STOCK' : 'OK',
    },
  ];

  const ledgerColumns: GridColDef<(typeof recentLedger)[number]>[] = [
    {
      field: 'createdAt',
      headerName: 'When',
      width: 180,
      valueGetter: (_value, row) => new Date(row.createdAt).toLocaleString(),
    },
    {
      field: 'movementType',
      headerName: 'Type',
      width: 140,
    },
    {
      field: 'productId',
      headerName: 'Product',
      flex: 1,
      valueGetter: (_value, row) => {
        const stock = stocks.find((item) => item.productId === row.productId);
        return stock?.product?.name || row.productId;
      },
    },
    {
      field: 'quantity',
      headerName: 'Qty',
      width: 90,
      valueGetter: (_value, row) => Number(row.quantity),
    },
    {
      field: 'note',
      headerName: 'Note',
      flex: 1,
      valueGetter: (_value, row) => row.note || '-',
    },
  ];

  const handleInitialize = () => {
    initializeMutation.mutate({
      productId,
      openingStock: Number(openingStock),
      reorderLevel: Number(reorderLevel),
      note: initNote || undefined,
    });
  };

  const handleAdjust = () => {
    adjustMutation.mutate({
      productId: adjustProductId,
      movementType,
      quantity: Number(adjustQuantity),
      note: adjustNote || undefined,
    });
  };

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
        <Typography variant="h5">Inventory</Typography>

        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => setInitializeOpen(true)}>
            Initialize Stock
          </Button>

          <Button variant="contained" onClick={() => setAdjustOpen(true)}>
            Adjust Inventory
          </Button>
        </Stack>
      </Box>

      <Typography variant="body2" sx={{ mb: 2 }}>
        Low-stock products: {lowStockCount}
      </Typography>

      <Box sx={{ height: 420, mb: 4 }}>
        <DataGrid
          rows={stocks}
          columns={stockColumns}
          loading={isLoading}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
        />
      </Box>

      <Typography variant="h6" sx={{ mb: 1 }}>
        Recent Inventory Movements
      </Typography>

      <Box sx={{ height: 300 }}>
        <DataGrid
          rows={recentLedger}
          columns={ledgerColumns}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
        />
      </Box>

      <Dialog
        open={initializeOpen}
        onClose={() => setInitializeOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Initialize Product Stock</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
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

            <TextField
              label="Opening Stock"
              type="number"
              value={openingStock}
              onChange={(e) => setOpeningStock(e.target.value)}
              fullWidth
            />

            <TextField
              label="Reorder Level"
              type="number"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              fullWidth
            />

            <TextField
              label="Note"
              value={initNote}
              onChange={(e) => setInitNote(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setInitializeOpen(false)}>Cancel</Button>

          <Button
            variant="contained"
            onClick={handleInitialize}
            disabled={!productId || initializeMutation.isPending}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={adjustOpen} onClose={() => setAdjustOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Adjust Inventory</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Product"
              value={adjustProductId}
              onChange={(e) => setAdjustProductId(e.target.value)}
              fullWidth
            >
              {products.map((product) => (
                <MenuItem key={product.id} value={product.id}>
                  {product.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Movement Type"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as InventoryMovementType)}
              fullWidth
            >
              {movementOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Quantity"
              type="number"
              value={adjustQuantity}
              onChange={(e) => setAdjustQuantity(e.target.value)}
              fullWidth
            />

            <TextField
              label="Note"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setAdjustOpen(false)}>Cancel</Button>

          <Button
            variant="contained"
            onClick={handleAdjust}
            disabled={
              !adjustProductId ||
              !adjustQuantity ||
              Number(adjustQuantity) <= 0 ||
              adjustMutation.isPending
            }
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}
