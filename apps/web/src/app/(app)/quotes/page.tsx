'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  Menu,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppToast } from '@/components/common/AppToast';
import { useAppToast } from '@/hooks/use-app-toast';
import { Quote, quotesService } from '@/services/quotes.service';
import { productsService } from '@/services/products.service';
import { customersService } from '@/services/customers.service';
import { inventoryService } from '@/services/inventory.service';
import { agentsService } from '@/services/agents.service';
import {
  tenantSettingsService,
  type AgentDiscountConfigItem,
} from '@/services/tenant-settings.service';
import type { AgentCategory, QuoteStatus } from '@/services/quotes.service';

type QuoteDraftItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

const FALLBACK_AGENT_CATEGORY_OPTIONS: AgentDiscountConfigItem[] = [
  { category: 'ENGINEER', label: 'Engineer', defaultDiscountPercentage: 5 },
  {
    category: 'EXISTING_CUSTOMER',
    label: 'Existing Customer',
    defaultDiscountPercentage: 2,
  },
  { category: 'DEALER', label: 'Dealer', defaultDiscountPercentage: 3 },
  { category: 'CONTRACTOR', label: 'Contractor', defaultDiscountPercentage: 4 },
  { category: 'OTHER', label: 'Other', defaultDiscountPercentage: 0 },
];

