'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import {
  Alert,
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
import { categoriesService } from '@/services/categories.service';
import {
  ArchivedProduct,
  Product,
  productsService,
  UpdateProductPayload,
} from '@/services/products.service';

export default function ProductsPage() {
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState('NOS');
  const [costPrice, setCostPrice] = useState('');
  const [landingPrice, setLandingPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showArchivedWithStockOnly, setShowArchivedWithStockOnly] = useState(false);
  const { toast, showToast, closeToast } = useAppToast();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: productsService.getAll,
  });

  const { data: archivedProducts = [], isLoading: archivedLoading } = useQuery({
    queryKey: ['products', 'archived'],
    queryFn: productsService.getArchived,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesService.getAll,
  });

  const createMutation = useMutation({
    mutationFn: productsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      handleCloseDialog();
      showToast('Product created successfully', 'success');
    },
    onError: () => showToast('Failed to create product', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateProductPayload;
    }) => productsService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      handleCloseDialog();
      showToast('Product updated successfully', 'success');
    },
    onError: () => showToast('Failed to update product', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: productsService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products', 'archived'] });
      setDeleteDialogOpen(false);
      setDeletingProduct(null);
      showToast('Product deleted successfully', 'success');
    },
    onError: () => showToast('Failed to delete product', 'error'),
  });

  const restoreMutation = useMutation({
    mutationFn: productsService.restore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products', 'archived'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      showToast('Product restored successfully', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to restore product', 'error');
    },
  });

  const bulkUploadMutation = useMutation({
    mutationFn: productsService.bulkUpload,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      showToast(
        `Import complete: ${result.created} created, ${result.skipped} skipped`,
        'success',
      );
      if (result.errors.length > 0) {
        showToast(result.errors.slice(0, 3).join(' | '), 'error');
      }
    },
    onError: () => showToast('Failed to upload products Excel', 'error'),
    onSettled: () => setIsUploading(false),
  });

  const columns: GridColDef<Product>[] = [
    { field: 'name', headerName: 'Name', flex: 1 },
    {
      field: 'category',
      headerName: 'Category',
      flex: 1,
      valueGetter: (_value, row) => row.category?.name,
    },
    { field: 'brand', headerName: 'Brand', flex: 1 },
    { field: 'unit', headerName: 'Unit', width: 100 },
    { field: 'costPrice', headerName: 'Cost Price', width: 130 },
    { field: 'landingPrice', headerName: 'Landing Price', width: 140 },
    { field: 'sellingPrice', headerName: 'Selling Price', width: 150 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 180,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={() => handleEdit(params.row)}>
            Edit
          </Button>

          <Button
            size="small"
            color="error"
            onClick={() => handleDeleteClick(params.row)}
          >
            Delete
          </Button>
        </Stack>
      ),
    },
  ];

  const archivedColumns: GridColDef<ArchivedProduct>[] = [
    { field: 'name', headerName: 'Product', flex: 1 },
    {
      field: 'category',
      headerName: 'Category',
      flex: 1,
      valueGetter: (_value, row) => row.category?.name,
    },
    {
      field: 'onHand',
      headerName: 'On Hand',
      width: 110,
      valueGetter: (_value, row) => Number(row.stock?.onHand ?? 0),
    },
    {
      field: 'reserved',
      headerName: 'Reserved',
      width: 110,
      valueGetter: (_value, row) => Number(row.stock?.reserved ?? 0),
    },
    {
      field: 'available',
      headerName: 'Available',
      width: 120,
      valueGetter: (_value, row) =>
        Number(row.stock?.onHand ?? 0) - Number(row.stock?.reserved ?? 0),
    },
    {
      field: 'reorderLevel',
      headerName: 'Reorder Level',
      width: 130,
      valueGetter: (_value, row) => Number(row.stock?.reorderLevel ?? 0),
    },
    {
      field: 'archivedAt',
      headerName: 'Archived',
      width: 180,
      valueGetter: (_value, row) => new Date(row.updatedAt).toLocaleString(),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 130,
      renderCell: (params) => (
        <Button
          size="small"
          variant="outlined"
          onClick={() => restoreMutation.mutate(params.row.id)}
          disabled={restoreMutation.isPending}
        >
          Restore
        </Button>
      ),
    },
  ];

  const filteredArchivedProducts = useMemo(() => {
    if (!showArchivedWithStockOnly) {
      return archivedProducts;
    }

    return archivedProducts.filter(
      (product) => Number(product.stock?.onHand ?? 0) > 0,
    );
  }, [archivedProducts, showArchivedWithStockOnly]);

  const handleCloseDialog = () => {
    setOpen(false);
    setEditingProduct(null);
    setCategoryId('');
    setName('');
    setBrand('');
    setUnit('NOS');
    setCostPrice('');
    setLandingPrice('');
    setSellingPrice('');
  };

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setCategoryId('');
    setName('');
    setBrand('');
    setUnit('NOS');
    setCostPrice('');
    setLandingPrice('');
    setSellingPrice('');
    setOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setCategoryId(product.categoryId);
    setName(product.name);
    setBrand(product.brand ?? '');
    setUnit(product.unit ?? 'NOS');
    setCostPrice(String(product.costPrice ?? ''));
    setLandingPrice(product.landingPrice ? String(product.landingPrice) : '');
    setSellingPrice(String(product.sellingPrice ?? ''));
    setOpen(true);
  };

  const handleDeleteClick = (product: Product) => {
    setDeletingProduct(product);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!deletingProduct) {
      return;
    }

    deleteMutation.mutate(deletingProduct.id);
  };

  const handleSubmit = () => {
    const payload = {
      categoryId,
      name,
      brand,
      unit,
      costPrice: Number(costPrice),
      landingPrice: landingPrice ? Number(landingPrice) : null,
      sellingPrice: Number(sellingPrice),
    };

    if (editingProduct) {
      updateMutation.mutate({
        id: editingProduct.id,
        payload,
      });

      return;
    }

    createMutation.mutate(payload);
  };

  const handleExcelUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setIsUploading(true);
    bulkUploadMutation.mutate(file);
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
        <Typography variant="h5">Products</Typography>

        <Stack direction="row" spacing={1}>
          <Button component="label" variant="outlined" disabled={isUploading}>
            Upload Excel
            <input
              hidden
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelUpload}
            />
          </Button>

          <Button variant="contained" onClick={handleOpenCreate}>
            Add Product
          </Button>
        </Stack>
      </Box>

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={products}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
        />
      </Box>

      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>
        Archived Product Stocks
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        Archived products keep their stock. Restore them anytime to make them sellable again.
      </Alert>

      <FormControlLabel
        sx={{ mb: 1 }}
        control={(
          <Checkbox
            checked={showArchivedWithStockOnly}
            onChange={(event) => setShowArchivedWithStockOnly(event.target.checked)}
          />
        )}
        label="Show only items with stock > 0"
      />

      <Box sx={{ height: 360 }}>
        <DataGrid
          rows={filteredArchivedProducts}
          columns={archivedColumns}
          loading={archivedLoading}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
        />
      </Box>

      <Dialog open={open} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              fullWidth
            >
              {categories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Product Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
            />

            <TextField
              label="Brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              fullWidth
            />

            <TextField
              label="Unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              fullWidth
            />

            <TextField
              label="Cost Price"
              type="number"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              fullWidth
            />

            <TextField
              label="Landing Price (optional)"
              type="number"
              value={landingPrice}
              onChange={(e) => setLandingPrice(e.target.value)}
              helperText="Total cost to bring to warehouse (cost + freight + duties). Unit price in quotes cannot go below this."
              fullWidth
            />

            <TextField
              label="Selling Price"
              type="number"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>

          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={
              !categoryId ||
              !name ||
              !costPrice ||
              !sellingPrice ||
              createMutation.isPending ||
              updateMutation.isPending
            }
          >
            {editingProduct ? 'Update' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Delete Product</DialogTitle>

        <DialogContent>
          Are you sure you want to delete {deletingProduct?.name ?? 'this product'}?
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>

          <Button
            color="error"
            variant="contained"
            onClick={handleDeleteConfirm}
            disabled={deleteMutation.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}