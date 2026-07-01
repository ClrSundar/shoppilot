'use client';

import { ChangeEvent, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppToast } from '@/hooks/use-app-toast';
import { AppToast } from '@/components/common/AppToast';
import { usersService, TeamUser, CreateUserPayload } from '@/services/users.service';

const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN'] as const;

const roleColor: Record<string, 'error' | 'warning' | 'info' | 'default' | 'success'> = {
  OWNER: 'error',
  ADMIN: 'warning',
  MANAGER: 'info',
  SALES: 'success',
  TECHNICIAN: 'default',
};

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { toast, showToast, closeToast } = useAppToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamUser['role']>('SALES');
  const [password, setPassword] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: usersService.getAll,
  });

  const createMutation = useMutation({
    mutationFn: usersService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setOpen(false);
      resetForm();
      showToast('User added successfully', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message ?? 'Failed to add user', 'error');
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: TeamUser['role'] }) =>
      usersService.updateRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast('Role updated', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message ?? 'Failed to update role', 'error');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: usersService.toggleActive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast('User status updated', 'success');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message ?? 'Failed to update status', 'error');
    },
  });

  const bulkUploadMutation = useMutation({
    mutationFn: usersService.bulkUpload,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast(
        `Import complete: ${result.created} created, ${result.skipped} skipped`,
        'success',
      );
      if (result.errors.length > 0) {
        showToast(result.errors.slice(0, 3).join(' | '), 'error');
      }
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message ?? 'Failed to upload team Excel', 'error');
    },
    onSettled: () => setIsUploading(false),
  });

  const resetForm = () => {
    setName('');
    setEmail('');
    setRole('SALES');
    setPassword('');
  };

  const handleSubmit = () => {
    createMutation.mutate({ name, email, role, password } as CreateUserPayload);
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

  const columns: GridColDef<TeamUser>[] = [
    { field: 'name', headerName: 'Name', flex: 1 },
    { field: 'email', headerName: 'Email', flex: 1 },
    {
      field: 'role',
      headerName: 'Role',
      width: 160,
      renderCell: (params) => (
        <Select
          size="small"
          value={params.row.role}
          disabled={params.row.role === 'OWNER' || roleMutation.isPending}
          onChange={(e) =>
            roleMutation.mutate({ id: params.row.id, role: e.target.value as TeamUser['role'] })
          }
          sx={{ fontSize: 13 }}
        >
          {ROLES.map((r) => (
            <MenuItem key={r} value={r}>
              <Chip label={r} color={roleColor[r]} size="small" />
            </MenuItem>
          ))}
        </Select>
      ),
    },
    {
      field: 'active',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => (
        <Chip
          label={params.row.active ? 'Active' : 'Disabled'}
          color={params.row.active ? 'success' : 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'createdAt',
      headerName: 'Added',
      width: 130,
      renderCell: (params) => new Date(params.value).toLocaleDateString(),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 130,
      renderCell: (params) =>
        params.row.role !== 'OWNER' ? (
          <Button
            size="small"
            color={params.row.active ? 'error' : 'success'}
            onClick={() => toggleMutation.mutate(params.row.id)}
            disabled={toggleMutation.isPending}
          >
            {params.row.active ? 'Disable' : 'Enable'}
          </Button>
        ) : null,
    },
  ];

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Team Members
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Manage your shop's users and roles
          </Typography>
        </Box>
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

          <Button variant="contained" onClick={() => setOpen(true)} sx={{ textTransform: 'none' }}>
            Add User
          </Button>
        </Stack>
      </Stack>

      <DataGrid
        rows={users}
        columns={columns}
        loading={isLoading}
        pageSizeOptions={[10, 25]}
        initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
        autoHeight
        disableRowSelectionOnClick
        sx={{ bgcolor: 'white', borderRadius: 2 }}
      />

      <Dialog open={open} onClose={() => { setOpen(false); resetForm(); }} maxWidth="sm" fullWidth>
        <DialogTitle>Add Team Member</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Full Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
            <TextField
              select
              label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value as TeamUser['role'])}
              fullWidth
            >
              {ROLES.filter((r) => r !== 'OWNER').map((r) => (
                <MenuItem key={r} value={r}>{r}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Temporary Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText="User can change this after login"
              fullWidth
            />
            <Alert severity="info">
              Share these credentials with the user directly. They can update their password after logging in.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!name || !email || !password || password.length < 8 || createMutation.isPending}
          >
            Add User
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}