export default function QuotesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast, showToast, closeToast } = useAppToast();

  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [actionsAnchorEl, setActionsAnchorEl] = useState<null | HTMLElement>(null);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | QuoteStatus>('ALL');
  const [agentFilter, setAgentFilter] = useState('ALL');
  const [customerFilter, setCustomerFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [editCustomerId, setEditCustomerId] = useState('');
  const [editAgentId, setEditAgentId] = useState('');
  const [editAgentCommissionPercentage, setEditAgentCommissionPercentage] =
    useState('');
  const [editAgentCategory, setEditAgentCategory] = useState<
    AgentCategory | ''
  >('');
  const [editDiscountPercentage, setEditDiscountPercentage] = useState('');
  const [editProductId, setEditProductId] = useState('');
  const [editQuantity, setEditQuantity] = useState('1');
  const [editNotes, setEditNotes] = useState('');
  const [editItems, setEditItems] = useState<QuoteDraftItem[]>([]);

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: quotesService.getAll,
  });

  const { data: selectedQuote } = useQuery({
    queryKey: ['quote', selectedQuoteId],
    queryFn: () => quotesService.getById(selectedQuoteId as string),
    enabled: Boolean(selectedQuoteId),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: customersService.getAll,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: productsService.getAll,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsService.getAll,
  });

  const { data: inventoryStocks = [] } = useQuery({
    queryKey: ['inventory', 'stocks'],
    queryFn: inventoryService.getStocks,
  });

  const { data: agentDiscountConfig } = useQuery({
    queryKey: ['tenant-settings', 'agent-discounts'],
    queryFn: tenantSettingsService.getAgentDiscountConfig,
  });

  const agentCategoryOptions =
    agentDiscountConfig?.items?.length
      ? agentDiscountConfig.items
      : FALLBACK_AGENT_CATEGORY_OPTIONS;

  const defaultDiscountByCategory = new Map(
    agentCategoryOptions.map((item) => [item.category, item.defaultDiscountPercentage]),
  );

  const categoryLabelByValue = new Map(
    agentCategoryOptions.map((item) => [item.category, item.label]),
  );

  const updateStatusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: QuoteStatus;
    }) => quotesService.updateStatus(id, status),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({
        queryKey: ['quote', selectedQuoteId],
      });

      showToast('Quote status updated successfully', 'success');
    },
    onError: () => showToast('Failed to update quote status', 'error'),
  });

  const updateDraftMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        customerId: string;
        agentId?: string;
        agentCommissionPercentage?: number;
        agentCategory?: AgentCategory;
        discountPercentage?: number;
        notes?: string;
        items: {
          productId: string;
          quantity: number;
        }[];
      };
    }) => quotesService.update(id, payload),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({
        queryKey: ['quote', selectedQuoteId],
      });
      setIsEditingDraft(false);
      showToast('Draft quote updated successfully', 'success');
    },
    onError: () => showToast('Failed to update draft quote', 'error'),
  });

  const columns: GridColDef<Quote>[] = [
    { field: 'quoteNumber', headerName: 'Quote No', width: 140 },
    {
      field: 'customer',
      headerName: 'Customer',
      flex: 1,
      valueGetter: (_value, row) => row.customer?.name,
    },
    {
      field: 'agent',
      headerName: 'Agent',
      width: 180,
      valueGetter: (_value, row) => row.agent?.name ?? '-',
    },
    { field: 'status', headerName: 'Status', width: 120 },
    { field: 'subtotal', headerName: 'Subtotal', width: 130 },
    { field: 'totalAmount', headerName: 'Total', width: 130 },
    { field: 'createdAt', headerName: 'Created At', flex: 1 },
  ];

  const parsePercentage = (value: string) => {
    if (!value.trim()) {
      return undefined;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return null;
    }

    return parsed;
  };

  const handleStartDraftEdit = () => {
    if (!selectedQuote || selectedQuote.status !== 'DRAFT') {
      return;
    }

    setEditCustomerId(selectedQuote.customer.id);
    setEditAgentId(selectedQuote.agentId ?? '');
    setEditAgentCommissionPercentage(
      selectedQuote.agentCommissionPercentage
        ? String(Number(selectedQuote.agentCommissionPercentage))
        : '',
    );
    setEditAgentCategory(
      (selectedQuote.metadata?.quoteDiscount?.agentCategory as AgentCategory | null) ??
        '',
    );
    setEditDiscountPercentage(
      selectedQuote.metadata?.quoteDiscount?.discountPercentage !== undefined
        ? String(selectedQuote.metadata.quoteDiscount.discountPercentage)
        : '',
    );
    setEditNotes(selectedQuote.notes ?? '');
    setEditItems(
      (selectedQuote.items ?? []).map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
    );
    setEditProductId('');
    setEditQuantity('1');
    setIsEditingDraft(true);
  };

  const handleAddEditItem = () => {
    const product = products.find((p) => p.id === editProductId);

    if (!product) {
      return;
    }

    const qty = Number(editQuantity);

    if (!qty || qty <= 0) {
      return;
    }

    const unitPrice = Number(product.sellingPrice);

    const stock = inventoryStocks.find((item) => item.productId === product.id);
    const available = stock
      ? Number(stock.onHand) - Number(stock.reserved)
      : Number.POSITIVE_INFINITY;

    setEditItems((prevItems) => {
      const existing = prevItems.find((item) => item.productId === product.id);

      if (existing && existing.quantity + qty > available) {
        showToast('Quantity exceeds available stock', 'error');
        return prevItems;
      }

      if (!existing && qty > available) {
        showToast('Quantity exceeds available stock', 'error');
        return prevItems;
      }

      if (existing) {
        return prevItems.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + qty,
              }
            : item,
        );
      }

      return [
        ...prevItems,
        {
          productId: product.id,
          productName: product.name,
          quantity: qty,
          unitPrice,
        },
      ];
    });

    setEditProductId('');
    setEditQuantity('1');
  };

  const handleEditItemQuantityChange = (productIdToUpdate: string, value: string) => {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    setEditItems((prevItems) =>
      prevItems.map((item) =>
        item.productId === productIdToUpdate
          ? {
              ...item,
              quantity: parsed,
            }
          : item,
      ),
    );
  };

  const handleRemoveEditItem = (productIdToRemove: string) => {
    setEditItems((prevItems) =>
      prevItems.filter((item) => item.productId !== productIdToRemove),
    );
  };

  const handleSaveDraftEdits = () => {
    if (!selectedQuote || selectedQuote.status !== 'DRAFT') {
      return;
    }

    const parsedCommission = parsePercentage(editAgentCommissionPercentage);
    const parsedDiscount = parsePercentage(editDiscountPercentage);

    if (parsedCommission === null) {
      showToast('Agent commission must be between 0 and 100', 'error');
      return;
    }

    if (parsedDiscount === null) {
      showToast('Discount percentage must be between 0 and 100', 'error');
      return;
    }

    if (!editAgentId && parsedCommission !== undefined) {
      showToast('Select an agent before setting commission percentage', 'error');
      return;
    }

    updateDraftMutation.mutate({
      id: selectedQuote.id,
      payload: {
        customerId: editCustomerId,
        agentId: editAgentId || undefined,
        agentCommissionPercentage: parsedCommission,
        agentCategory: editAgentCategory || undefined,
        discountPercentage: parsedDiscount,
        notes: editNotes,
        items: editItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      },
    });
  };

  const handleDuplicateQuote = () => {
    if (!selectedQuote) {
      return;
    }

    setSelectedQuoteId(null);
    router.push(`/quotes/new?fromQuoteId=${selectedQuote.id}`);
  };

  const handleCancelQuote = () => {
    if (!selectedQuote) {
      return;
    }

    if (!window.confirm('Are you sure you want to cancel this quote?')) {
      return;
    }

    updateStatusMutation.mutate({
      id: selectedQuote.id,
      status: 'CANCELLED',
    });
  };

  const handleWhatsAppShare = () => {
    if (!selectedQuote) {
      return;
    }

    const phone = (
      selectedQuote.customer.whatsappNumber ||
      selectedQuote.customer.phone ||
      ''
    ).replace(/\D/g, '');

    const message = `
      Quotation ${selectedQuote.quoteNumber}

      Customer: ${selectedQuote.customer.name}

      Status: ${selectedQuote.status}

      Total: ₹${selectedQuote.totalAmount}

      Generated via ShopPilot.
      `;

    const url = phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(url, '_blank');
  };

  const parsedEditDiscount = parsePercentage(editDiscountPercentage) ?? 0;
  const editSubtotal = editItems.reduce(
    (total, item) => total + item.quantity * item.unitPrice,
    0,
  );
  const editDiscountAmount = Number(
    ((editSubtotal * parsedEditDiscount) / 100).toFixed(2),
  );
  const editTotal = Number((editSubtotal - editDiscountAmount).toFixed(2));

  const activeAgents = agents.filter((agent) => agent.active);

  const filteredQuotes = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return quotes.filter((quote) => {
      if (statusFilter !== 'ALL' && quote.status !== statusFilter) {
        return false;
      }

      if (agentFilter !== 'ALL' && (quote.agentId ?? '') !== agentFilter) {
        return false;
      }

      if (customerFilter !== 'ALL' && quote.customer.id !== customerFilter) {
        return false;
      }

      const createdAtTime = new Date(quote.createdAt).getTime();

      if (fromDate) {
        const fromTime = new Date(`${fromDate}T00:00:00`).getTime();
        if (createdAtTime < fromTime) {
          return false;
        }
      }

      if (toDate) {
        const toTime = new Date(`${toDate}T23:59:59`).getTime();
        if (createdAtTime > toTime) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      const haystack = [
        quote.quoteNumber,
        quote.customer?.name,
        quote.agent?.name,
        quote.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [
    quotes,
    searchText,
    statusFilter,
    agentFilter,
    customerFilter,
    fromDate,
    toDate,
  ]);

  const versionQuotes = useMemo(() => {
    if (!selectedQuote) {
      return [] as Quote[];
    }

    const quoteById = new Map<string, Quote>(quotes.map((quote) => [quote.id, quote]));
    quoteById.set(selectedQuote.id, selectedQuote);

    const resolveRootQuoteId = (quote: Quote) => {
      let currentQuote = quote;

      for (let depth = 0; depth < 20; depth += 1) {
        const parentId = currentQuote.metadata?.revisionOfQuoteId;

        if (!parentId) {
          return currentQuote.id;
        }

        const parentQuote = quoteById.get(parentId);

        if (!parentQuote) {
          return parentId;
        }

        currentQuote = parentQuote;
      }

      return currentQuote.id;
    };

    const familyRootId = resolveRootQuoteId(selectedQuote);

    return Array.from(quoteById.values())
      .filter((quote) => resolveRootQuoteId(quote) === familyRootId)
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      );
  }, [quotes, selectedQuote]);

  const getExpiryText = (quote: Quote) => {
    if (!quote.validUntil) {
      return 'Expires in 7 days from creation';
    }

    const expiryTime = new Date(quote.validUntil).getTime();
    const remainingDays = Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24));

    if (quote.status === 'EXPIRED' || remainingDays <= 0) {
      return `Expired on ${new Date(quote.validUntil).toLocaleDateString()}`;
    }

    return `Expires in ${remainingDays} day(s) on ${new Date(quote.validUntil).toLocaleDateString()}`;
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
        <Typography variant="h5">Quotes</Typography>

        <Button variant="contained" onClick={() => router.push('/quotes/new')}>
          New Quote
        </Button>
      </Box>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        sx={{ mb: 2, alignItems: { md: 'center' } }}
      >
        <TextField
          label="Search"
          placeholder="Quote no, customer, agent"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          sx={{ minWidth: 240 }}
        />

        <TextField
          select
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | QuoteStatus)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="ALL">All</MenuItem>
          <MenuItem value="DRAFT">Draft</MenuItem>
          <MenuItem value="SENT">Sent</MenuItem>
          <MenuItem value="APPROVED">Approved</MenuItem>
          <MenuItem value="INVOICED">Invoiced</MenuItem>
          <MenuItem value="DISPATCHED">Dispatched</MenuItem>
          <MenuItem value="REJECTED">Rejected</MenuItem>
          <MenuItem value="EXPIRED">Expired</MenuItem>
          <MenuItem value="CANCELLED">Cancelled</MenuItem>
        </TextField>

        <TextField
          select
          label="Agent"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="ALL">All</MenuItem>
          {activeAgents.map((agent) => (
            <MenuItem key={agent.id} value={agent.id}>
              {agent.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label="Customer"
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="ALL">All</MenuItem>
          {customers.map((customer) => (
            <MenuItem key={customer.id} value={customer.id}>
              {customer.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="From"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          label="To"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <Button
          variant="text"
          onClick={() => {
            setSearchText('');
            setStatusFilter('ALL');
            setAgentFilter('ALL');
            setCustomerFilter('ALL');
            setFromDate('');
            setToDate('');
          }}
        >
          Clear
        </Button>
      </Stack>

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={filteredQuotes}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
          onRowClick={(params) => setSelectedQuoteId(params.row.id)}
        />
      </Box>

      <Dialog
        open={Boolean(selectedQuoteId)}
        onClose={() => {
          setSelectedQuoteId(null);
          setIsEditingDraft(false);
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between', gap: 1 }}
          >
            <Typography variant="h6">Quote Details - {selectedQuote?.quoteNumber}</Typography>

            {selectedQuote && versionQuotes.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel>Version</InputLabel>
                <Select
                  label="Version"
                  value={selectedQuote.id}
                  onChange={(e) => setSelectedQuoteId(e.target.value)}
                >
                  {versionQuotes.map((quote, index) => (
                    <MenuItem key={quote.id} value={quote.id}>
                      V{index + 1} - {quote.quoteNumber} ({quote.status})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Stack>
        </DialogTitle>

        <DialogContent>
          {selectedQuote && (
            <Box>
              {selectedQuote.status === 'DRAFT' && isEditingDraft ? (
                <Stack spacing={2} sx={{ mt: 1 }}>
                  <TextField
                    select
                    label="Customer"
                    value={editCustomerId}
                    onChange={(e) => setEditCustomerId(e.target.value)}
                    fullWidth
                  >
                    {customers.map((customer) => (
                      <MenuItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    label="Agent (Optional)"
                    value={editAgentId}
                    onChange={(e) => {
                      const selectedAgentId = e.target.value;
                      setEditAgentId(selectedAgentId);

                      if (!selectedAgentId) {
                        setEditAgentCommissionPercentage('');
                        return;
                      }

                      const selectedAgent = activeAgents.find(
                        (agent) => agent.id === selectedAgentId,
                      );

                      if (selectedAgent) {
                        setEditAgentCommissionPercentage(
                          String(Number(selectedAgent.defaultCommissionPercentage)),
                        );
                      }
                    }}
                    fullWidth
                  >
                    <MenuItem value="">No Agent</MenuItem>
                    {activeAgents.map((agent) => (
                      <MenuItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    label="Agent Commission %"
                    type="number"
                    value={editAgentCommissionPercentage}
                    onChange={(e) => setEditAgentCommissionPercentage(e.target.value)}
                    slotProps={{
                      htmlInput: {
                        min: 0,
                        max: 100,
                        step: 0.01,
                      },
                    }}
                    fullWidth
                  />

                  <TextField
                    select
                    label="Agent Type"
                    value={editAgentCategory}
                    onChange={(e) => {
                      const selectedCategory = e.target.value as AgentCategory | '';
                      setEditAgentCategory(selectedCategory);

                      if (!selectedCategory) {
                        setEditDiscountPercentage('');
                        return;
                      }

                      const defaultPercentage = defaultDiscountByCategory.get(
                        selectedCategory,
                      );

                      setEditDiscountPercentage(
                        defaultPercentage !== undefined
                          ? String(defaultPercentage)
                          : '',
                      );
                    }}
                    fullWidth
                  >
                    <MenuItem value="">No Category</MenuItem>
                    {agentCategoryOptions.map((category) => (
                      <MenuItem key={category.category} value={category.category}>
                        {category.label} ({category.defaultDiscountPercentage}% default)
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    label="Discount %"
                    type="number"
                    value={editDiscountPercentage}
                    onChange={(e) => setEditDiscountPercentage(e.target.value)}
                    helperText="Auto-filled from agent type. You can override it."
                    slotProps={{
                      htmlInput: {
                        min: 0,
                        max: 100,
                        step: 0.01,
                      },
                    }}
                    fullWidth
                  />

                  <TextField
                    select
                    label="Product"
                    value={editProductId}
                    onChange={(e) => setEditProductId(e.target.value)}
                    fullWidth
                  >
                    {products.map((product) => (
                      <MenuItem key={product.id} value={product.id}>
                        {product.name} - ₹{product.sellingPrice}
                        {(() => {
                          const stock = inventoryStocks.find(
                            (item) => item.productId === product.id,
                          );

                          if (!stock) {
                            return ' (Avail: N/A)';
                          }

                          return ` (Avail: ${Number(stock.onHand) - Number(stock.reserved)})`;
                        })()}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    label="Quantity"
                    type="number"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    fullWidth
                  />

                  <Button
                    variant="outlined"
                    onClick={handleAddEditItem}
                    disabled={!editProductId || Number(editQuantity) <= 0}
                  >
                    Add Item
                  </Button>

                  {editItems.map((item) => (
                    <Stack
                      key={item.productId}
                      direction="row"
                      spacing={2}
                      sx={{ alignItems: 'center' }}
                    >
                      <Typography sx={{ minWidth: 180 }}>{item.productName}</Typography>

                      <TextField
                        label="Qty"
                        type="number"
                        size="small"
                        value={item.quantity}
                        onChange={(e) =>
                          handleEditItemQuantityChange(item.productId, e.target.value)
                        }
                        sx={{ width: 120 }}
                      />

                      <Typography sx={{ minWidth: 120 }}>
                        ₹{item.quantity * item.unitPrice}
                      </Typography>

                      <Button
                        color="error"
                        onClick={() => handleRemoveEditItem(item.productId)}
                      >
                        Remove
                      </Button>
                    </Stack>
                  ))}

                  {editItems.length > 0 && (
                    <Typography align="right">
                      Draft Total: ₹{editTotal.toFixed(2)}
                    </Typography>
                  )}

                  <TextField
                    label="Notes"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    multiline
                    minRows={3}
                    fullWidth
                  />

                  <Stack direction="row" spacing={2}>
                    <Button
                      variant="contained"
                      onClick={handleSaveDraftEdits}
                      disabled={
                        !editCustomerId ||
                        editItems.length === 0 ||
                        updateDraftMutation.isPending
                      }
                    >
                      Save Draft Changes
                    </Button>

                    <Button onClick={() => setIsEditingDraft(false)}>Cancel</Button>
                  </Stack>
                </Stack>
              ) : (
                <>
                  <Typography>Customer: {selectedQuote.customer.name}</Typography>
                  <Typography sx={{ mt: 1, fontWeight: 600 }} color="warning.main">
                    {getExpiryText(selectedQuote)}
                  </Typography>
                  <Typography sx={{ mt: 1 }}>
                    Agent: {selectedQuote.agent?.name ?? 'Not assigned'}
                  </Typography>
                  <Typography sx={{ mt: 1 }}>
                    Commission: {Number(selectedQuote.agentCommissionPercentage ?? 0).toFixed(2)}% (
                    ₹{Number(selectedQuote.agentCommissionAmount ?? 0).toFixed(2)})
                  </Typography>
                  <Typography sx={{ mt: 1 }}>
                    Discount: {Number(
                      selectedQuote.metadata?.quoteDiscount?.discountPercentage ?? 0,
                    ).toFixed(2)}%
                    {selectedQuote.metadata?.quoteDiscount?.agentCategory
                      ? ` (${categoryLabelByValue.get(
                          selectedQuote.metadata.quoteDiscount.agentCategory,
                        ) ?? selectedQuote.metadata.quoteDiscount.agentCategory})`
                      : ''}{' '}
                    (₹{Number(selectedQuote.discountAmount ?? 0).toFixed(2)})
                  </Typography>
                  {selectedQuote.notes && (
                    <Typography sx={{ mt: 1 }}>Notes: {selectedQuote.notes}</Typography>
                  )}
                </>
              )}

              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel>Status</InputLabel>

                <Select
                  label="Status"
                  value={selectedQuote.status}
                  onChange={(e) =>
                    updateStatusMutation.mutate({
                      id: selectedQuote.id,
                      status: e.target.value as QuoteStatus,
                    })
                  }
                >
                  <MenuItem value="DRAFT">Draft</MenuItem>
                  <MenuItem value="SENT">Sent</MenuItem>
                  <MenuItem value="APPROVED">Approved</MenuItem>
                  <MenuItem value="INVOICED">Invoiced</MenuItem>
                  <MenuItem value="DISPATCHED">Dispatched</MenuItem>
                  <MenuItem value="REJECTED">Rejected</MenuItem>
                  <MenuItem value="EXPIRED">Expired</MenuItem>
                  <MenuItem value="CANCELLED">Cancelled</MenuItem>
                </Select>
              </FormControl>

              <Typography sx={{ mt: 2, mb: 1 }}>Items</Typography>

              <Box
                component="table"
                sx={{
                  width: '100%',
                  borderCollapse: 'collapse',
                }}
              >
                <thead>
                  <tr>
                    <th align="left">Product</th>
                    <th align="right">Qty</th>
                    <th align="right">Unit Price</th>
                    <th align="right">Line Total</th>
                  </tr>
                </thead>

                <tbody>
                  {selectedQuote.items?.map((item) => (
                    <tr key={item.id}>
                      <td>{item.productName}</td>
                      <td align="right">{item.quantity}</td>
                      <td align="right">{item.unitPrice}</td>
                      <td align="right">{item.lineTotal}</td>
                    </tr>
                  ))}
                </tbody>
              </Box>

              <Typography sx={{ mt: 2 }} align="right">
                Total: ₹{selectedQuote.totalAmount}
              </Typography>

              <Box sx={{ mt: 2, mb: 1 }}>
                <Button
                  variant="outlined"
                  onMouseEnter={(event) => setActionsAnchorEl(event.currentTarget)}
                >
                  Quick Actions
                </Button>
                <Menu
                  anchorEl={actionsAnchorEl}
                  open={Boolean(actionsAnchorEl)}
                  onClose={() => setActionsAnchorEl(null)}
                  MenuListProps={{
                    onMouseLeave: () => setActionsAnchorEl(null),
                  }}
                >
                  <MenuItem
                    onClick={() => {
                      quotesService.downloadPdf(selectedQuote.id);
                      setActionsAnchorEl(null);
                    }}
                  >
                    Generate PDF
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      handleWhatsAppShare();
                      setActionsAnchorEl(null);
                    }}
                  >
                    WhatsApp Me
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      handleDuplicateQuote();
                      setActionsAnchorEl(null);
                    }}
                  >
                    Create Revision
                  </MenuItem>
                  {selectedQuote.status === 'DRAFT' && (
                    <MenuItem
                      onClick={() => {
                        handleStartDraftEdit();
                        setActionsAnchorEl(null);
                      }}
                    >
                      Edit Draft
                    </MenuItem>
                  )}
                  {selectedQuote.status === 'DRAFT' && (
                    <MenuItem
                      onClick={() => {
                        updateStatusMutation.mutate({
                          id: selectedQuote.id,
                          status: 'SENT',
                        });
                        setActionsAnchorEl(null);
                      }}
                    >
                      Mark as Sent
                    </MenuItem>
                  )}
                  {selectedQuote.status !== 'CANCELLED' &&
                    selectedQuote.status !== 'DISPATCHED' && (
                      <MenuItem
                        onClick={() => {
                          handleCancelQuote();
                          setActionsAnchorEl(null);
                        }}
                      >
                        Cancel Quote
                      </MenuItem>
                    )}
                </Menu>
              </Box>

              <Stack direction="row" spacing={1} sx={{ mt: 2, mb: 2 }}>
                {selectedQuote.status === 'DRAFT' ? (
                  <Button variant="outlined" onClick={handleStartDraftEdit}>
                    Edit Draft Quote
                  </Button>
                ) : (
                  <Button variant="outlined" onClick={handleDuplicateQuote}>
                    Duplicate / Create Revision
                  </Button>
                )}

                {selectedQuote.status === 'APPROVED' && (
                  <Button
                    variant="contained"
                    onClick={() =>
                      updateStatusMutation.mutate({
                        id: selectedQuote.id,
                        status: 'INVOICED',
                      })
                    }
                  >
                    Generate Invoice
                  </Button>
                )}

                {selectedQuote.status === 'INVOICED' && (
                  <Button
                    variant="contained"
                    onClick={() =>
                      updateStatusMutation.mutate({
                        id: selectedQuote.id,
                        status: 'DISPATCHED',
                      })
                    }
                  >
                    Dispatch Goods
                  </Button>
                )}

                {selectedQuote.status !== 'CANCELLED' &&
                  selectedQuote.status !== 'DISPATCHED' && (
                    <Button color="error" variant="outlined" onClick={handleCancelQuote}>
                      Cancel Quote
                    </Button>
                  )}
              </Stack>

              <Button
                variant="contained"
                onClick={() => quotesService.downloadPdf(selectedQuote.id)}
              >
                Download PDF
              </Button>
              <Button variant="outlined" onClick={() => handleWhatsAppShare()}>
                Share on WhatsApp
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}
