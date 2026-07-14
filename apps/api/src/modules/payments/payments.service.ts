import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentDirection, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, userId: string, dto: CreatePaymentDto) {
    let linkedQuoteId = dto.quoteId;
    let linkedPurchaseOrderId = dto.purchaseOrderId;
    let linkedCustomerId = dto.customerId;

    if (!dto.quoteId && !dto.purchaseOrderId) {
      throw new BadRequestException('Either quoteId or purchaseOrderId is required');
    }

    if (dto.quoteId) {
      const quote = await this.prisma.quote.findFirst({
        where: {
          id: dto.quoteId,
          tenantId,
        },
        select: {
          id: true,
          customerId: true,
        },
      });

      if (!quote) {
        throw new BadRequestException('Quote not found');
      }

      linkedQuoteId = quote.id;
      linkedCustomerId = linkedCustomerId ?? quote.customerId;
    }

    if (dto.purchaseOrderId) {
      const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
        where: {
          id: dto.purchaseOrderId,
          tenantId,
        },
        select: {
          id: true,
        },
      });

      if (!purchaseOrder) {
        throw new BadRequestException('Purchase order not found');
      }

      linkedPurchaseOrderId = purchaseOrder.id;
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

    return this.prisma.payment.create({
      data: {
        tenantId,
        quoteId: linkedQuoteId,
        purchaseOrderId: linkedPurchaseOrderId,
        customerId: linkedCustomerId,
        amount: new Prisma.Decimal(dto.amount),
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
