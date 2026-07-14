'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { DataGrid, GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppToast } from '@/components/common/AppToast';
import { useAppToast } from '@/hooks/use-app-toast';
import { productsService } from '@/services/products.service';
import { customersService } from '@/services/customers.service';
import { inventoryService } from '@/services/inventory.service';
import { agentsService } from '@/services/agents.service';
import { quotesService, type AgentCategory } from '@/services/quotes.service';
import {
  tenantSettingsService,
  type AgentDiscountConfigItem,
} from '@/services/tenant-settings.service';

type QuoteDraftItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  landingPrice: number | null;
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

export default function QuoteBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast, showToast, closeToast } = useAppToast();

  const fromQuoteId = searchParams.get('fromQuoteId');
  const defaultExpiryDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toLocaleDateString();
  }, []);

  const [customerId, setCustomerId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [agentCommissionPercentage, setAgentCommissionPercentage] = useState('');
  const [agentCategory, setAgentCategory] = useState<AgentCategory | ''>('');
  const [discountPercentage, setDiscountPercentage] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<QuoteDraftItem[]>([]);

  const [lookupOpen, setLookupOpen] = useState(false);
  const [selectionModel, setSelectionModel] = useState<GridRowSelectionModel>({
    type: 'include',
    ids: new Set(),
  });
  const [prefillApplied, setPrefillApplied] = useState(false);

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

  const { data: sourceQuote } = useQuery({
    queryKey: ['quote', fromQuoteId],
    queryFn: () => quotesService.getById(fromQuoteId as string),
    enabled: Boolean(fromQuoteId),
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

  const activeAgents = agents.filter((agent) => agent.active);

  useEffect(() => {
    if (!sourceQuote || prefillApplied) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomerId(sourceQuote.customer.id);
    setAgentId(sourceQuote.agentId ?? '');
    setAgentCommissionPercentage(
      sourceQuote.agentCommissionPercentage
        ? String(Number(sourceQuote.agentCommissionPercentage))
        : '',
    );
    setAgentCategory(
      (sourceQuote.metadata?.quoteDiscount?.agentCategory as AgentCategory | null) ??
        '',
    );
    setDiscountPercentage(
      sourceQuote.metadata?.quoteDiscount?.discountPercentage !== undefined
        ? String(sourceQuote.metadata.quoteDiscount.discountPercentage)
        : '',
    );
    setNotes(sourceQuote.notes ?? '');
    setItems(
      (sourceQuote.items ?? []).map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        landingPrice: null,
      })),
    );
    setPrefillApplied(true);
  }, [sourceQuote, prefillApplied]);

  const createMutation = useMutation({
    mutationFn: quotesService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      showToast('Quote created successfully', 'success');
      router.push('/quotes');
    },
    onError: (error: unknown) => {
      const message: string =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { message?: string } } }).response
          ?.data?.message === 'string'
          ? (error as { response?: { data?: { message?: string } } }).response?.data
              ?.message ?? 'Failed to create quote'
          : 'Failed to create quote';
      showToast(message, 'error');
    },
  });

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

  const handleAddSelectedProducts = () => {
    if (selectionModel.ids.size === 0) {
      setLookupOpen(false);
      return;
    }

    setItems((previousItems) => {
      const nextItems = [...previousItems];

      for (const selectedId of selectionModel.ids) {
        const selectedProduct = products.find((product) => product.id === String(selectedId));

        if (!selectedProduct) {
          continue;
        }

        const existing = nextItems.find((item) => item.productId === selectedProduct.id);

        if (existing) {
          continue;
        }

        nextItems.push({
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          quantity: 1,
          unitPrice: Number(selectedProduct.sellingPrice),
          landingPrice: selectedProduct.landingPrice ? Number(selectedProduct.landingPrice) : null,
        });
      }

      return nextItems;
    });

    setSelectionModel({
      type: 'include',
      ids: new Set(),
    });
    setLookupOpen(false);
  };

  const handleUnitPriceChange = (productId: string, value: string) => {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }

    const item = items.find((i) => i.productId === productId);

    if (item && item.landingPrice !== null && parsed < item.landingPrice) {
      showToast(
        `Unit price cannot be below the landing price of ₹${item.landingPrice.toFixed(2)}`,
        'error',
      );
      return;
    }

    setItems((previousItems) =>
      previousItems.map((i) =>
        i.productId === productId ? { ...i, unitPrice: parsed } : i,
      ),
    );
  };

  const handleQuantityChange = (productId: string, value: string) => {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    const stock = inventoryStocks.find((item) => item.productId === productId);

    if (stock) {
      const available = Number(stock.onHand) - Number(stock.reserved);
      if (parsed > available) {
        showToast('Quantity exceeds available stock', 'error');
        return;
      }
    }

    setItems((previousItems) =>
      previousItems.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity: parsed,
            }
          : item,
      ),
    );
  };

  const handleRemoveItem = (productId: string) => {
    setItems((previousItems) =>
      previousItems.filter((item) => item.productId !== productId),
    );
  };

  const draftSubtotal = items.reduce(
    (total, item) => total + item.quantity * item.unitPrice,
    0,
  );

  const parsedDiscount = parsePercentage(discountPercentage) ?? 0;
  const draftDiscountAmount = Number(
    ((draftSubtotal * parsedDiscount) / 100).toFixed(2),
  );
  const draftTotal = Number((draftSubtotal - draftDiscountAmount).toFixed(2));

  const productLookupRows = useMemo(
    () =>
      products.map((product) => {
        const stock = inventoryStocks.find((item) => item.productId === product.id);

        return {
          id: product.id,
          name: product.name,
          sku: product.sku || '-',
          landingPrice: product.landingPrice ? Number(product.landingPrice) : null,
          sellingPrice: Number(product.sellingPrice),
          available:
            stock ? Number(stock.onHand) - Number(stock.reserved) : Number.POSITIVE_INFINITY,
        };
      }),
    [products, inventoryStocks],
  );

  const itemColumns: GridColDef<QuoteDraftItem>[] = [
    { field: 'productName', headerName: 'Product', flex: 1.3 },
    {
      field: 'landingPrice',
      headerName: 'Landing Price',
      width: 140,
      valueGetter: (_value, row) =>
        row.landingPrice !== null ? `₹${row.landingPrice.toFixed(2)}` : '-',
    },
    {
      field: 'unitPrice',
      headerName: 'Unit Price',
      width: 160,
      renderCell: ({ row }) => (
        <TextField
          type="number"
          size="small"
          value={row.unitPrice}
          onChange={(e) => handleUnitPriceChange(row.productId, e.target.value)}
          slotProps={{
            htmlInput: {
              min: row.landingPrice ?? 0,
              step: 0.01,
            },
          }}
          error={row.landingPrice !== null && row.unitPrice < row.landingPrice}
          helperText={
            row.landingPrice !== null && row.unitPrice < row.landingPrice
              ? `Min ₹${row.landingPrice.toFixed(2)}`
              : undefined
          }
          sx={{ width: 120 }}
        />
      ),
    },
    {
      field: 'quantity',
      headerName: 'Qty',
      width: 120,
      renderCell: ({ row }) => (
        <TextField
          type="number"
          size="small"
          value={row.quantity}
          onChange={(e) => handleQuantityChange(row.productId, e.target.value)}
          slotProps={{
            htmlInput: {
              min: 1,
              step: 1,
            },
          }}
          sx={{ width: 90 }}
        />
      ),
    },
    {
      field: 'lineTotal',
      headerName: 'Line Total',
      width: 150,
      valueGetter: (_value, row) => (row.quantity * row.unitPrice).toFixed(2),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      renderCell: ({ row }) => (
        <Button color="error" size="small" onClick={() => handleRemoveItem(row.productId)}>
          Remove
        </Button>
      ),
    },
  ];

  const lookupColumns: GridColDef<(typeof productLookupRows)[number]>[] = [
    { field: 'name', headerName: 'Product', flex: 1.2 },
    { field: 'sku', headerName: 'SKU', width: 130 },
    {
      field: 'landingPrice',
      headerName: 'Landing Price',
      width: 140,
      valueGetter: (_value, row) =>
        row.landingPrice !== null ? row.landingPrice.toFixed(2) : '-',
    },
    {
      field: 'sellingPrice',
      headerName: 'Selling Price',
      width: 120,
      valueGetter: (_value, row) => row.sellingPrice.toFixed(2),
    },
    {
      field: 'available',
      headerName: 'Available',
      width: 130,
      valueGetter: (_value, row) =>
        Number.isFinite(row.available) ? row.available : 'N/A',
    },
  ];

  const createQuote = (revisionMode: boolean) => {
    if (!customerId) {
      showToast('Customer is required', 'error');
      return;
    }

    if (items.length === 0) {
      showToast('Add at least one product', 'error');
      return;
    }

    const parsedCommission = parsePercentage(agentCommissionPercentage);
    const parsedDraftDiscount = parsePercentage(discountPercentage);

    if (parsedCommission === null) {
      showToast('Agent commission must be between 0 and 100', 'error');
      return;
    }

    if (parsedDraftDiscount === null) {
      showToast('Discount percentage must be between 0 and 100', 'error');
      return;
    }

    if (!agentId && parsedCommission !== undefined) {
      showToast('Select an agent before setting commission percentage', 'error');
      return;
    }

    const revisionLabel = sourceQuote
      ? `Revision of ${sourceQuote.quoteNumber}`
      : 'Manual revision draft';

    const mergedNotes = revisionMode
      ? `${notes ? `${notes}\n\n` : ''}[${revisionLabel}]`
      : notes;

    createMutation.mutate({
      customerId,
      agentId: agentId || undefined,
      agentCommissionPercentage: parsedCommission,
      agentCategory: agentCategory || undefined,
      discountPercentage: parsedDraftDiscount,
      notes: mergedNotes || undefined,
      metadata: revisionMode
        ? {
            revisionOfQuoteId: sourceQuote?.id ?? null,
            revisionOfQuoteNumber: sourceQuote?.quoteNumber ?? null,
          }
        : undefined,
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });
  };

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Box>
          <Typography variant="h5">Quote Builder</Typography>
          <Typography variant="body2" color="text.secondary">
            Fill quote header once, lookup products in bulk, and finalize below.
          </Typography>
          <Typography variant="body2" color="warning.main">
            New quotes expire in 7 days (on {defaultExpiryDate}).
          </Typography>
        </Box>

        <Button variant="text" onClick={() => router.push('/quotes')}>
          Back to Quotes
        </Button>
      </Stack>

      <Stack spacing={2} sx={{ mb: 3 }}>
        <TextField
          select
          label="Customer"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
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
          value={agentId}
          onChange={(e) => {
            const selectedAgentId = e.target.value;
            setAgentId(selectedAgentId);

            if (!selectedAgentId) {
              setAgentCommissionPercentage('');
              return;
            }

            const selectedAgent = activeAgents.find((agent) => agent.id === selectedAgentId);

            if (selectedAgent) {
              setAgentCommissionPercentage(
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

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="Agent Commission %"
            type="number"
            value={agentCommissionPercentage}
            onChange={(e) => setAgentCommissionPercentage(e.target.value)}
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
            value={agentCategory}
            onChange={(e) => {
              const selectedCategory = e.target.value as AgentCategory | '';
              setAgentCategory(selectedCategory);

              if (!selectedCategory) {
                setDiscountPercentage('');
                return;
              }

              const defaultPercentage = defaultDiscountByCategory.get(selectedCategory);

              setDiscountPercentage(
                defaultPercentage !== undefined ? String(defaultPercentage) : '',
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
            value={discountPercentage}
            onChange={(e) => setDiscountPercentage(e.target.value)}
            slotProps={{
              htmlInput: {
                min: 0,
                max: 100,
                step: 0.01,
              },
            }}
            helperText="Auto-filled from agent type. You can override."
            fullWidth
          />
        </Stack>

        <TextField
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          fullWidth
          multiline
          minRows={3}
        />
      </Stack>

      <Stack direction="row" sx={{ mb: 1, justifyContent: 'space-between' }}>
        <Typography variant="h6">Quote Items</Typography>
        <Button variant="outlined" onClick={() => setLookupOpen(true)}>
          Add Products
        </Button>
      </Stack>

      <Box sx={{ height: 360, mb: 2 }}>
        <DataGrid
          rows={items}
          columns={itemColumns}
          getRowId={(row) => row.productId}
          disableRowSelectionOnClick
          hideFooter
        />
      </Box>

      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Typography variant="body2">Subtotal: {draftSubtotal.toFixed(2)}</Typography>
        <Typography variant="body2">Discount: {draftDiscountAmount.toFixed(2)}</Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Total: {draftTotal.toFixed(2)}
        </Typography>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <Button
          variant="contained"
          onClick={() => createQuote(false)}
          disabled={createMutation.isPending}
        >
          Create Quote
        </Button>
        <Button
          variant="outlined"
          onClick={() => createQuote(true)}
          disabled={createMutation.isPending}
        >
          Create Revision
        </Button>
        <Button
          variant="text"
          onClick={() => {
            setCustomerId('');
            setAgentId('');
            setAgentCommissionPercentage('');
            setAgentCategory('');
            setDiscountPercentage('');
            setNotes('');
            setItems([]);
            setPrefillApplied(false);
          }}
          disabled={createMutation.isPending}
        >
          Reset Draft
        </Button>
      </Stack>

      <Dialog open={lookupOpen} onClose={() => setLookupOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Select Products</DialogTitle>
        <DialogContent>
          <Box sx={{ height: 420, mt: 1 }}>
            <DataGrid
              rows={productLookupRows}
              columns={lookupColumns}
              checkboxSelection
              disableRowSelectionOnClick
              rowSelectionModel={selectionModel}
              onRowSelectionModelChange={(newValue) => setSelectionModel(newValue)}
              getRowId={(row) => row.id}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLookupOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddSelectedProducts}>
            Add Selected
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}
