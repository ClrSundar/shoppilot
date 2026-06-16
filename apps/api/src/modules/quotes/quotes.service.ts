import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { CreateQuoteDto } from './dto/create-quote.dto';
import { QuoteStatus } from '@prisma/client';

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateQuoteNumber(tenantId: string) {
    const count = await this.prisma.quote.count({
      where: { tenantId },
    });

    return `QT-${String(count + 1).padStart(5, '0')}`;
  }

  async create(tenantId: string, dto: CreateQuoteDto) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: dto.customerId,
        tenantId,
      },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    const quoteNumber = await this.generateQuoteNumber(tenantId);

    let subtotal = 0;

    const quoteItems: any[] = [];

    for (const item of dto.items) {
      const product = await this.prisma.product.findFirst({
        where: {
          id: item.productId,
          tenantId,
        },
      });

      if (!product) {
        throw new BadRequestException(`Product not found: ${item.productId}`);
      }

      const unitPrice = Number(product.sellingPrice);

      const lineTotal = unitPrice * item.quantity;

      subtotal += lineTotal;

      quoteItems.push({
        productId: product.id,
        productName: product.name,

        quantity: item.quantity,

        unitPrice,

        lineTotal,
      });
    }

    const taxAmount = 0;

    const totalAmount = subtotal + taxAmount;

    return this.prisma.quote.create({
      data: {
        tenantId,

        customerId: dto.customerId,

        quoteNumber,

        subtotal,
        taxAmount,
        totalAmount,

        notes: dto.notes,

        items: {
          create: quoteItems,
        },
      },
      include: {
        customer: true,
        items: true,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.quote.findMany({
      where: {
        tenantId,
      },
      include: {
        customer: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(tenantId: string, quoteId: string) {
    return this.prisma.quote.findFirst({
      where: {
        id: quoteId,
        tenantId,
      },
      include: {
        customer: true,
        items: true,
      },
    });
  }

  async updateStatus(tenantId: string, quoteId: string, status: QuoteStatus) {
    const quote = await this.prisma.quote.findFirst({
      where: {
        id: quoteId,
        tenantId,
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    return this.prisma.quote.update({
      where: {
        id: quoteId,
      },
      data: {
        status,
      },
      include: {
        customer: true,
        items: true,
      },
    });
  }

  async getQuotePdfData(tenantId: string, quoteId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: {
        id: quoteId,
        tenantId,
      },
      include: {
        tenant: true,
        customer: true,
        items: true,
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    return quote;
  }
}
