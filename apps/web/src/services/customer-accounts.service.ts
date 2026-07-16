import { api } from '@/lib/api';

export type CustomerAccountSummary = {
  customer: {
    id: string;
    name: string;
    phone?: string | null;
  };
  totals: {
    totalInvoiced: number;
    totalReceived: number;
    outstanding: number;
  };
  counts: {
    invoices: number;
    payments: number;
  };
};

export type CustomerLedgerTransaction = {
  date: string;
  type: 'INVOICE' | 'PAYMENT';
  referenceType: 'QUOTE' | 'PAYMENT';
  referenceId: string;
  referenceNumber: string;
  status: string;
  method: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
  note: string | null;
};

export type CustomerLedger = {
  customer: {
    id: string;
    name: string;
    phone?: string | null;
  };
  openingBalance: number;
  closingBalance: number;
  transactions: CustomerLedgerTransaction[];
};

export type CustomerOutstandingRow = {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
};

export type CustomerOutstandingList = {
  totalOutstanding: number;
  customerCountWithOutstanding: number;
  rows: CustomerOutstandingRow[];
};

export const customerAccountsService = {
  getSummary: async (customerId: string) => {
    const res = await api.get<CustomerAccountSummary>(
      `/customer-accounts/${customerId}/summary`,
    );
    return res.data;
  },

  getLedger: async (customerId: string) => {
    const res = await api.get<CustomerLedger>(
      `/customer-accounts/${customerId}/ledger`,
    );
    return res.data;
  },

  getOutstanding: async () => {
    const res = await api.get<CustomerOutstandingList>(
      '/customer-accounts/outstanding/list',
    );
    return res.data;
  },
};
