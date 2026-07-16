import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentDirection, PaymentStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CommissionsService } from '../commissions/commissions.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

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
        },
      });

      if (!quote) {
        throw new BadRequestException('Quote not found');
      }

      linkedQuoteId = quote.id;
      linkedCustomerId = linkedCustomerId ?? quote.customerId;
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

    if (linkedQuoteId && direction !== PaymentDirection.RECEIVED) {
      throw new BadRequestException('Quote payments must use RECEIVED direction');
    }

    if (linkedPurchaseOrderId && direction !== PaymentDirection.PAID) {
      throw new BadRequestException('Purchase order payments must use PAID direction');
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

  async findAll(tenantId: string) {
    return this.prisma.payment.findMany({
      where: {
        tenantId,
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
      orderBy: {
        paymentDate: 'desc',
      },
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
