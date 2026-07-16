import { Injectable } from '@nestjs/common';
import {
  CommissionBasis,
  CommissionStatus,
  PaymentDirection,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  private round2(value: number) {
    return Number(value.toFixed(2));
  }

  async createAccrualForInvoicedQuote(tenantId: string, quoteId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: {
        id: quoteId,
        tenantId,
      },
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        agentId: true,
        subtotal: true,
        taxableAmount: true,
        taxAmount: true,
        discountAmount: true,
        agentCommissionPercentage: true,
      },
    });

    if (!quote || quote.status !== 'INVOICED' || !quote.agentId) {
      return null;
    }

    const existing = await this.prisma.agentCommissionAccrual.findFirst({
      where: {
        tenantId,
        quoteId,
        reversalOfId: null,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return existing;
    }

    const basisAmount = Number(quote.taxableAmount ?? quote.subtotal);
    const rate = Number(quote.agentCommissionPercentage ?? 0);
    const commissionAmount = this.round2((basisAmount * rate) / 100);

    return this.prisma.agentCommissionAccrual.create({
      data: {
        tenantId,
        agentId: quote.agentId,
        quoteId: quote.id,
        basisAmount: new Prisma.Decimal(basisAmount),
        commissionRate: new Prisma.Decimal(rate),
        commissionAmount: new Prisma.Decimal(commissionAmount),
        status: CommissionStatus.PENDING,
        calculationSnapshot: {
          basis: CommissionBasis.NET_SALES,
          grossAmount: Number(quote.subtotal),
          discountAmount: Number(quote.discountAmount),
          eligibleAmount: basisAmount,
          taxAmount: Number(quote.taxAmount),
          rate,
          commission: commissionAmount,
        },
        note: `Quote invoiced: ${quote.quoteNumber}`,
      },
    });
  }

  async markAccrualsEarnedForQuotePayment(tenantId: string, quoteId: string, paymentId?: string) {
    const quote = await this.prisma.quote.findFirst({
      where: {
        id: quoteId,
        tenantId,
      },
      select: {
        id: true,
        totalAmount: true,
      },
    });

    if (!quote) {
      return;
    }

    const paymentSum = await this.prisma.payment.aggregate({
      where: {
        tenantId,
        quoteId,
        direction: PaymentDirection.RECEIVED,
        status: PaymentStatus.COMPLETED,
      },
      _sum: {
        amount: true,
      },
    });

    const paidAmount = Number(paymentSum._sum.amount ?? 0);
    const quoteTotal = Number(quote.totalAmount);

    if (paidAmount < quoteTotal) {
      return;
    }

    await this.prisma.agentCommissionAccrual.updateMany({
      where: {
        tenantId,
        quoteId,
        status: CommissionStatus.PENDING,
      },
      data: {
        status: CommissionStatus.EARNED,
        earnedAt: new Date(),
        ...(paymentId ? { paymentId } : {}),
      },
    });
  }

  async createReversalForCompletedSalesReturn(tenantId: string, productReturnId: string) {
    const productReturn = await this.prisma.productReturn.findFirst({
      where: {
        id: productReturnId,
        tenantId,
        type: 'SALES_RETURN',
        status: 'COMPLETED',
      },
      include: {
        items: true,
      },
    });

    if (!productReturn?.quoteId) {
      return null;
    }

    const sourceAccrual = await this.prisma.agentCommissionAccrual.findFirst({
      where: {
        tenantId,
        quoteId: productReturn.quoteId,
        reversalOfId: null,
      },
      select: {
        id: true,
        agentId: true,
        basisAmount: true,
        commissionRate: true,
      },
    });

    if (!sourceAccrual) {
      return null;
    }

    const existingReversal = await this.prisma.agentCommissionAccrual.findFirst({
      where: {
        tenantId,
        productReturnId,
        reversalOfId: sourceAccrual.id,
      },
      select: {
        id: true,
      },
    });

    if (existingReversal) {
      return existingReversal;
    }

    const returnAmount = this.round2(
      productReturn.items.reduce((sum, item) => sum + Number(item.lineTotal), 0),
    );

    if (returnAmount <= 0) {
      return null;
    }

    const originalBasisAmount = Number(sourceAccrual.basisAmount);
    const reversalBasisAmount = this.round2(
      Math.min(returnAmount, originalBasisAmount) * -1,
    );
    const rate = Number(sourceAccrual.commissionRate ?? 0);
    const reversalCommissionAmount = this.round2((reversalBasisAmount * rate) / 100);

    return this.prisma.agentCommissionAccrual.create({
      data: {
        tenantId,
        agentId: sourceAccrual.agentId,
        quoteId: productReturn.quoteId,
        productReturnId,
        reversalOfId: sourceAccrual.id,
        basisAmount: new Prisma.Decimal(reversalBasisAmount),
        commissionRate: new Prisma.Decimal(rate),
        commissionAmount: new Prisma.Decimal(reversalCommissionAmount),
        status: CommissionStatus.REVERSED,
        calculationSnapshot: {
          basis: CommissionBasis.NET_SALES,
          returnAmount,
          reversalBasisAmount,
          rate,
          reversalCommission: reversalCommissionAmount,
        },
        note: `Commission reversal for sales return ${productReturn.returnNumber}`,
      },
    });
  }
}
