import { api } from '@/lib/api';

export type InventoryMovementType =
  | 'IN'
  | 'OUT'
  | 'ADJUST_IN'
  | 'ADJUST_OUT'
  | 'RESERVE'
  | 'RELEASE'
  | 'DISPATCH';

export type InventoryReferenceType =
  | 'MANUAL'
  | 'QUOTE'
  | 'ORDER'
  | 'RETURN';

export type InventoryStock = {
  id: string;
  tenantId: string;
  productId: string;
  onHand: string;
  reserved: string;
  reorderLevel: string;
  active: boolean;
  updatedAt: string;
  product: {
    id: string;
    name: string;
    sku?: string | null;
    unit: string;
    category?: {
      id: string;
      name: string;
    } | null;
  };
};

export type InventoryLedgerEntry = {
  id: string;
  tenantId: string;
  stockId: string;
  productId: string;
  movementType: InventoryMovementType;
  quantity: string;
  referenceType: InventoryReferenceType;
  referenceId?: string | null;
  note?: string | null;
  createdById?: string | null;
  createdAt: string;
};

export type InitializeStockPayload = {
  productId: string;
  openingStock?: number;
  reorderLevel?: number;
  note?: string;
};

export type AdjustInventoryPayload = {
  productId: string;
  movementType: InventoryMovementType;
  quantity: number;
  referenceType?: InventoryReferenceType;
  referenceId?: string;
  note?: string;
};

export const inventoryService = {
  getStocks: async () => {
    const res = await api.get<InventoryStock[]>('/inventory/stocks');
    return res.data;
  },

  getStockByProduct: async (productId: string) => {
    const res = await api.get<InventoryStock>(`/inventory/stocks/product/${productId}`);
    return res.data;
  },

  initializeStock: async (payload: InitializeStockPayload) => {
    const res = await api.post<InventoryStock>('/inventory/stocks/initialize', payload);
    return res.data;
  },

  adjustStock: async (payload: AdjustInventoryPayload) => {
    const res = await api.post<{
      stock: InventoryStock;
      ledgerEntry: InventoryLedgerEntry;
    }>('/inventory/adjustments', payload);
    return res.data;
  },

  getLedger: async (productId?: string) => {
    const res = await api.get<InventoryLedgerEntry[]>('/inventory/ledger', {
      params: productId ? { productId } : undefined,
    });
    return res.data;
  },
};
