'use client';

import { ChangeEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
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
import {
  Customer,
  CustomerType,
  customersService,
} from '@/services/customers.service';
import { customerAccountsService } from '@/services/customer-accounts.service';

export default function CustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [customerTypeId, setCustomerTypeId] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [customerTypesOpen, setCustomerTypesOpen] = useState(false);
  const [editingCustomerType, setEditingCustomerType] = useState<CustomerType | null>(null);
  const [customerTypeCode, setCustomerTypeCode] = useState('');
  const [customerTypeName, setCustomerTypeName] = useState('');
  const [customerTypeDiscount, setCustomerTypeDiscount] = useState('0');
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerCustomerId, setLedgerCustomerId] = useState('');
  const { toast, showToast, closeToast } = useAppToast();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: customersService.getAll,
  });

  const { data: customerTypes = [] } = useQuery({
    queryKey: ['customer-types'],
    queryFn: customersService.getCustomerTypes,
  });

  const { data: outstanding } = useQuery({
    queryKey: ['customer-accounts', 'outstanding'],
    queryFn: customerAccountsService.getOutstanding,
  });

  const { data: ledgerSummary } = useQuery({
    queryKey: ['customer-accounts', ledgerCustomerId, 'summary'],
    queryFn: () => customerAccountsService.getSummary(ledgerCustomerId),
    enabled: ledgerOpen && Boolean(ledgerCustomerId),
  });

  const { data: ledger } = useQuery({
    queryKey: ['customer-accounts', ledgerCustomerId, 'ledger'],
    queryFn: () => customerAccountsService.getLedger(ledgerCustomerId),
    enabled: ledgerOpen && Boolean(ledgerCustomerId),
  });

  const outstandingByCustomer = new Map(
    (outstanding?.rows ?? []).map((row) => [row.customerId, row]),
  );

  const customerTypeNameById = new Map(
    customerTypes.map((type) => [type.id, type.name]),
  );

  const requestedLedgerCustomerId = searchParams.get('ledgerCustomerId');

  if (
    requestedLedgerCustomerId &&
    !ledgerOpen &&
    customers.some((customer) => customer.id === requestedLedgerCustomerId)
  ) {
    setLedgerCustomerId(requestedLedgerCustomerId);
    setLedgerOpen(true);
  }

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
      field: 'customerType',
      headerName: 'Customer Type',
      width: 160,
      valueGetter: (_value, row) =>
        row.customerTypeId ? (customerTypeNameById.get(row.customerTypeId) ?? '-') : '-',
    },
    {
      field: 'outstanding',
      headerName: 'Outstanding',
      width: 140,
      valueGetter: (_value, row) =>
        (outstandingByCustomer.get(row.id)?.outstanding ?? 0).toFixed(2),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 300,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            onClick={() => {
              setLedgerCustomerId(params.row.id);
              setLedgerOpen(true);
            }}
          >
            Ledger
          </Button>

          <Button
            size="small"
            onClick={() => router.push('/payments')}
          >
            Record Payment
          </Button>

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

  const customerTypeCreateMutation = useMutation({
    mutationFn: customersService.createCustomerType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-types'] });
      setCustomerTypeCode('');
      setCustomerTypeName('');
      setCustomerTypeDiscount('0');
      setEditingCustomerType(null);
      showToast('Customer type created successfully', 'success');
    },
    onError: () => showToast('Failed to create customer type', 'error'),
  });

  const customerTypeUpdateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { code: string; name: string; defaultDiscountPercentage: number } }) =>
      customersService.updateCustomerType(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-types'] });
      setCustomerTypeCode('');
      setCustomerTypeName('');
      setCustomerTypeDiscount('0');
      setEditingCustomerType(null);
      showToast('Customer type updated successfully', 'success');
    },
    onError: () => showToast('Failed to update customer type', 'error'),
  });

  const customerTypeDeleteMutation = useMutation({
    mutationFn: customersService.deleteCustomerType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-types'] });
      showToast('Customer type deactivated', 'success');
    },
    onError: () => showToast('Failed to deactivate customer type', 'error'),
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
    setCustomerTypeId('');
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
      customerTypeId: customerTypeId || undefined,
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
    setCustomerTypeId(customer.customerTypeId ?? '');

    setOpen(true);
  };

  const handleSaveCustomerType = () => {
    const parsedDiscount = Number(customerTypeDiscount);

    if (!customerTypeCode.trim() || !customerTypeName.trim()) {
      showToast('Customer type code and name are required', 'error');
      return;
    }

    if (!Number.isFinite(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
      showToast('Default discount must be between 0 and 100', 'error');
      return;
    }

    const payload = {
      code: customerTypeCode.trim(),
      name: customerTypeName.trim(),
      defaultDiscountPercentage: Number(parsedDiscount.toFixed(2)),
    };

    if (editingCustomerType) {
      customerTypeUpdateMutation.mutate({ id: editingCustomerType.id, payload });
      return;
    }

    customerTypeCreateMutation.mutate(payload);
  };

  const handleEditCustomerType = (type: CustomerType) => {
    setEditingCustomerType(type);
    setCustomerTypeCode(type.code);
    setCustomerTypeName(type.name);
    setCustomerTypeDiscount(String(Number(type.defaultDiscountPercentage ?? 0)));
  };

  const handleDeactivateCustomerType = (type: CustomerType) => {
    if (!window.confirm(`Deactivate customer type ${type.name}?`)) {
      return;
    }

    customerTypeDeleteMutation.mutate(type.id);
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
          <Button variant="outlined" onClick={() => setCustomerTypesOpen(true)}>
            Manage Customer Types
          </Button>

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
              select
              label="Customer Type"
              value={customerTypeId}
              onChange={(e) => setCustomerTypeId(e.target.value)}
              fullWidth
            >
              <MenuItem value="">None</MenuItem>
              {customerTypes
                .filter((type) => type.active)
                .map((type) => (
                  <MenuItem key={type.id} value={type.id}>
                    {type.name} ({Number(type.defaultDiscountPercentage).toFixed(2)}%)
                  </MenuItem>
                ))}
            </TextField>

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
        open={customerTypesOpen}
        onClose={() => setCustomerTypesOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Customer Type Management</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                label="Code"
                value={customerTypeCode}
                onChange={(e) => setCustomerTypeCode(e.target.value)}
                fullWidth
              />
              <TextField
                label="Name"
                value={customerTypeName}
                onChange={(e) => setCustomerTypeName(e.target.value)}
                fullWidth
              />
              <TextField
                label="Default Discount %"
                value={customerTypeDiscount}
                onChange={(e) => setCustomerTypeDiscount(e.target.value)}
                fullWidth
              />
              <Button variant="contained" onClick={handleSaveCustomerType}>
                {editingCustomerType ? 'Update' : 'Add'}
              </Button>
            </Stack>

            <Box sx={{ maxHeight: 360, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 1.5 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 8 }}>Code</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Name</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>Default %</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>Customers</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Status</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customerTypes.map((type) => (
                    <tr key={type.id}>
                      <td style={{ padding: 8 }}>{type.code}</td>
                      <td style={{ padding: 8 }}>{type.name}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>
                        {Number(type.defaultDiscountPercentage).toFixed(2)}
                      </td>
                      <td style={{ padding: 8, textAlign: 'right' }}>
                        {type._count?.customers ?? 0}
                      </td>
                      <td style={{ padding: 8 }}>{type.active ? 'Active' : 'Inactive'}</td>
                      <td style={{ padding: 8 }}>
                        <Stack direction="row" spacing={1}>
                          <Button size="small" onClick={() => handleEditCustomerType(type)}>
                            Edit
                          </Button>
                          {type.active ? (
                            <Button
                              size="small"
                              color="error"
                              onClick={() => handleDeactivateCustomerType(type)}
                            >
                              Deactivate
                            </Button>
                          ) : null}
                        </Stack>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setCustomerTypesOpen(false);
              setEditingCustomerType(null);
              setCustomerTypeCode('');
              setCustomerTypeName('');
              setCustomerTypeDiscount('0');
            }}
          >
            Close
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

      <Dialog
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Customer Ledger</DialogTitle>
        <DialogContent>
          {ledgerSummary ? (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Alert severity="info">
                Customer: {ledgerSummary.customer.name} | Invoiced: ₹{ledgerSummary.totals.totalInvoiced.toFixed(2)} | Received: ₹{ledgerSummary.totals.totalReceived.toFixed(2)} | Outstanding: ₹{ledgerSummary.totals.outstanding.toFixed(2)}
              </Alert>

              <Box sx={{ maxHeight: 360, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 1.5 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: 8 }}>Date</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Type</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Ref</th>
                      <th style={{ textAlign: 'right', padding: 8 }}>Debit</th>
                      <th style={{ textAlign: 'right', padding: 8 }}>Credit</th>
                      <th style={{ textAlign: 'right', padding: 8 }}>Running</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ledger?.transactions ?? []).map((row) => (
                      <tr key={`${row.type}-${row.referenceId}`}>
                        <td style={{ padding: 8 }}>{new Date(row.date).toLocaleDateString()}</td>
                        <td style={{ padding: 8 }}>{row.type}</td>
                        <td style={{ padding: 8 }}>{row.referenceNumber}</td>
                        <td style={{ padding: 8, textAlign: 'right' }}>{row.debit.toFixed(2)}</td>
                        <td style={{ padding: 8, textAlign: 'right' }}>{row.credit.toFixed(2)}</td>
                        <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{row.runningBalance.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLedgerOpen(false)}>Close</Button>
          <Button
            variant="contained"
            onClick={() => {
              setLedgerOpen(false);
              router.push('/payments');
            }}
          >
            Record Payment
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}