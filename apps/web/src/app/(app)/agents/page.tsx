'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
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
  Agent,
  AgentStats,
  agentsService,
} from '@/services/agents.service';

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const { toast, showToast, closeToast } = useAppToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [defaultCommissionPercentage, setDefaultCommissionPercentage] = useState('');
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedAgentStatsId, setSelectedAgentStatsId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsService.getAll,
  });

  const { data: overviewStats } = useQuery({
    queryKey: ['agents', 'stats', 'overview'],
    queryFn: agentsService.getOverviewStats,
  });

  const { data: selectedAgentStats } = useQuery<AgentStats>({
    queryKey: ['agents', 'stats', selectedAgentStatsId],
    queryFn: () => agentsService.getAgentStats(selectedAgentStatsId as string),
    enabled: Boolean(selectedAgentStatsId),
  });

  const createMutation = useMutation({
    mutationFn: agentsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agents', 'stats', 'overview'] });
      handleCloseDialog();
      showToast('Agent created successfully', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to create agent', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<{
        name: string;
        phone: string;
        whatsappNumber: string;
        email: string;
        address: string;
        referenceCode: string;
        defaultCommissionPercentage: number;
      }>;
    }) => agentsService.update(id, payload),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agents', 'stats', 'overview'] });
      handleCloseDialog();
      showToast('Agent updated successfully', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to update agent', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: agentsService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agents', 'stats', 'overview'] });
      setDeleteDialogOpen(false);
      setDeletingAgent(null);
      showToast('Agent deleted successfully', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to delete agent', 'error');
    },
  });

  const bulkUploadMutation = useMutation({
    mutationFn: agentsService.bulkUpload,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agents', 'stats', 'overview'] });
      showToast(
        `Import complete: ${result.created} created, ${result.skipped} skipped`,
        'success',
      );
      if (result.errors.length > 0) {
        showToast(result.errors.slice(0, 3).join(' | '), 'error');
      }
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to upload agents Excel', 'error');
    },
    onSettled: () => setIsUploading(false),
  });

  const columns: GridColDef<Agent>[] = [
    { field: 'name', headerName: 'Name', flex: 1 },
    { field: 'phone', headerName: 'Phone', flex: 1 },
    { field: 'whatsappNumber', headerName: 'WhatsApp', flex: 1 },
    { field: 'email', headerName: 'Email', flex: 1 },
    { field: 'referenceCode', headerName: 'Ref Code', flex: 1 },
    {
      field: 'defaultCommissionPercentage',
      headerName: 'Default Commission %',
      width: 180,
      valueGetter: (_value, row) => `${Number(row.defaultCommissionPercentage).toFixed(2)}%`,
    },
    {
      field: 'active',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.row.active ? 'Active' : 'Inactive'}
          size="small"
          color={params.row.active ? 'success' : 'default'}
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 180,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={() => handleEdit(params.row)}>
            Edit
          </Button>
          <Button size="small" onClick={() => setSelectedAgentStatsId(params.row.id)}>
            Stats
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

  const handleCloseDialog = () => {
    setOpen(false);
    setEditingAgent(null);
    setName('');
    setPhone('');
    setWhatsappNumber('');
    setEmail('');
    setAddress('');
    setReferenceCode('');
    setDefaultCommissionPercentage('');
  };

  const handleOpenCreate = () => {
    handleCloseDialog();
    setOpen(true);
  };

  const getParsedCommission = () => {
    if (!defaultCommissionPercentage.trim()) {
      return undefined;
    }

    const value = Number(defaultCommissionPercentage);

    if (Number.isNaN(value) || value < 0 || value > 100) {
      return null;
    }

    return value;
  };

  const handleSave = () => {
    const commission = getParsedCommission();

    if (commission === null) {
      showToast('Commission percentage must be between 0 and 100', 'error');
      return;
    }

    const payload = {
      name,
      phone,
      whatsappNumber,
      email,
      address,
      referenceCode,
      defaultCommissionPercentage: commission,
    };

    if (editingAgent) {
      updateMutation.mutate({ id: editingAgent.id, payload });
      return;
    }

    createMutation.mutate(payload);
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setName(agent.name);
    setPhone(agent.phone ?? '');
    setWhatsappNumber(agent.whatsappNumber ?? '');
    setEmail(agent.email ?? '');
    setAddress(agent.address ?? '');
    setReferenceCode(agent.referenceCode ?? '');
    setDefaultCommissionPercentage(String(Number(agent.defaultCommissionPercentage)));
    setOpen(true);
  };

  const handleDeleteClick = (agent: Agent) => {
    setDeletingAgent(agent);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!deletingAgent) {
      return;
    }

    deleteMutation.mutate(deletingAgent.id);
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

  const filteredAgents = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return agents.filter((agent) => {
      if (statusFilter === 'ACTIVE' && !agent.active) {
        return false;
      }

      if (statusFilter === 'INACTIVE' && agent.active) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        agent.name,
        agent.phone,
        agent.whatsappNumber,
        agent.email,
        agent.referenceCode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [agents, searchText, statusFilter]);

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Total Agents
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {overviewStats?.totalAgents ?? 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Referred Quotes
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {overviewStats?.totalReferredQuotes ?? 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Referred Amount
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                ₹{(overviewStats?.totalReferredAmount ?? 0).toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Total Commission
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                ₹{(overviewStats?.totalCommissionAmount ?? 0).toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {overviewStats && overviewStats.topAgentsByCommission.length > 0 ? (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Top Agents By Commission
            </Typography>

            {overviewStats.topAgentsByCommission.map((row) => (
              <Stack
                key={row.agentId ?? `unknown-${row.quoteCount}`}
                direction="row"
                sx={{
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #eee',
                  py: 1,
                }}
              >
                <Typography>
                  {row.agent?.name ?? 'Unknown Agent'} ({row.quoteCount} quotes)
                </Typography>
                <Typography sx={{ fontWeight: 600 }}>
                  ₹{row.totalCommissionAmount.toFixed(2)}
                </Typography>
              </Stack>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="h5">Agents</Typography>

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
            Add Agent
          </Button>
        </Stack>
      </Box>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        sx={{ mb: 2, alignItems: { md: 'center' } }}
      >
        <TextField
          label="Search"
          placeholder="Name, phone, whatsapp, email"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          sx={{ minWidth: 260 }}
        />

        <TextField
          select
          label="Status"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')
          }
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="ALL">All</MenuItem>
          <MenuItem value="ACTIVE">Active</MenuItem>
          <MenuItem value="INACTIVE">Inactive</MenuItem>
        </TextField>

        <Button
          variant="text"
          onClick={() => {
            setSearchText('');
            setStatusFilter('ALL');
          }}
        >
          Clear
        </Button>
      </Stack>

      <Box sx={{ height: 520 }}>
        <DataGrid
          rows={filteredAgents}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
        />
      </Box>

      <Dialog open={open} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editingAgent ? 'Edit Agent' : 'Add Agent'}</DialogTitle>

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
              label="Reference Code"
              value={referenceCode}
              onChange={(e) => setReferenceCode(e.target.value)}
              fullWidth
            />

            <TextField
              label="Default Commission %"
              type="number"
              value={defaultCommissionPercentage}
              onChange={(e) => setDefaultCommissionPercentage(e.target.value)}
              slotProps={{
                htmlInput: {
                  min: 0,
                  max: 100,
                  step: 0.01,
                },
              }}
              fullWidth
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>

          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!name || createMutation.isPending || updateMutation.isPending}
          >
            {editingAgent ? 'Update' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Delete Agent</DialogTitle>

        <DialogContent>
          Are you sure you want to delete {deletingAgent?.name ?? 'this agent'}?
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
        open={Boolean(selectedAgentStatsId)}
        onClose={() => setSelectedAgentStatsId(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          Agent Performance - {selectedAgentStats?.agent.name ?? 'Agent'}
        </DialogTitle>

        <DialogContent>
          {selectedAgentStats ? (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">
                        Total Quotes
                      </Typography>
                      <Typography variant="h6">{selectedAgentStats.totalQuotes}</Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">
                        Converted Quotes
                      </Typography>
                      <Typography variant="h6">{selectedAgentStats.convertedQuotes}</Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">
                        Conversion Rate
                      </Typography>
                      <Typography variant="h6">{selectedAgentStats.conversionRate}%</Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">
                        Total Commission
                      </Typography>
                      <Typography variant="h6">
                        ₹{selectedAgentStats.totalCommissionAmount.toFixed(2)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Recent Quotes
              </Typography>

              {selectedAgentStats.recentQuotes.length === 0 ? (
                <Typography color="text.secondary">No quotes yet for this agent.</Typography>
              ) : (
                selectedAgentStats.recentQuotes.map((quote) => (
                  <Stack
                    key={quote.id}
                    direction="row"
                    sx={{
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #eee',
                      py: 1,
                    }}
                  >
                    <Typography>
                      {quote.quoteNumber} - {quote.customer.name} ({quote.status})
                    </Typography>
                    <Typography sx={{ fontWeight: 600 }}>
                      ₹{Number(quote.agentCommissionAmount).toFixed(2)}
                    </Typography>
                  </Stack>
                ))
              )}
            </Stack>
          ) : null}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setSelectedAgentStatsId(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}
