import { BadRequestException, Injectable } from '@nestjs/common';
import { InventoryReferenceType, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CommissionsService } from '../commissions/commissions.service';
import { PricingService } from '../pricing/pricing.service';
import type { PricingActor } from '../pricing/pricing.types';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly commissionsService: CommissionsService,
  ) {}

  private parseQuoteMetadata(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private async resolveAgentCommission(
    tenantId: string,
    dto: Pick<CreateQuoteDto, 'agentId' | 'agentCommissionPercentage'>,
    taxableAmount: number,
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
      ((taxableAmount * agentCommissionPercentage) / 100).toFixed(2),
    );

    return {
      agentId: agent.id,
      agentCommissionPercentage,
      agentCommissionAmount,
    };
  }

  private async createPriceOverrideApprovals(
    tenantId: string,
    quoteId: string,
    quoteItems: Array<{ id: string }>,
    approvals: Array<{
      itemIndex: number;
      requestedPrice: number;
      minimumAllowedPrice: number;
      reason: string;
      requestedById: string;
      approvedById?: string;
      approvedAt?: Date;
      status: 'REQUESTED' | 'APPROVED';
    }>,
  ) {
    if (approvals.length === 0) {
      return;
    }

    const rows = approvals
      .map((approval) => {
        const item = quoteItems[approval.itemIndex];

        if (!item) {
          return null;
        }

        return {
          tenantId,
          quoteId,
          quoteItemId: item.id,
          requestedPrice: new Prisma.Decimal(approval.requestedPrice),
          minimumAllowedPrice: new Prisma.Decimal(approval.minimumAllowedPrice),
          reason: approval.reason,
          status: approval.status,
          requestedById: approval.requestedById,
          approvedById: approval.approvedById,
          approvedAt: approval.approvedAt,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length === 0) {
      return;
    }

    await this.prisma.priceOverrideApproval.createMany({
      data: rows,
    });
  }

  private async reserveInventoryForQuote(
    tx: Prisma.TransactionClient,
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

      const newReserved = Number(stock.reserved) + quantity;

      await tx.inventoryStock.update({
        where: {
          id: stock.id,
        },
        data: {
          reserved: new Prisma.Decimal(newReserved),
        },
      });

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
    tx: Prisma.TransactionClient,
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
    tx: Prisma.TransactionClient,
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

      const newReserved = Number(stock.reserved) - quantity;

      await tx.inventoryStock.update({
        where: {
          id: stock.id,
        },
        data: {
          reserved: new Prisma.Decimal(newReserved),
        },
      });

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

  async create(tenantId: string, dto: CreateQuoteDto, actor?: PricingActor) {
    const pricing = await this.pricingService.calculateQuotePricing(
      tenantId,
      dto,
      actor,
    );

    const {
      agentId,
      agentCommissionPercentage,
      agentCommissionAmount,
    } = await this.resolveAgentCommission(tenantId, dto, pricing.taxableAmount);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const quoteNumber = await this.generateQuoteNumber(tenantId);

      try {
        return await this.prisma.quote.create({
          data: {
            tenantId,
            customerId: dto.customerId,
            agentId,
            quoteNumber,
            subtotal: new Prisma.Decimal(pricing.subtotal),
            subtotalBeforeDiscount: new Prisma.Decimal(pricing.subtotalBeforeDiscount),
            taxableAmount: new Prisma.Decimal(pricing.taxableAmount),
            taxAmount: new Prisma.Decimal(pricing.taxAmount),
            taxPercentage: new Prisma.Decimal(pricing.taxPercentage),
            igstAmount: new Prisma.Decimal(pricing.igstAmount),
            cgstAmount: new Prisma.Decimal(pricing.cgstAmount),
            sgstAmount: new Prisma.Decimal(pricing.sgstAmount),
            totalAmount: new Prisma.Decimal(pricing.totalAmount),
            sellerStateCode: pricing.sellerStateCode,
            customerBillingStateCode: pricing.customerBillingStateCode,
            placeOfSupplyStateCode: pricing.placeOfSupplyStateCode,
            validUntil: this.getQuoteValidUntilDate(),
            discountAmount: new Prisma.Decimal(pricing.totalDiscountAmount),
            lineDiscountAmount: new Prisma.Decimal(pricing.lineDiscountAmount),
            orderDiscountType: pricing.orderDiscountType,
            orderDiscountValue:
              pricing.orderDiscountValue !== null
                ? new Prisma.Decimal(pricing.orderDiscountValue)
                : null,
            orderDiscountAmount: new Prisma.Decimal(pricing.orderDiscountAmount),
            agentCommissionPercentage: new Prisma.Decimal(agentCommissionPercentage),
            agentCommissionAmount: new Prisma.Decimal(agentCommissionAmount),
            notes: dto.notes,
            recommendationRunId: dto.recommendationRunId,
            metadata: {
              ...this.parseQuoteMetadata(dto.metadata),
              pricing: pricing.metadata,
            } as Prisma.InputJsonValue,
            items: {
              create: pricing.quoteItems.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                quantity: new Prisma.Decimal(item.quantity),
                unitPrice: new Prisma.Decimal(item.unitPrice),
                baseUnitPrice: new Prisma.Decimal(item.baseUnitPrice),
                discountType: item.discountType,
                discountPercentage:
                  item.discountPercentage !== null
                    ? new Prisma.Decimal(item.discountPercentage)
                    : null,
                discountAmount: new Prisma.Decimal(item.discountAmount),
                netUnitPrice: new Prisma.Decimal(item.netUnitPrice),
                lineTotal: new Prisma.Decimal(item.lineTotal),
                taxClassificationCode: item.taxClassificationCode,
                gstRateApplied: new Prisma.Decimal(item.gstRateApplied),
                taxableAmount: new Prisma.Decimal(item.taxableAmount),
                taxAmount: new Prisma.Decimal(item.taxAmount),
                igstAmount: new Prisma.Decimal(item.igstAmount),
                cgstAmount: new Prisma.Decimal(item.cgstAmount),
                sgstAmount: new Prisma.Decimal(item.sgstAmount),
                appliedTaxType: item.appliedTaxType,
                discountReason: item.discountReason,
              })),
            },
          },
          include: {
            customer: true,
            agent: true,
            items: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        });
      } catch (error) {
        const isUniqueConstraintError =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: string }).code === 'P2002';

        if (!isUniqueConstraintError || attempt === 4) {
          throw error;
        }
      }
    }

    throw new Error('Failed to create quote after retrying quote number allocation');
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
          orderBy: {
            createdAt: 'asc',
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

    const quote = await this.prisma.quote.findFirst({
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
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    return quote;
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

    const updatedQuote = await this.prisma.$transaction(async (tx) => {
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
          status: status as never,
          stockReserved,
          ...(status === 'INVOICED' && quote.invoicedAt === null
            ? { invoicedAt: new Date() }
            : {}),
        },
        include: {
          customer: true,
          agent: true,
          items: true,
        },
      });
    });

    if (status === 'INVOICED') {
      await this.commissionsService.createAccrualForInvoicedQuote(tenantId, quoteId);
    }

    return updatedQuote;
  }

  async update(
    tenantId: string,
    quoteId: string,
    dto: UpdateQuoteDto,
    actor?: PricingActor,
  ) {
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

    const pricing = await this.pricingService.calculateQuotePricing(
      tenantId,
      dto,
      actor,
    );

    const {
      agentId,
      agentCommissionPercentage,
      agentCommissionAmount,
    } = await this.resolveAgentCommission(tenantId, dto, pricing.taxableAmount);

    const updatedQuote = await this.prisma.quote.update({
      where: {
        id: quoteId,
      },
      data: {
        customerId: dto.customerId,
        agentId,
        notes: dto.notes,
        subtotal: new Prisma.Decimal(pricing.subtotal),
        subtotalBeforeDiscount: new Prisma.Decimal(pricing.subtotalBeforeDiscount),
        taxableAmount: new Prisma.Decimal(pricing.taxableAmount),
        taxAmount: new Prisma.Decimal(pricing.taxAmount),
        taxPercentage: new Prisma.Decimal(pricing.taxPercentage),
        igstAmount: new Prisma.Decimal(pricing.igstAmount),
        cgstAmount: new Prisma.Decimal(pricing.cgstAmount),
        sgstAmount: new Prisma.Decimal(pricing.sgstAmount),
        totalAmount: new Prisma.Decimal(pricing.totalAmount),
        sellerStateCode: pricing.sellerStateCode,
        customerBillingStateCode: pricing.customerBillingStateCode,
        placeOfSupplyStateCode: pricing.placeOfSupplyStateCode,
        discountAmount: new Prisma.Decimal(pricing.totalDiscountAmount),
        lineDiscountAmount: new Prisma.Decimal(pricing.lineDiscountAmount),
        orderDiscountType: pricing.orderDiscountType,
        orderDiscountValue:
          pricing.orderDiscountValue !== null
            ? new Prisma.Decimal(pricing.orderDiscountValue)
            : null,
        orderDiscountAmount: new Prisma.Decimal(pricing.orderDiscountAmount),
        agentCommissionPercentage: new Prisma.Decimal(agentCommissionPercentage),
        agentCommissionAmount: new Prisma.Decimal(agentCommissionAmount),
        metadata: {
          ...this.parseQuoteMetadata(quote.metadata),
          ...this.parseQuoteMetadata(dto.metadata),
          pricing: pricing.metadata,
        } as Prisma.InputJsonValue,
        items: {
          deleteMany: {},
          create: pricing.quoteItems.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            baseUnitPrice: new Prisma.Decimal(item.baseUnitPrice),
            discountType: item.discountType,
            discountPercentage:
              item.discountPercentage !== null
                ? new Prisma.Decimal(item.discountPercentage)
                : null,
            discountAmount: new Prisma.Decimal(item.discountAmount),
            netUnitPrice: new Prisma.Decimal(item.netUnitPrice),
            lineTotal: new Prisma.Decimal(item.lineTotal),
            taxClassificationCode: item.taxClassificationCode,
            gstRateApplied: new Prisma.Decimal(item.gstRateApplied),
            taxableAmount: new Prisma.Decimal(item.taxableAmount),
            taxAmount: new Prisma.Decimal(item.taxAmount),
            igstAmount: new Prisma.Decimal(item.igstAmount),
            cgstAmount: new Prisma.Decimal(item.cgstAmount),
            sgstAmount: new Prisma.Decimal(item.sgstAmount),
            appliedTaxType: item.appliedTaxType,
            discountReason: item.discountReason,
          })),
        },
      },
      include: {
        customer: true,
        agent: true,
        items: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    await this.prisma.priceOverrideApproval.deleteMany({
      where: {
        tenantId,
        quoteId,
      },
    });

    await this.createPriceOverrideApprovals(
      tenantId,
      quoteId,
      updatedQuote.items.map((item) => ({ id: item.id })),
      pricing.pendingApprovals,
    );

    return updatedQuote;
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
