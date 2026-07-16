import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentDirection, PaymentStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CommissionsService } from '../commissions/commissions.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commissionsService: CommissionsService,
  ) {}

  async create(tenantId: string, userId: string, dto: CreatePaymentDto) {
    let linkedQuoteId = dto.quoteId;
    let linkedPurchaseOrderId = dto.purchaseOrderId;
    let linkedCustomerId = dto.customerId;

    if (dto.quoteId && dto.purchaseOrderId) {
      throw new BadRequestException(
        'Payment can be linked to either quoteId or purchaseOrderId, not both',
      );
    }

    if (!dto.quoteId && !dto.purchaseOrderId) {
      throw new BadRequestException('Either quoteId or purchaseOrderId is required');
    }

    let quoteTotalAmount: number | null = null;
    let linkedQuoteCustomerId: string | null = null;
    let quoteStatus: string | null = null;
    let purchaseOrderTotalAmount: number | null = null;

    if (dto.quoteId) {
      const quote = await this.prisma.quote.findFirst({
        where: {
          id: dto.quoteId,
          tenantId,
        },
        select: {
          id: true,
          customerId: true,
          totalAmount: true,
          status: true,
        },
      });

      if (!quote) {
        throw new BadRequestException('Quote not found');
      }

      linkedQuoteId = quote.id;
      linkedQuoteCustomerId = quote.customerId;
      linkedCustomerId = linkedCustomerId ?? quote.customerId;
      quoteStatus = quote.status;
      quoteTotalAmount = Number(quote.totalAmount);
    }

    if (dto.purchaseOrderId) {
      const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
        where: {
          id: dto.purchaseOrderId,
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

      linkedPurchaseOrderId = purchaseOrder.id;
      purchaseOrderTotalAmount = Number(purchaseOrder.totalAmount);
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

    const direction =
      dto.direction ??
      (linkedQuoteId ? PaymentDirection.RECEIVED : PaymentDirection.PAID);

    if (direction === PaymentDirection.RECEIVED && !linkedQuoteId) {
      throw new BadRequestException(
        'Received customer payments must be linked to a quote',
      );
    }

    if (linkedQuoteId && direction !== PaymentDirection.RECEIVED) {
      throw new BadRequestException('Quote payments must use RECEIVED direction');
    }

    if (linkedPurchaseOrderId && direction !== PaymentDirection.PAID) {
      throw new BadRequestException('Purchase order payments must use PAID direction');
    }

    if (linkedQuoteId && direction === PaymentDirection.RECEIVED) {
      if (quoteStatus !== 'INVOICED' && quoteStatus !== 'DISPATCHED') {
        throw new BadRequestException(
          'Quote must be INVOICED before recording a customer payment',
        );
      }
    }

    if (linkedQuoteCustomerId && linkedCustomerId && linkedCustomerId !== linkedQuoteCustomerId) {
      throw new BadRequestException('Payment customer must match quote customer');
    }

    if (linkedQuoteCustomerId) {
      linkedCustomerId = linkedQuoteCustomerId;
    }

    const amount = Number(dto.amount);

    if (linkedQuoteId && quoteTotalAmount !== null) {
      const aggregate = await this.prisma.payment.aggregate({
        where: {
          tenantId,
          quoteId: linkedQuoteId,
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
    }

    if (linkedPurchaseOrderId && purchaseOrderTotalAmount !== null) {
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
    }

    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        quoteId: linkedQuoteId,
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

    if (
      linkedQuoteId &&
      payment.status === PaymentStatus.COMPLETED &&
      payment.direction === PaymentDirection.RECEIVED
    ) {
      await this.commissionsService.markAccrualsEarnedForQuotePayment(
        tenantId,
        linkedQuoteId,
        payment.id,
      );
    }

    return payment;
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
