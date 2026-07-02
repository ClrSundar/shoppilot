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
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppToast } from '@/components/common/AppToast';
import { useAppToast } from '@/hooks/use-app-toast';
import {
  ArchivedCategory,
  categoriesService,
  Category,
  UpdateCategoryPayload,
} from '@/services/categories.service';

export default function CategoriesPage() {
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showArchivedWithStockOnly, setShowArchivedWithStockOnly] = useState(false);
  const { toast, showToast, closeToast } = useAppToast();

  const { data = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesService.getAll,
  });

  const { data: archivedCategories = [], isLoading: archivedLoading } = useQuery({
    queryKey: ['categories', 'archived'],
    queryFn: categoriesService.getArchived,
  });

  const createMutation = useMutation({
    mutationFn: categoriesService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      handleCloseDialog();
      showToast('Category created successfully', 'success');
    },
    onError: () => showToast('Failed to create category', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCategoryPayload }) =>
      categoriesService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      handleCloseDialog();
      showToast('Category updated successfully', 'success');
    },
    onError: () => showToast('Failed to update category', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: categoriesService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories', 'archived'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products', 'archived'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setDeleteDialogOpen(false);
      setDeletingCategory(null);
      showToast('Category deleted successfully', 'success');
    },
    onError: () => showToast('Failed to delete category', 'error'),
  });

  const restoreMutation = useMutation({
    mutationFn: categoriesService.restore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories', 'archived'] });
      showToast('Category restored successfully', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to restore category', 'error');
    },
  });

  const bulkUploadMutation = useMutation({
    mutationFn: categoriesService.bulkUpload,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      showToast(
        `Import complete: ${result.created} created, ${result.skipped} skipped`,
        'success',
      );
      if (result.errors.length > 0) {
        showToast(result.errors.slice(0, 3).join(' | '), 'error');
      }
    },
    onError: () => showToast('Failed to upload category Excel', 'error'),
    onSettled: () => setIsUploading(false),
  });

  const columns: GridColDef<Category>[] = [
    { field: 'name', headerName: 'Name', flex: 1 },
    { field: 'description', headerName: 'Description', flex: 1 },
    { field: 'active', headerName: 'Active', width: 120 },
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

  const archivedColumns: GridColDef<ArchivedCategory>[] = [
    { field: 'name', headerName: 'Category', flex: 1 },
    {
      field: 'productsCount',
      headerName: 'Products',
      width: 110,
    },
    {
      field: 'onHand',
      headerName: 'On Hand',
      width: 110,
      valueGetter: (_value, row) => row.stockSummary.onHand,
    },
    {
      field: 'reserved',
      headerName: 'Reserved',
      width: 110,
      valueGetter: (_value, row) => row.stockSummary.reserved,
    },
    {
      field: 'available',
      headerName: 'Available',
      width: 120,
      valueGetter: (_value, row) => row.stockSummary.available,
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

  const filteredArchivedCategories = useMemo(() => {
    if (!showArchivedWithStockOnly) {
      return archivedCategories;
    }

    return archivedCategories.filter((category) => category.stockSummary.onHand > 0);
  }, [archivedCategories, showArchivedWithStockOnly]);

  const handleCloseDialog = () => {
    setOpen(false);
    setEditingCategory(null);
    setName('');
    setDescription('');
  };

  const handleOpenCreate = () => {
    setEditingCategory(null);
    setName('');
    setDescription('');
    setOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setName(category.name);
    setDescription(category.description ?? '');
    setOpen(true);
  };

  const handleDeleteClick = (category: Category) => {
    setDeletingCategory(category);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!deletingCategory) {
      return;
    }

    deleteMutation.mutate(deletingCategory.id);
  };

  const handleSubmit = () => {
    const payload = {
      name,
      description,
    };

    if (editingCategory) {
      updateMutation.mutate({
        id: editingCategory.id,
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
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="h5">Categories</Typography>

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
            Add Category
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={data}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
        />
      </Box>

      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>
        Archived Categories
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        Restoring a category makes it available for future use. Products stay archived until you restore them from Products.
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

      <Box sx={{ height: 340 }}>
        <DataGrid
          rows={filteredArchivedCategories}
          columns={archivedColumns}
          loading={archivedLoading}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
        />
      </Box>

      <Dialog open={open} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>

        <DialogContent>
          <Stack
            spacing={2}
            sx={{ mt: 1 }}
          >
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
            />

            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>

          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!name || createMutation.isPending || updateMutation.isPending}
          >
            {editingCategory ? 'Update' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Delete Category</DialogTitle>

        <DialogContent>
          Are you sure you want to delete {deletingCategory?.name ?? 'this category'}?
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