'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { platformService, Tenant } from '@/services/platform.service';

const statusColor: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  PENDING: 'warning',
  ACTIVE: 'success',
  SUSPENDED: 'error',
  CANCELLED: 'default',
};

export default function PlatformTenantsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tab, setTab] = useState<string>('PENDING');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('platform_token');
    if (!stored) {
      router.replace('/platform-login');
      return;
    }
    setToken(stored);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    fetchTenants();
  }, [token, tab]);

  const fetchTenants = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError('');
      const data = await platformService.getTenants(token, tab === 'ALL' ? undefined : tab);
      setTenants(data);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        localStorage.removeItem('platform_token');
        router.replace('/platform-login');
      } else {
        setError('Failed to load tenants');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!token) return;
    await platformService.approveTenant(token, id);
    fetchTenants();
  };

  const handleReject = async () => {
    if (!token) return;
    await platformService.rejectTenant(token, rejectingId, rejectReason);
    setRejectDialogOpen(false);
    setRejectReason('');
    fetchTenants();
  };

  const handleSuspend = async (id: string) => {
    if (!token) return;
    await platformService.suspendTenant(token, id);
    fetchTenants();
  };

  const handleUnsuspend = async (id: string) => {
    if (!token) return;
    await platformService.unsuspendTenant(token, id);
    fetchTenants();
  };

  const columns: GridColDef<Tenant>[] = [
    { field: 'name', headerName: 'Shop Name', flex: 1 },
    { field: 'code', headerName: 'Code', width: 150 },
    { field: 'businessType', headerName: 'Type', width: 120 },
    {
      field: 'users',
      headerName: 'Owner',
      flex: 1,
      renderCell: (params) => params.row.users?.[0]?.email ?? '-',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip label={params.value} color={statusColor[params.value] ?? 'default'} size="small" />
      ),
    },
    {
      field: 'createdAt',
      headerName: 'Registered',
      width: 160,
      renderCell: (params) => new Date(params.value).toLocaleDateString(),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 240,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          {params.row.status === 'PENDING' && (
            <>
              <Button size="small" color="success" variant="outlined" onClick={() => handleApprove(params.row.id)}>
                Approve
              </Button>
              <Button
                size="small"
                color="error"
                variant="outlined"
                onClick={() => { setRejectingId(params.row.id); setRejectDialogOpen(true); }}
              >
                Reject
              </Button>
            </>
          )}
          {params.row.status === 'ACTIVE' && (
            <Button size="small" color="warning" variant="outlined" onClick={() => handleSuspend(params.row.id)}>
              Suspend
            </Button>
          )}
          {params.row.status === 'SUSPENDED' && (
            <Button size="small" color="success" variant="outlined" onClick={() => handleUnsuspend(params.row.id)}>
              Unsuspend
            </Button>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <Box sx={{ p: 4, minHeight: '100vh', bgcolor: '#f6f8fb' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Tenant Management
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Platform Admin Console
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          onClick={() => { localStorage.removeItem('platform_token'); router.push('/platform-login'); }}
        >
          Logout
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Pending" value="PENDING" />
        <Tab label="Active" value="ACTIVE" />
        <Tab label="Suspended" value="SUSPENDED" />
        <Tab label="Cancelled" value="CANCELLED" />
        <Tab label="All" value="ALL" />
      </Tabs>

      <DataGrid
        rows={tenants}
        columns={columns}
        loading={loading}
        pageSizeOptions={[10, 25]}
        initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
        autoHeight
        disableRowSelectionOnClick
        sx={{ bgcolor: 'white', borderRadius: 2 }}
      />

      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Tenant</DialogTitle>
        <DialogContent>
          <TextField
            label="Reason (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            fullWidth
            multiline
            rows={3}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleReject}>Reject</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
