import { BadRequestException, Injectable } from '@nestjs/common';
import { InventoryReferenceType, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import type { QuoteStatus } from './dto/update-quote-status.dto';

const inventoryMovementType = {
  RESERVE: 'RESERVE',
  RELEASE: 'RELEASE',
  DISPATCH: 'DISPATCH',
} as const;

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  private async reserveInventoryForQuote(
    tx: any,
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

      // Reserve stock without reducing physical on-hand.
      const newOnHand = Number(stock.onHand);
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

      // Log the reservation so available stock stays blocked until dispatch.
      await tx.inventoryLedgerEntry.create({
        data: {
          tenantId,
          stockId: stock.id,
          productId: item.productId,
          movementType: inventoryMovementType.RESERVE,
          quantity,
          referenceType: InventoryReferenceType.QUOTE,
          referenceId: quote.id,
          note: `Reserved for quote ${quote.quoteNumber}`,
          createdById: userId,
        },
      });
    }
  }

  private async dispatchInventoryForQuote(
    tx: any,
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

      if (!stock) {
        throw new BadRequestException(
          `Inventory stock not found for product: ${item.productName}`,
        );
      }

      if (Number(stock.reserved) < quantity) {
        throw new BadRequestException(
          `Reserved stock mismatch for product: ${item.productName}`,
        );
      }

      if (Number(stock.onHand) < quantity) {
        throw new BadRequestException(
          `Insufficient on-hand stock to dispatch product: ${item.productName}`,
        );
      }

      const nextOnHand = Number(stock.onHand) - quantity;
      const nextReserved = Number(stock.reserved) - quantity;

      await tx.inventoryStock.update({
        where: {
          id: stock.id,
        },
        data: {
          onHand: new Prisma.Decimal(nextOnHand),
          reserved: new Prisma.Decimal(nextReserved),
        },
      });

      await tx.inventoryLedgerEntry.create({
        data: {
          tenantId,
          stockId: stock.id,
          productId: item.productId,
          movementType: inventoryMovementType.DISPATCH as never,
          quantity,
          referenceType: InventoryReferenceType.QUOTE,
          referenceId: quote.id,
          note: `Dispatched for invoiced quote ${quote.quoteNumber}`,
          createdById: userId,
        },
      });
    }
  }

  private async releaseInventoryForQuote(
    tx: any,
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

      // Release reserved stock without changing physical on-hand.
      const newOnHand = Number(stock.onHand);
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

      // Log the reservation release so stock becomes available again.
      await tx.inventoryLedgerEntry.create({
        data: {
          tenantId,
          stockId: stock.id,
          productId: item.productId,
          movementType: inventoryMovementType.RELEASE,
          quantity,
          referenceType: InventoryReferenceType.QUOTE,
          referenceId: quote.id,
          note: `Released reservation for quote ${quote.quoteNumber}`,
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
      const currentStatus = quote.status as string;

      if (status === 'APPROVED' && !quote.stockReserved) {
        await this.reserveInventoryForQuote(tx, tenantId, userId, quote);
      }

      if (status === 'INVOICED') {
        if (currentStatus !== 'APPROVED' || !quote.stockReserved) {
          throw new BadRequestException('Approve the quote before invoicing it');
        }
      }

      if (status === 'DISPATCHED') {
        if (currentStatus !== 'INVOICED') {
          throw new BadRequestException('Generate an invoice before dispatching goods');
        }

        if (!quote.stockReserved) {
          throw new BadRequestException('No reserved stock available to dispatch');
        }

        await this.dispatchInventoryForQuote(tx, tenantId, userId, quote);
      }

      if (
        (status === 'CANCELLED' ||
          status === 'REJECTED' ||
          status === 'EXPIRED') &&
        quote.stockReserved
      ) {
        await this.releaseInventoryForQuote(tx, tenantId, userId, quote);
      }

      const stockReserved =
        status === 'APPROVED'
          ? true
          : status === 'DISPATCHED'
            ? false
            : status === 'INVOICED'
              ? quote.stockReserved
          : status === 'CANCELLED' ||
              status === 'REJECTED' ||
              status === 'EXPIRED'
            ? false
            : quote.stockReserved;

      return tx.quote.update({
        where: {
          id: quoteId,
        },
        data: {
          status: status as any,
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

    if (quote.status !== 'DRAFT') {
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
