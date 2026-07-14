import { BadRequestException, Injectable } from '@nestjs/common';
import { InventoryReferenceType, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import type { QuoteStatus } from './dto/update-quote-status.dto';
import type { AgentDiscountCategory } from './dto/create-quote.dto';
import { defaultAgentDiscountByCategory } from '../tenant-settings/agent-discount-config.constants';

const inventoryMovementType = {
  RESERVE: 'RESERVE',
  RELEASE: 'RELEASE',
  DISPATCH: 'DISPATCH',
} as const;

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  private parseQuoteMetadata(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private async getDiscountDefaultsByCategory(
    tenantId: string,
  ): Promise<Record<AgentDiscountCategory, number>> {
    const tenant = await this.prisma.tenant.findUnique({
      where: {
        id: tenantId,
      },
      select: {
        agentDiscountConfig: true,
      },
    });

    const config =
      tenant?.agentDiscountConfig &&
      typeof tenant.agentDiscountConfig === 'object' &&
      !Array.isArray(tenant.agentDiscountConfig)
        ? (tenant.agentDiscountConfig as Record<string, unknown>)
        : {};

    const resolvedDefaults = {
      ...defaultAgentDiscountByCategory,
    };

    for (const category of Object.keys(defaultAgentDiscountByCategory) as AgentDiscountCategory[]) {
      const configuredValue = config[category];

      if (
        typeof configuredValue === 'number' &&
        Number.isFinite(configuredValue) &&
        configuredValue >= 0 &&
        configuredValue <= 100
      ) {
        resolvedDefaults[category] = Number(configuredValue);
      }
    }

    return resolvedDefaults;
  }

  private async resolveDiscount(
    tenantId: string,
    dto: Pick<CreateQuoteDto, 'agentCategory' | 'discountPercentage'>,
    subtotal: number,
  ) {
    const discountDefaults = await this.getDiscountDefaultsByCategory(tenantId);

    const defaultDiscountPercentage = dto.agentCategory
      ? discountDefaults[dto.agentCategory]
      : 0;

    const discountPercentage =
      dto.discountPercentage !== undefined
        ? dto.discountPercentage
        : defaultDiscountPercentage;

    const discountAmount = Number(
      ((subtotal * discountPercentage) / 100).toFixed(2),
    );

    const taxableAmount = Number((subtotal - discountAmount).toFixed(2));
    const taxAmount = 0;
    const totalAmount = Number((taxableAmount + taxAmount).toFixed(2));

    return {
      agentCategory: dto.agentCategory ?? null,
      discountPercentage,
      discountAmount,
      taxAmount,
      totalAmount,
    };
  }

  private async resolveAgentCommission(
    tenantId: string,
    dto: Pick<CreateQuoteDto, 'agentId' | 'agentCommissionPercentage'>,
    totalAmount: number,
  ) {
    if (!dto.agentId) {
      if (dto.agentCommissionPercentage !== undefined) {
        throw new BadRequestException(
          'Agent commission percentage can be set only when an agent is selected',
        );
      }

      return {
        agentId: null,
        agentCommissionPercentage: 0,
        agentCommissionAmount: 0,
      };
    }

    const agent = await this.prisma.agent.findFirst({
      where: {
        id: dto.agentId,
        tenantId,
        active: true,
      },
    });

    if (!agent) {
      throw new BadRequestException('Agent not found or inactive');
    }

    const agentCommissionPercentage =
      dto.agentCommissionPercentage !== undefined
        ? dto.agentCommissionPercentage
        : Number(agent.defaultCommissionPercentage);

    const agentCommissionAmount = Number(
      ((totalAmount * agentCommissionPercentage) / 100).toFixed(2),
    );

    return {
      agentId: agent.id,
      agentCommissionPercentage,
      agentCommissionAmount,
    };
  }

  private async reserveInventoryForQuote(
    tx: any,
    tenantId: string,
    userId: string | null,
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
    userId: string | null,
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
    userId: string | null,
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

      // Use overridden price if provided, else fall back to product selling price.
      const requestedUnitPrice =
        item.unitPrice !== undefined ? item.unitPrice : Number(product.sellingPrice);

      // Enforce landing price floor.
      if (product.landingPrice !== null) {
        const landingPrice = Number(product.landingPrice);
        if (requestedUnitPrice < landingPrice) {
          throw new BadRequestException(
            `Unit price for "${product.name}" cannot be below the landing price of ${landingPrice}`,
          );
        }
      }

      const unitPrice = requestedUnitPrice;

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
    };
  }

  private async generateQuoteNumber(tenantId: string) {
    const count = await this.prisma.quote.count({
      where: { tenantId },
    });

    return `QT-${String(count + 1).padStart(5, '0')}`;
  }

  private getQuoteValidUntilDate() {
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 7);
    return validUntil;
  }

  private async expireOverdueQuotes(tenantId: string) {
    const overdueQuotes = await this.prisma.quote.findMany({
      where: {
        tenantId,
        status: {
          in: ['DRAFT', 'SENT', 'APPROVED'],
        },
        validUntil: {
          not: null,
          lt: new Date(),
        },
      },
      include: {
        items: true,
      },
    });

    for (const quote of overdueQuotes) {
      await this.prisma.$transaction(async (tx) => {
        if (quote.stockReserved) {
          await this.releaseInventoryForQuote(tx, tenantId, null, quote);
        }

        await tx.quote.update({
          where: {
            id: quote.id,
          },
          data: {
            status: 'EXPIRED',
            stockReserved: false,
          },
        });
      });
    }
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

    const { quoteItems, subtotal } = await this.buildQuoteItems(tenantId, dto.items);

    const {
      agentCategory,
      discountPercentage,
      discountAmount,
      taxAmount,
      totalAmount,
    } = await this.resolveDiscount(tenantId, dto, subtotal);

    const {
      agentId,
      agentCommissionPercentage,
      agentCommissionAmount,
    } = await this.resolveAgentCommission(tenantId, dto, totalAmount);

    return this.prisma.quote.create({
      data: {
        tenantId,

        customerId: dto.customerId,
        agentId,

        quoteNumber,

        subtotal,
        taxAmount,
        totalAmount,
        validUntil: this.getQuoteValidUntilDate(),
        discountAmount,
        agentCommissionPercentage,
        agentCommissionAmount,

        notes: dto.notes,
        recommendationRunId: dto.recommendationRunId,
        metadata: {
          ...this.parseQuoteMetadata(dto.metadata),
          quoteDiscount: {
            agentCategory,
            discountPercentage,
          },
        } as Prisma.InputJsonValue,

        items: {
          create: quoteItems,
        },
      },
      include: {
        customer: true,
        agent: true,
        items: true,
      },
    });
  }

  async findAll(tenantId: string) {
    await this.expireOverdueQuotes(tenantId);

    return this.prisma.quote.findMany({
      where: {
        tenantId,
      },
      include: {
        customer: true,
        agent: true,
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
    await this.expireOverdueQuotes(tenantId);

    return this.prisma.quote.findFirst({
      where: {
        id: quoteId,
        tenantId,
      },
      include: {
        customer: true,
        agent: true,
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
    await this.expireOverdueQuotes(tenantId);

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

    if (quote.status === 'EXPIRED' && status !== 'EXPIRED') {
      throw new BadRequestException(
        'Quote has expired. Create a revision to continue.',
      );
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
          agent: true,
          items: true,
        },
      });
    });
  }

  async update(tenantId: string, quoteId: string, dto: UpdateQuoteDto) {
    await this.expireOverdueQuotes(tenantId);

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

    const { quoteItems, subtotal } = await this.buildQuoteItems(tenantId, dto.items);

    const {
      agentCategory,
      discountPercentage,
      discountAmount,
      taxAmount,
      totalAmount,
    } = await this.resolveDiscount(tenantId, dto, subtotal);

    const {
      agentId,
      agentCommissionPercentage,
      agentCommissionAmount,
    } = await this.resolveAgentCommission(tenantId, dto, totalAmount);

    return this.prisma.quote.update({
      where: {
        id: quoteId,
      },
      data: {
        customerId: dto.customerId,
        agentId,
        notes: dto.notes,
        subtotal,
        taxAmount,
        totalAmount,
        discountAmount,
        agentCommissionPercentage,
        agentCommissionAmount,
        metadata: {
          ...this.parseQuoteMetadata(quote.metadata),
          ...this.parseQuoteMetadata(dto.metadata),
          quoteDiscount: {
            agentCategory,
            discountPercentage,
          },
        } as Prisma.InputJsonValue,
        items: {
          deleteMany: {},
          create: quoteItems,
        },
      },
      include: {
        customer: true,
        agent: true,
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
        agent: true,
        items: true,
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    return quote;
  }
}
