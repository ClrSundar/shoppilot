'use client';

import { ChangeEvent, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppToast } from '@/components/common/AppToast';
import { useAppToast } from '@/hooks/use-app-toast';
import { Customer, customersService } from '@/services/customers.service';

export default function CustomersPage() {
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast, showToast, closeToast } = useAppToast();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: customersService.getAll,
  });

  const createMutation = useMutation({
    mutationFn: customersService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      handleCloseDialog();
      showToast('Customer created successfully', 'success');
    },
    onError: () => showToast('Failed to create customer', 'error'),
  });

  const columns: GridColDef<Customer>[] = [
    { field: 'name', headerName: 'Name', flex: 1 },
    { field: 'phone', headerName: 'Phone', flex: 1 },
    { field: 'whatsappNumber', headerName: 'WhatsApp Number', flex: 1 },
    { field: 'email', headerName: 'Email', flex: 1 },
    { field: 'address', headerName: 'Address', flex: 1 },
    { field: 'gstNumber', headerName: 'GST Number', flex: 1 },
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

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<Customer>;
    }) =>
      customersService.update(id, payload),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['customers'],
      });

      handleCloseDialog();
      showToast('Customer updated successfully', 'success');
    },
    onError: () => showToast('Failed to update customer', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: customersService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDeleteDialogOpen(false);
      setDeletingCustomer(null);
      showToast('Customer deleted successfully', 'success');
    },
    onError: () => showToast('Failed to delete customer', 'error'),
  });

  const bulkUploadMutation = useMutation({
    mutationFn: customersService.bulkUpload,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      showToast(
        `Import complete: ${result.created} created, ${result.skipped} skipped`,
        'success',
      );
      if (result.errors.length > 0) {
        showToast(result.errors.slice(0, 3).join(' | '), 'error');
      }
    },
    onError: () => showToast('Failed to upload customers Excel', 'error'),
    onSettled: () => setIsUploading(false),
  });

  const handleCloseDialog = () => {
    setOpen(false);
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setWhatsappNumber('');
    setEmail('');
    setAddress('');
    setGstNumber('');
  };

  const handleOpenCreate = () => {
    handleCloseDialog();
    setOpen(true);
  };

  const handleCreate = () => {
    const payload = {
      name,
      phone,
      whatsappNumber,
      email,
      address,
      gstNumber,
    };

    if (editingCustomer) {
      updateMutation.mutate({
        id: editingCustomer.id,
        payload,
      });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);

    setName(customer.name);
    setPhone(customer.phone ?? '');
    setWhatsappNumber(
      customer.whatsappNumber ?? '',
    );
    setEmail(customer.email ?? '');
    setAddress(customer.address ?? '');

    setOpen(true);
  };

  const handleDeleteClick = (customer: Customer) => {
    setDeletingCustomer(customer);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!deletingCustomer) {
      return;
    }

    deleteMutation.mutate(deletingCustomer.id);
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
        <Typography variant="h5">Customers</Typography>

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
            Add Customer
          </Button>
        </Stack>
      </Box>

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={customers}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
        />
      </Box>

      <Dialog open={open} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
            />

            <TextField
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
            />

            <TextField
              label="WhatsApp Number"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              fullWidth
            />

            <TextField
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
            />

            <TextField
              label="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              fullWidth
            />

            <TextField
              label="GST Number"
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>

          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!name || createMutation.isPending || updateMutation.isPending}
          >
            {editingCustomer ? 'Update' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Delete Customer</DialogTitle>

        <DialogContent>
          Are you sure you want to delete {deletingCustomer?.name ?? 'this customer'}?
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