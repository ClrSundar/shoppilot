import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentDirection,
  PaymentStatus,
  Prisma,
  QuoteStatus,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CommissionsService } from '../commissions/commissions.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';

const PAYABLE_QUOTE_STATUSES = [
  QuoteStatus.INVOICED,
  QuoteStatus.DISPATCHED,
] as const;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commissionsService: CommissionsService,
  ) {}

  async create(tenantId: string, userId: string, dto: CreatePaymentDto) {
    if (dto.quoteId && dto.purchaseOrderId) {
      throw new BadRequestException(
        'Payment can be linked to either quoteId or purchaseOrderId, not both',
      );
    }

    if (!dto.quoteId && !dto.purchaseOrderId) {
      throw new BadRequestException('Either quoteId or purchaseOrderId is required');
    }

    if (dto.quoteId) {
      return this.processQuotePayment(tenantId, userId, dto);
    }

    return this.processPurchaseOrderPayment(tenantId, userId, dto);
  }

  private async processQuotePayment(
    tenantId: string,
    userId: string,
    dto: CreatePaymentDto,
  ) {
    const quoteId = dto.quoteId;

    if (!quoteId) {
      throw new BadRequestException('Quote not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // ARCHITECTURAL INVARIANT
      // Every quote-linked RECEIVED payment MUST be created through
      // processQuotePayment(). No other service, migration, seed,
      // background worker, or administrative endpoint may insert
      // quote-linked RECEIVED payments directly. Violating this
      // invariant bypasses the coordination lock and reintroduces
      // the race condition fixed by DEF-005.
      const lockedQuotes = await tx.$queryRaw<
        Array<{
          id: string;
          customerId: string;
          totalAmount: Prisma.Decimal;
          status: QuoteStatus;
        }>
      >`SELECT "id", "customerId", "totalAmount", "status"
        FROM "Quote"
        WHERE "id" = ${quoteId} AND "tenantId" = ${tenantId}
        FOR UPDATE`;

      const quote = lockedQuotes[0];

      if (!quote) {
        throw new BadRequestException('Quote not found');
      }

      const direction = dto.direction ?? PaymentDirection.RECEIVED;

      if (direction !== PaymentDirection.RECEIVED) {
        throw new BadRequestException('Quote payments must use RECEIVED direction');
      }

      if (!PAYABLE_QUOTE_STATUSES.includes(quote.status)) {
        throw new BadRequestException(
          'Quote must be INVOICED or DISPATCHED before recording a customer payment',
        );
      }

      if (dto.customerId && dto.customerId !== quote.customerId) {
        throw new BadRequestException('Payment customer must match quote customer');
      }

      const linkedCustomerId = dto.customerId ?? quote.customerId;

      const customer = await tx.customer.findFirst({
        where: {
          id: linkedCustomerId,
          tenantId,
        },
        select: {
          id: true,
        },
      });

      if (!customer) {
        throw new BadRequestException('Customer not found');
      }

      const amount = Number(dto.amount);
      const quoteTotalAmount = Number(quote.totalAmount);

      const aggregate = await tx.payment.aggregate({
        where: {
          tenantId,
          quoteId,
          direction: PaymentDirection.RECEIVED,
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.COMPLETED],
          },
        },
        _sum: {
          amount: true,
        },
      });

      const existingAmount = Number(aggregate._sum.amount ?? 0);
      const nextAmount = existingAmount + amount;

      if (nextAmount > quoteTotalAmount) {
        throw new BadRequestException(
          `Payment exceeds quote balance. Current tracked amount ${existingAmount.toFixed(2)}, quote total ${quoteTotalAmount.toFixed(2)}`,
        );
      }

      const payment = await tx.payment.create({
        data: {
          tenantId,
          quoteId,
          purchaseOrderId: null,
          customerId: linkedCustomerId,
          amount: new Prisma.Decimal(amount),
          direction,
          method: dto.method,
          status: dto.status,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
          referenceNumber: dto.referenceNumber,
          note: dto.note,
          createdById: userId,
        },
        include: {
          quote: {
            select: {
              id: true,
              quoteNumber: true,
            },
          },
          purchaseOrder: {
            select: {
              id: true,
              orderNumber: true,
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (payment.status === PaymentStatus.COMPLETED) {
        await this.commissionsService.markAccrualsEarnedWithinTransaction(
          tenantId,
          quoteId,
          tx,
          payment.id,
        );
      }

      return payment;
    });
  }

  private async processPurchaseOrderPayment(
    tenantId: string,
    userId: string,
    dto: CreatePaymentDto,
  ) {
    const linkedPurchaseOrderId = dto.purchaseOrderId;
    const linkedCustomerId = dto.customerId;

    if (!linkedPurchaseOrderId) {
      throw new BadRequestException('Purchase order not found');
    }

    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: {
        id: linkedPurchaseOrderId,
        tenantId,
      },
      select: {
        id: true,
        totalAmount: true,
      },
    });

    if (!purchaseOrder) {
      throw new BadRequestException('Purchase order not found');
    }

    const direction = dto.direction ?? PaymentDirection.PAID;

    if (direction === PaymentDirection.RECEIVED) {
      throw new BadRequestException(
        'Received customer payments must be linked to a quote',
      );
    }

    if (direction !== PaymentDirection.PAID) {
      throw new BadRequestException('Purchase order payments must use PAID direction');
    }

    if (linkedCustomerId) {
      const customer = await this.prisma.customer.findFirst({
        where: {
          id: linkedCustomerId,
          tenantId,
        },
        select: {
          id: true,
        },
      });

      if (!customer) {
        throw new BadRequestException('Customer not found');
      }
    }

    const amount = Number(dto.amount);
    const purchaseOrderTotalAmount = Number(purchaseOrder.totalAmount);

    const aggregate = await this.prisma.payment.aggregate({
      where: {
        tenantId,
        purchaseOrderId: linkedPurchaseOrderId,
        direction: PaymentDirection.PAID,
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.COMPLETED],
        },
      },
      _sum: {
        amount: true,
      },
    });

    const existingAmount = Number(aggregate._sum.amount ?? 0);
    const nextAmount = existingAmount + amount;

    if (nextAmount > purchaseOrderTotalAmount) {
      throw new BadRequestException(
        `Payment exceeds purchase order balance. Current tracked amount ${existingAmount.toFixed(2)}, PO total ${purchaseOrderTotalAmount.toFixed(2)}`,
      );
    }

    return this.prisma.payment.create({
      data: {
        tenantId,
        quoteId: null,
        purchaseOrderId: linkedPurchaseOrderId,
        customerId: linkedCustomerId,
        amount: new Prisma.Decimal(amount),
        direction,
        method: dto.method,
        status: dto.status,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
        referenceNumber: dto.referenceNumber,
        note: dto.note,
        createdById: userId,
      },
      include: {
        quote: {
          select: {
            id: true,
            quoteNumber: true,
          },
        },
        purchaseOrder: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findAll(tenantId: string, query: ListPaymentsDto) {
    const where: Prisma.PaymentWhereInput = {
      tenantId,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.quoteId ? { quoteId: query.quoteId } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.fromDate || query.toDate
        ? {
            paymentDate: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    return this.prisma.payment.findMany({
      where,
      include: {
        quote: {
          select: {
            id: true,
            quoteNumber: true,
          },
        },
        purchaseOrder: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        paymentDate: 'desc',
      },
      ...(query.limit ? { take: query.limit } : {}),
    });
  }

  async findOne(tenantId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        tenantId,
        id,
      },
      include: {
        quote: {
          select: {
            id: true,
            quoteNumber: true,
          },
        },
        purchaseOrder: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }
}
