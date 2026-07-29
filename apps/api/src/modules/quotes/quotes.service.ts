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

// DEF-003: Quote State Transition Matrix
// Defines all legal transitions. Same-state transitions are rejected.
// INVOICED → REJECTED/CANCELLED transitions are pending business confirmation.
const ALLOWED_TRANSITIONS = {
  DRAFT: ['SENT', 'APPROVED', 'REJECTED', 'CANCELLED'],
  SENT: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['INVOICED', 'REJECTED', 'CANCELLED'],
  INVOICED: ['DISPATCHED'], // Pending business decision on REJECTED/CANCELLED
  DISPATCHED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
} as const satisfies Record<QuoteStatus, readonly QuoteStatus[]>;

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

    // Step 1: Load quote (tenant-scoped)
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

    // Step 2: Validate transition BEFORE any writes (DEF-003)
    const currentStatus = quote.status;

    // AC2: Reject same-state transitions
    if (currentStatus === status) {
      throw new BadRequestException(
        `Quote is already in ${status} state`,
      );
    }

    // AC1: Reject illegal transitions against transition matrix
    const allowedNextStates = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowedNextStates || !allowedNextStates.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${status}`,
      );
    }

    // AC8: EXPIRED guard
    if (currentStatus === 'EXPIRED' && status !== 'EXPIRED') {
      throw new BadRequestException(
        'Quote has expired. Create a revision to continue.',
      );
    }

    // Step 3: Begin transaction only after validation passes (AC11: zero mutations on invalid transition)
    const updatedQuote = await this.prisma.$transaction(async (tx) => {
      // DEF-004: Architectural Invariant
      // Every quote status transition (especially INVOICED) MUST use FOR UPDATE lock
      // to serialize concurrent attempts. Without this lock, two concurrent invoice
      // requests can both pass validation, enter the transaction, and create duplicate
      // commission accruals despite the idempotent check (findFirst + create).
      // The lock ensures: only one concurrent invoice succeeds, others fail at lock wait or status re-verify.
      // This mirrors DEF-005 pattern for payment coordination.
      // DEF-004: Lock and re-verify quote status before transition
      // This prevents concurrent invoice attempts from creating duplicate accruals
      // Mirrors DEF-005 pattern: serialize state mutations via FOR UPDATE lock
      const lockedQuotes = await tx.$queryRaw<
        Array<{
          id: string;
          status: QuoteStatus;
          stockReserved: boolean;
          invoicedAt: Date | null;
          quoteNumber: string;
          agentId: string | null;
          subtotal: Prisma.Decimal;
          taxableAmount: Prisma.Decimal | null;
          taxAmount: Prisma.Decimal;
          discountAmount: Prisma.Decimal;
          agentCommissionPercentage: Prisma.Decimal | null;
        }>
      >`SELECT "id", "status", "stockReserved", "invoicedAt", "quoteNumber", "agentId", "subtotal", "taxableAmount", "taxAmount", "discountAmount", "agentCommissionPercentage"
        FROM "Quote"
        WHERE "id" = ${quoteId} AND "tenantId" = ${tenantId}
        FOR UPDATE`;

      const lockedQuote = lockedQuotes[0];
      if (!lockedQuote) {
        throw new BadRequestException('Quote not found');
      }

      // Load quote items for inventory operations (not covered by FOR UPDATE on Quote)
      const quoteItems = await tx.quoteItem.findMany({
        where: {
          quoteId,
        },
        select: {
          productId: true,
          productName: true,
          quantity: true,
        },
      });

      // Re-verify status hasn't changed since loading outside transaction
      if (lockedQuote.status !== quote.status) {
        throw new BadRequestException(
          `Quote status has changed. Expected ${quote.status}, found ${lockedQuote.status}`,
        );
      }

      // Re-verify transition is still allowed (DEF-003)
      const allowedNextStates = ALLOWED_TRANSITIONS[lockedQuote.status];
      if (!allowedNextStates || !allowedNextStates.includes(status)) {
        throw new BadRequestException(
          `Cannot transition from ${lockedQuote.status} to ${status}`,
        );
      }

      // Handle inventory side effects based on target status
      switch (status) {
        case 'APPROVED':
          // Reserve stock on first APPROVED (if not already reserved)
          if (!lockedQuote.stockReserved) {
            await this.reserveInventoryForQuote(tx, tenantId, userId, {
              id: lockedQuote.id,
              quoteNumber: lockedQuote.quoteNumber,
              items: quoteItems,
            });
          }
          break;

        case 'DISPATCHED':
          // Dispatch stock (decrement onHand and reserved)
          if (lockedQuote.stockReserved) {
            await this.dispatchInventoryForQuote(tx, tenantId, userId, {
              id: lockedQuote.id,
              quoteNumber: lockedQuote.quoteNumber,
              items: quoteItems,
            });
          }
          break;

        case 'REJECTED':
        case 'CANCELLED':
          // Release reserved stock
          if (lockedQuote.stockReserved) {
            await this.releaseInventoryForQuote(tx, tenantId, userId, {
              id: lockedQuote.id,
              quoteNumber: lockedQuote.quoteNumber,
              items: quoteItems,
            });
          }
          break;

        case 'INVOICED':
          // No inventory operations for INVOICED
          break;

        case 'SENT':
        case 'EXPIRED':
          // No inventory operations for these states
          break;
      }

      // Compute stockReserved flag based on target status
      const stockReserved =
        status === 'APPROVED'
          ? true
          : (status === 'DISPATCHED' || status === 'REJECTED' || status === 'CANCELLED')
            ? false
            : status === 'INVOICED'
              ? lockedQuote.stockReserved
              : lockedQuote.stockReserved;

      // Update quote status and flags
      const updatedQuoteResult = await tx.quote.update({
        where: {
          id: quoteId,
        },
        data: {
          status: status as never,
          stockReserved,
          ...(status === 'INVOICED' && lockedQuote.invoicedAt === null
            ? { invoicedAt: new Date() }
            : {}),
        },
        include: {
          customer: true,
          agent: true,
          items: true,
        },
      });

      // DEF-004: Create commission accrual atomically within same transaction
      // Quote is locked and status verified, so concurrent invoice attempts are serialized
      if (status === 'INVOICED') {
        await this.commissionsService.createAccrualForInvoicedQuoteWithinTransaction(
          tenantId,
          quoteId,
          {
            id: lockedQuote.id,
            quoteNumber: lockedQuote.quoteNumber,
            agentId: lockedQuote.agentId,
            subtotal: lockedQuote.subtotal,
            taxableAmount: lockedQuote.taxableAmount,
            taxAmount: lockedQuote.taxAmount,
            discountAmount: lockedQuote.discountAmount,
            agentCommissionPercentage: lockedQuote.agentCommissionPercentage,
          },
          tx,
        );
      }

      return updatedQuoteResult;
    });

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
