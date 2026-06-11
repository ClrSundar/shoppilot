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

import { categoriesService } from '@/services/categories.service';
import { Product, productsService } from '@/services/products.service';

export default function ProductsPage() {
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState('NOS');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: productsService.getAll,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesService.getAll,
  });

  const createMutation = useMutation({
    mutationFn: productsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setOpen(false);
      setCategoryId('');
      setName('');
      setBrand('');
      setUnit('NOS');
      setCostPrice('');
      setSellingPrice('');
    },
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
    { field: 'sellingPrice', headerName: 'Selling Price', width: 150 },
  ];

  const handleCreate = () => {
    createMutation.mutate({
      categoryId,
      name,
      brand,
      unit,
      costPrice: Number(costPrice),
      sellingPrice: Number(sellingPrice),
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
        <Typography variant="h5">Products</Typography>

        <Button variant="contained" onClick={() => setOpen(true)}>
          Add Product
        </Button>
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

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add Product</DialogTitle>

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
              label="Selling Price"
              type="number"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>

          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={
              !categoryId ||
              !name ||
              !costPrice ||
              !sellingPrice ||
              createMutation.isPending
            }
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}