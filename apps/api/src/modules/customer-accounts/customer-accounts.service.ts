import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentDirection, PaymentStatus, QuoteStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

type LedgerRow = {
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

@Injectable()
export class CustomerAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private round2(value: number) {
    return Number(value.toFixed(2));
  }

  private async ensureCustomer(tenantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        tenantId,
        id: customerId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async getCustomerAccountSummary(tenantId: string, customerId: string) {
    const customer = await this.ensureCustomer(tenantId, customerId);

    const [invoiceAggregate, paymentAggregate, invoiceCount, paymentCount] =
      await Promise.all([
        this.prisma.quote.aggregate({
          where: {
            tenantId,
            customerId,
            status: {
              in: [QuoteStatus.INVOICED, QuoteStatus.DISPATCHED],
            },
          },
          _sum: {
            totalAmount: true,
          },
        }),
        this.prisma.payment.aggregate({
          where: {
            tenantId,
            customerId,
            direction: PaymentDirection.RECEIVED,
            status: PaymentStatus.COMPLETED,
          },
          _sum: {
            amount: true,
          },
        }),
        this.prisma.quote.count({
          where: {
            tenantId,
            customerId,
            status: {
              in: [QuoteStatus.INVOICED, QuoteStatus.DISPATCHED],
            },
          },
        }),
        this.prisma.payment.count({
          where: {
            tenantId,
            customerId,
            direction: PaymentDirection.RECEIVED,
            status: PaymentStatus.COMPLETED,
          },
        }),
      ]);

    const totalInvoiced = Number(invoiceAggregate._sum.totalAmount ?? 0);
    const totalReceived = Number(paymentAggregate._sum.amount ?? 0);
    const outstanding = this.round2(totalInvoiced - totalReceived);

    return {
      customer,
      totals: {
        totalInvoiced: this.round2(totalInvoiced),
        totalReceived: this.round2(totalReceived),
        outstanding,
      },
      counts: {
        invoices: invoiceCount,
        payments: paymentCount,
      },
    };
  }

  async getCustomerLedger(tenantId: string, customerId: string) {
    const customer = await this.ensureCustomer(tenantId, customerId);

    const [quotes, payments] = await Promise.all([
      this.prisma.quote.findMany({
        where: {
          tenantId,
          customerId,
          status: {
            in: [QuoteStatus.INVOICED, QuoteStatus.DISPATCHED],
          },
        },
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          totalAmount: true,
          invoicedAt: true,
          updatedAt: true,
          notes: true,
        },
      }),
      this.prisma.payment.findMany({
        where: {
          tenantId,
          customerId,
          direction: PaymentDirection.RECEIVED,
          status: PaymentStatus.COMPLETED,
        },
        select: {
          id: true,
          paymentDate: true,
          amount: true,
          method: true,
          status: true,
          referenceNumber: true,
          note: true,
        },
      }),
    ]);

    const rows: LedgerRow[] = [];

    for (const quote of quotes) {
      const invoiceDate = quote.invoicedAt ?? quote.updatedAt;

      rows.push({
        date: invoiceDate.toISOString(),
        type: 'INVOICE',
        referenceType: 'QUOTE',
        referenceId: quote.id,
        referenceNumber: quote.quoteNumber,
        status: quote.status,
        method: null,
        debit: this.round2(Number(quote.totalAmount)),
        credit: 0,
        runningBalance: 0,
        note: quote.notes ?? null,
      });
    }

    for (const payment of payments) {
      rows.push({
        date: payment.paymentDate.toISOString(),
        type: 'PAYMENT',
        referenceType: 'PAYMENT',
        referenceId: payment.id,
        referenceNumber: payment.referenceNumber ?? payment.id,
        status: payment.status,
        method: payment.method,
        debit: 0,
        credit: this.round2(Number(payment.amount)),
        runningBalance: 0,
        note: payment.note ?? null,
      });
    }

    rows.sort((a, b) => {
      if (a.date === b.date) {
        if (a.type === b.type) {
          return a.referenceNumber.localeCompare(b.referenceNumber);
        }

        return a.type === 'INVOICE' ? -1 : 1;
      }

      return a.date.localeCompare(b.date);
    });

    let runningBalance = 0;

    for (const row of rows) {
      runningBalance += row.debit;
      runningBalance -= row.credit;
      row.runningBalance = this.round2(runningBalance);
    }

    return {
      customer,
      openingBalance: 0,
      closingBalance: this.round2(runningBalance),
      transactions: rows,
    };
  }

  async getOutstandingCustomers(tenantId: string) {
    const [quotes, payments] = await Promise.all([
      this.prisma.quote.groupBy({
        by: ['customerId'],
        where: {
          tenantId,
          status: {
            in: [QuoteStatus.INVOICED, QuoteStatus.DISPATCHED],
          },
        },
        _sum: {
          totalAmount: true,
        },
      }),
      this.prisma.payment.groupBy({
        by: ['customerId'],
        where: {
          tenantId,
          customerId: {
            not: null,
          },
          direction: PaymentDirection.RECEIVED,
          status: PaymentStatus.COMPLETED,
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    const invoiceByCustomer = new Map<string, number>();
    const paidByCustomer = new Map<string, number>();

    for (const row of quotes) {
      invoiceByCustomer.set(row.customerId, Number(row._sum.totalAmount ?? 0));
    }

    for (const row of payments) {
      if (!row.customerId) {
        continue;
      }

      paidByCustomer.set(row.customerId, Number(row._sum.amount ?? 0));
    }

    const customerIds = Array.from(invoiceByCustomer.keys());

    const customers = await this.prisma.customer.findMany({
      where: {
        tenantId,
        id: {
          in: customerIds,
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    const customerById = new Map(customers.map((c) => [c.id, c]));

    const rows = customerIds
      .map((customerId) => {
        const totalInvoiced = invoiceByCustomer.get(customerId) ?? 0;
        const totalPaid = paidByCustomer.get(customerId) ?? 0;
        const outstanding = this.round2(totalInvoiced - totalPaid);

        if (outstanding <= 0) {
          return null;
        }

        const customer = customerById.get(customerId);

        return {
          customerId,
          customerName: customer?.name ?? 'Unknown Customer',
          customerPhone: customer?.phone ?? null,
          totalInvoiced: this.round2(totalInvoiced),
          totalPaid: this.round2(totalPaid),
          outstanding,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.outstanding - a.outstanding);

    return {
      totalOutstanding: this.round2(rows.reduce((sum, row) => sum + row.outstanding, 0)),
      customerCountWithOutstanding: rows.length,
      rows,
    };
  }
}
