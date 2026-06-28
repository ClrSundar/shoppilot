import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import {
  InventoryMovementType,
  InventoryReferenceType,
  Prisma,
  QuoteStatus,
} from '@prisma/client';

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  private async reserveInventoryForQuote(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    quote: {
      id: string;
      quoteNumber: string;
      items: Array<{
        productId: string;
        productName: string;
        quantity: Prisma.Decimal;
      }>;
    },
  ) {
    for (const item of quote.items) {
      const quantity = Number(item.quantity);

      const stock = await tx.inventoryStock.upsert({
        where: {
          tenantId_productId: {
            tenantId,
            productId: item.productId,
          },
        },
        create: {
          tenantId,
          productId: item.productId,
          onHand: 0,
          reserved: 0,
          reorderLevel: 0,
        },
        update: {},
      });

      const available = Number(stock.onHand) - Number(stock.reserved);

      if (available < quantity) {
        throw new BadRequestException(
          `Insufficient stock for product: ${item.productName}`,
        );
      }

      // Reserve and deduct from on-hand immediately when quote approved
      const newOnHand = Number(stock.onHand) - quantity;
      const newReserved = Number(stock.reserved) + quantity;

      await tx.inventoryStock.update({
        where: {
          id: stock.id,
        },
        data: {
          onHand: new Prisma.Decimal(newOnHand),
          reserved: new Prisma.Decimal(newReserved),
        },
      });

      // Log both reserve and deduction
      await tx.inventoryLedgerEntry.create({
        data: {
          tenantId,
          stockId: stock.id,
          productId: item.productId,
          movementType: InventoryMovementType.RESERVE,
          quantity,
          referenceType: InventoryReferenceType.QUOTE,
          referenceId: quote.id,
          note: `Reserved for quote ${quote.quoteNumber}`,
          createdById: userId,
        },
      });

      await tx.inventoryLedgerEntry.create({
        data: {
          tenantId,
          stockId: stock.id,
          productId: item.productId,
          movementType: InventoryMovementType.OUT,
          quantity,
          referenceType: InventoryReferenceType.QUOTE,
          referenceId: quote.id,
          note: `Deducted for approved quote ${quote.quoteNumber}`,
          createdById: userId,
        },
      });
    }
  }

  private async releaseInventoryForQuote(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    quote: {
      id: string;
      quoteNumber: string;
      items: Array<{
        productId: string;
        productName: string;
        quantity: Prisma.Decimal;
      }>;
    },
  ) {
    for (const item of quote.items) {
      const quantity = Number(item.quantity);

      const stock = await tx.inventoryStock.findUnique({
        where: {
          tenantId_productId: {
            tenantId,
            productId: item.productId,
          },
        },
      });

      if (!stock || Number(stock.reserved) < quantity) {
        throw new BadRequestException(
          `Reserved stock mismatch for product: ${item.productName}`,
        );
      }

      // Release and refund to on-hand
      const newOnHand = Number(stock.onHand) + quantity;
      const newReserved = Number(stock.reserved) - quantity;

      await tx.inventoryStock.update({
        where: {
          id: stock.id,
        },
        data: {
          onHand: new Prisma.Decimal(newOnHand),
          reserved: new Prisma.Decimal(newReserved),
        },
      });

      // Log both release and refund
      await tx.inventoryLedgerEntry.create({
        data: {
          tenantId,
          stockId: stock.id,
          productId: item.productId,
          movementType: InventoryMovementType.RELEASE,
          quantity,
          referenceType: InventoryReferenceType.QUOTE,
          referenceId: quote.id,
          note: `Released reservation for quote ${quote.quoteNumber}`,
          createdById: userId,
        },
      });

      await tx.inventoryLedgerEntry.create({
        data: {
          tenantId,
          stockId: stock.id,
          productId: item.productId,
          movementType: InventoryMovementType.IN,
          quantity,
          referenceType: InventoryReferenceType.QUOTE,
          referenceId: quote.id,
          note: `Refunded for cancelled quote ${quote.quoteNumber}`,
          createdById: userId,
        },
      });
    }
  }

  private async buildQuoteItems(
    tenantId: string,
    items: CreateQuoteDto['items'],
  ) {
    let subtotal = 0;

    const quoteItems: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }> = [];

    for (const item of items) {
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

    return {
      quoteItems,
      subtotal,
      taxAmount: 0,
      totalAmount: subtotal,
    };
  }

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

    const { quoteItems, subtotal, taxAmount, totalAmount } =
      await this.buildQuoteItems(tenantId, dto.items);

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
        items: {
          include: {
            product: true,
          },
        },
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
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async updateStatus(
    tenantId: string,
    userId: string,
    quoteId: string,
    status: QuoteStatus,
  ) {
    const quote = await this.prisma.quote.findFirst({
      where: {
        id: quoteId,
        tenantId,
      },
      include: {
        items: true,
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    return this.prisma.$transaction(async (tx) => {
      if (status === QuoteStatus.APPROVED && !quote.stockReserved) {
        await this.reserveInventoryForQuote(tx, tenantId, userId, quote);
      }

      if (
        (status === QuoteStatus.CANCELLED ||
          status === QuoteStatus.REJECTED ||
          status === QuoteStatus.EXPIRED) &&
        quote.stockReserved
      ) {
        await this.releaseInventoryForQuote(tx, tenantId, userId, quote);
      }

      const stockReserved =
        status === QuoteStatus.APPROVED
          ? true
          : status === QuoteStatus.CANCELLED ||
              status === QuoteStatus.REJECTED ||
              status === QuoteStatus.EXPIRED
            ? false
            : quote.stockReserved;

      return tx.quote.update({
        where: {
          id: quoteId,
        },
        data: {
          status,
          stockReserved,
        },
        include: {
          customer: true,
          items: true,
        },
      });
    });
  }

  async update(tenantId: string, quoteId: string, dto: UpdateQuoteDto) {
    const quote = await this.prisma.quote.findFirst({
      where: {
        id: quoteId,
        tenantId,
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    if (quote.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException('Only draft quotes can be edited');
    }

    const customer = await this.prisma.customer.findFirst({
      where: {
        id: dto.customerId,
        tenantId,
      },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found.');
    }

    const { quoteItems, subtotal, taxAmount, totalAmount } =
      await this.buildQuoteItems(tenantId, dto.items);

    return this.prisma.quote.update({
      where: {
        id: quoteId,
      },
      data: {
        customerId: dto.customerId,
        notes: dto.notes,
        subtotal,
        taxAmount,
        totalAmount,
        items: {
          deleteMany: {},
          create: quoteItems,
        },
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
