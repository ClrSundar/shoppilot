'use client';

import { useState } from 'react';
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

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: customersService.getAll,
  });

  const createMutation = useMutation({
    mutationFn: customersService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setOpen(false);
      setName('');
      setPhone('');
      setWhatsappNumber('');
      setEmail('');
      setAddress('');
      setGstNumber('');
    },
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
      width: 120,
      renderCell: (params) => (
        <Button
          size="small"
          onClick={() => handleEdit(params.row)}
        >
          Edit
        </Button>
      ),
    }
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

      setEditingCustomer(null);
      setOpen(false);
    },
  });

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

        <Button variant="contained" onClick={() => setOpen(true)}>
          Add Customer
        </Button>
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

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
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
          <Button onClick={() => setOpen(false)}>Cancel</Button>

          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!name || createMutation.isPending}
          >
            {editingCustomer ? 'Update' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}