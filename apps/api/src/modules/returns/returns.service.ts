import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  InventoryReferenceType,
  Prisma,
  ProductReturnStatus,
  ProductReturnType,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CommissionsService } from '../commissions/commissions.service';
import { CreateProductReturnDto } from './dto/create-product-return.dto';

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commissionsService: CommissionsService,
  ) {}

  private round2(value: number) {
    return Number(value.toFixed(2));
  }

  private readonly allowedStatusTransitions: Record<
    ProductReturnStatus,
    ProductReturnStatus[]
  > = {
    REQUESTED: [ProductReturnStatus.APPROVED, ProductReturnStatus.REJECTED],
    APPROVED: [ProductReturnStatus.COMPLETED, ProductReturnStatus.REJECTED],
    REJECTED: [],
    COMPLETED: [],
  };

  private async generateReturnNumber(tenantId: string) {
    const count = await this.prisma.productReturn.count({
      where: { tenantId },
    });

    return `RT-${String(count + 1).padStart(5, '0')}`;
  }

  async create(tenantId: string, userId: string, dto: CreateProductReturnDto) {
    if (dto.type === ProductReturnType.SALES_RETURN && !dto.quoteId) {
      throw new BadRequestException('quoteId is required for SALES_RETURN');
    }

    if (dto.type === ProductReturnType.PURCHASE_RETURN && !dto.purchaseOrderId) {
      throw new BadRequestException('purchaseOrderId is required for PURCHASE_RETURN');
    }

    if (dto.quoteId) {
      const quote = await this.prisma.quote.findFirst({
        where: {
          id: dto.quoteId,
          tenantId,
        },
        select: {
          id: true,
          status: true,
          customerId: true,
          items: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              lineTotal: true,
              taxableAmount: true,
              taxAmount: true,
              igstAmount: true,
              cgstAmount: true,
              sgstAmount: true,
              appliedTaxType: true,
              gstRateApplied: true,
              taxClassificationCode: true,
              createdAt: true,
            },
          },
        },
      });

      if (!quote) {
        throw new BadRequestException('Quote not found');
      }

      if (!['INVOICED', 'DISPATCHED'].includes(quote.status)) {
        throw new BadRequestException(
          'Sales return is allowed only for invoiced or dispatched quotes',
        );
      }

      dto.customerId = dto.customerId ?? quote.customerId;

      const soldQtyByProduct = new Map<string, number>();

      for (const quoteItem of quote.items) {
        const current = soldQtyByProduct.get(quoteItem.productId) ?? 0;
        soldQtyByProduct.set(
          quoteItem.productId,
          current + Number(quoteItem.quantity),
        );
      }

      const priorReturns = await this.prisma.productReturnItem.findMany({
        where: {
          productReturn: {
            tenantId,
            quoteId: quote.id,
            type: ProductReturnType.SALES_RETURN,
            status: {
              not: ProductReturnStatus.REJECTED,
            },
          },
        },
        select: {
          productId: true,
          quantity: true,
          sourceTaxSnapshot: true,
        },
      });

      const returnedQtyByProduct = new Map<string, number>();

      for (const priorReturn of priorReturns) {
        const current = returnedQtyByProduct.get(priorReturn.productId) ?? 0;
        returnedQtyByProduct.set(
          priorReturn.productId,
          current + Number(priorReturn.quantity),
        );
      }

      const returnedQtyByQuoteItem = new Map<string, number>();

      for (const priorReturn of priorReturns) {
        const snapshot = priorReturn.sourceTaxSnapshot;

        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
          continue;
        }

        const rawAllocations = (snapshot as Record<string, unknown>).allocations;

        if (!Array.isArray(rawAllocations)) {
          continue;
        }

        for (const rawAllocation of rawAllocations) {
          if (
            !rawAllocation ||
            typeof rawAllocation !== 'object' ||
            Array.isArray(rawAllocation)
          ) {
            continue;
          }

          const allocation = rawAllocation as Record<string, unknown>;
          const quoteItemId =
            typeof allocation.quoteItemId === 'string' ? allocation.quoteItemId : null;
          const quantity =
            typeof allocation.quantity === 'number' && Number.isFinite(allocation.quantity)
              ? Number(allocation.quantity)
              : null;

          if (!quoteItemId || quantity === null) {
            continue;
          }

          returnedQtyByQuoteItem.set(
            quoteItemId,
            (returnedQtyByQuoteItem.get(quoteItemId) ?? 0) + quantity,
          );
        }
      }

      for (const item of dto.items) {
        const soldQty = soldQtyByProduct.get(item.productId) ?? 0;

        if (soldQty <= 0) {
          throw new BadRequestException(
            `Product is not present in source quote: ${item.productId}`,
          );
        }

        const existingReturned = returnedQtyByProduct.get(item.productId) ?? 0;
        const nextReturned = existingReturned + item.quantity;

        if (nextReturned > soldQty) {
          throw new BadRequestException(
            `Return quantity exceeds sold quantity for product ${item.productId}`,
          );
        }

        const candidateQuoteItems = quote.items
          .filter((quoteItem) => quoteItem.productId === item.productId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        let remainingToAllocate = item.quantity;

        for (const quoteItem of candidateQuoteItems) {
          if (remainingToAllocate <= 0) {
            break;
          }

          const soldOnItem = Number(quoteItem.quantity);
          const alreadyReturned = returnedQtyByQuoteItem.get(quoteItem.id) ?? 0;
          const available = this.round2(Math.max(soldOnItem - alreadyReturned, 0));

          if (available <= 0) {
            continue;
          }

          const allocated = this.round2(Math.min(available, remainingToAllocate));

          returnedQtyByQuoteItem.set(
            quoteItem.id,
            this.round2(alreadyReturned + allocated),
          );

          remainingToAllocate = this.round2(remainingToAllocate - allocated);
        }

        if (remainingToAllocate > 0) {
          throw new BadRequestException(
            `Unable to resolve source quote item quantities for product ${item.productId}`,
          );
        }
      }
    }

    if (dto.purchaseOrderId) {
      const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
        where: {
          id: dto.purchaseOrderId,
          tenantId,
        },
        select: {
          id: true,
          items: {
            select: {
              productId: true,
              receivedQuantity: true,
            },
          },
        },
      });

      if (!purchaseOrder) {
        throw new BadRequestException('Purchase order not found');
      }

      const receivedQtyByProduct = new Map<string, number>();

      for (const poItem of purchaseOrder.items) {
        const current = receivedQtyByProduct.get(poItem.productId) ?? 0;
        receivedQtyByProduct.set(
          poItem.productId,
          current + Number(poItem.receivedQuantity),
        );
      }

      const priorReturns = await this.prisma.productReturnItem.findMany({
        where: {
          productReturn: {
            tenantId,
            purchaseOrderId: purchaseOrder.id,
            type: ProductReturnType.PURCHASE_RETURN,
            status: {
              not: ProductReturnStatus.REJECTED,
            },
          },
        },
        select: {
          productId: true,
          quantity: true,
        },
      });

      const returnedQtyByProduct = new Map<string, number>();

      for (const priorReturn of priorReturns) {
        const current = returnedQtyByProduct.get(priorReturn.productId) ?? 0;
        returnedQtyByProduct.set(
          priorReturn.productId,
          current + Number(priorReturn.quantity),
        );
      }

      for (const item of dto.items) {
        const receivedQty = receivedQtyByProduct.get(item.productId) ?? 0;

        if (receivedQty <= 0) {
          throw new BadRequestException(
            `Product has no received quantity in source PO: ${item.productId}`,
          );
        }

        const existingReturned = returnedQtyByProduct.get(item.productId) ?? 0;
        const nextReturned = existingReturned + item.quantity;

        if (nextReturned > receivedQty) {
          throw new BadRequestException(
            `Return quantity exceeds received quantity for product ${item.productId}`,
          );
        }
      }
    }

    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: {
          id: dto.customerId,
          tenantId,
        },
        select: { id: true },
      });

      if (!customer) {
        throw new BadRequestException('Customer not found');
      }
    }

    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        active: true,
        id: {
          in: dto.items.map((item) => item.productId),
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const productById = new Map(products.map((product) => [product.id, product]));

    for (const item of dto.items) {
      if (!productById.has(item.productId)) {
        throw new BadRequestException(`Product not found: ${item.productId}`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const sourceQuote =
        dto.type === ProductReturnType.SALES_RETURN && dto.quoteId
          ? await tx.quote.findFirst({
              where: {
                id: dto.quoteId,
                tenantId,
              },
              select: {
                id: true,
                quoteNumber: true,
                items: {
                  select: {
                    id: true,
                    productId: true,
                    quantity: true,
                    lineTotal: true,
                    taxableAmount: true,
                    taxAmount: true,
                    igstAmount: true,
                    cgstAmount: true,
                    sgstAmount: true,
                    appliedTaxType: true,
                    gstRateApplied: true,
                    taxClassificationCode: true,
                    createdAt: true,
                  },
                },
              },
            })
          : null;

      const priorReturnedItems =
        dto.type === ProductReturnType.SALES_RETURN && dto.quoteId
          ? await tx.productReturnItem.findMany({
              where: {
                productReturn: {
                  tenantId,
                  quoteId: dto.quoteId,
                  type: ProductReturnType.SALES_RETURN,
                  status: {
                    not: ProductReturnStatus.REJECTED,
                  },
                },
              },
              select: {
                sourceTaxSnapshot: true,
              },
            })
          : [];

      const returnedQtyByQuoteItem = new Map<string, number>();

      for (const priorItem of priorReturnedItems) {
        const snapshot = priorItem.sourceTaxSnapshot;

        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
          continue;
        }

        const rawAllocations = (snapshot as Record<string, unknown>).allocations;

        if (!Array.isArray(rawAllocations)) {
          continue;
        }

        for (const rawAllocation of rawAllocations) {
          if (
            !rawAllocation ||
            typeof rawAllocation !== 'object' ||
            Array.isArray(rawAllocation)
          ) {
            continue;
          }

          const allocation = rawAllocation as Record<string, unknown>;
          const quoteItemId =
            typeof allocation.quoteItemId === 'string' ? allocation.quoteItemId : null;
          const quantity =
            typeof allocation.quantity === 'number' && Number.isFinite(allocation.quantity)
              ? Number(allocation.quantity)
              : null;

          if (!quoteItemId || quantity === null) {
            continue;
          }

          returnedQtyByQuoteItem.set(
            quoteItemId,
            (returnedQtyByQuoteItem.get(quoteItemId) ?? 0) + quantity,
          );
        }
      }

      const returnNumber = await this.generateReturnNumber(tenantId);

      const returnItemsCreateData = dto.items.map((item) => {
        const product = productById.get(item.productId)!;
        const lineTotal = this.round2(item.quantity * item.unitPrice);

        if (!sourceQuote) {
          return {
            productId: item.productId,
            productName: product.name,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            lineTotal: new Prisma.Decimal(lineTotal),
            taxableAmount: new Prisma.Decimal(lineTotal),
            taxAmount: new Prisma.Decimal(0),
            igstAmount: new Prisma.Decimal(0),
            cgstAmount: new Prisma.Decimal(0),
            sgstAmount: new Prisma.Decimal(0),
            appliedTaxType: 'NONE' as const,
            sourceTaxSnapshot: Prisma.JsonNull,
            restockToInventory: item.restockToInventory ?? true,
          };
        }

        const candidateQuoteItems = sourceQuote.items
          .filter((quoteItem) => quoteItem.productId === item.productId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        let remainingQty = item.quantity;
        const allocations: Array<{
          quoteItemId: string;
          quantity: number;
          sourceQuantity: number;
          sourceLineTotal: number;
          sourceTaxableAmount: number;
          sourceTaxAmount: number;
          sourceIgstAmount: number;
          sourceCgstAmount: number;
          sourceSgstAmount: number;
          gstRateApplied: number;
          taxClassificationCode: string | null;
          appliedTaxType: string;
        }> = [];

        for (const quoteItem of candidateQuoteItems) {
          if (remainingQty <= 0) {
            break;
          }

          const sourceQuantity = Number(quoteItem.quantity);
          const alreadyReturned = returnedQtyByQuoteItem.get(quoteItem.id) ?? 0;
          const availableQty = this.round2(Math.max(sourceQuantity - alreadyReturned, 0));

          if (availableQty <= 0) {
            continue;
          }

          const allocatedQty = this.round2(Math.min(availableQty, remainingQty));

          allocations.push({
            quoteItemId: quoteItem.id,
            quantity: allocatedQty,
            sourceQuantity,
            sourceLineTotal: Number(quoteItem.lineTotal),
            sourceTaxableAmount: Number(quoteItem.taxableAmount),
            sourceTaxAmount: Number(quoteItem.taxAmount),
            sourceIgstAmount: Number(quoteItem.igstAmount),
            sourceCgstAmount: Number(quoteItem.cgstAmount),
            sourceSgstAmount: Number(quoteItem.sgstAmount),
            gstRateApplied: Number(quoteItem.gstRateApplied),
            taxClassificationCode: quoteItem.taxClassificationCode,
            appliedTaxType: quoteItem.appliedTaxType,
          });

          returnedQtyByQuoteItem.set(
            quoteItem.id,
            this.round2(alreadyReturned + allocatedQty),
          );

          remainingQty = this.round2(remainingQty - allocatedQty);
        }

        if (remainingQty > 0) {
          throw new BadRequestException(
            `Unable to resolve source quote item allocation for ${item.productId}`,
          );
        }

        const allocatedSourceLineTotal = this.round2(
          allocations.reduce(
            (sum, allocation) =>
              sum +
              (allocation.sourceLineTotal * allocation.quantity) /
                allocation.sourceQuantity,
            0,
          ),
        );

        const valueRatio =
          allocatedSourceLineTotal > 0
            ? Math.min(this.round2(lineTotal / allocatedSourceLineTotal), 1)
            : 0;

        const sourceTaxable = this.round2(
          allocations.reduce(
            (sum, allocation) =>
              sum +
              (allocation.sourceTaxableAmount * allocation.quantity) /
                allocation.sourceQuantity,
            0,
          ),
        );
        const sourceTax = this.round2(
          allocations.reduce(
            (sum, allocation) =>
              sum +
              (allocation.sourceTaxAmount * allocation.quantity) /
                allocation.sourceQuantity,
            0,
          ),
        );
        const sourceIgst = this.round2(
          allocations.reduce(
            (sum, allocation) =>
              sum +
              (allocation.sourceIgstAmount * allocation.quantity) /
                allocation.sourceQuantity,
            0,
          ),
        );
        const sourceCgst = this.round2(
          allocations.reduce(
            (sum, allocation) =>
              sum +
              (allocation.sourceCgstAmount * allocation.quantity) /
                allocation.sourceQuantity,
            0,
          ),
        );
        const sourceSgst = this.round2(
          allocations.reduce(
            (sum, allocation) =>
              sum +
              (allocation.sourceSgstAmount * allocation.quantity) /
                allocation.sourceQuantity,
            0,
          ),
        );

        const taxableAmount = this.round2(sourceTaxable * valueRatio);
        const taxAmount = this.round2(sourceTax * valueRatio);

        const majorityType = allocations.find(
          (allocation) => allocation.appliedTaxType !== 'NONE',
        )?.appliedTaxType;

        let igstAmount = 0;
        let cgstAmount = 0;
        let sgstAmount = 0;
        let appliedTaxType: 'NONE' | 'IGST' | 'CGST_SGST' | 'MIXED' = 'NONE';

        if (majorityType === 'IGST') {
          igstAmount = taxAmount;
          appliedTaxType = 'IGST';
        } else if (majorityType === 'CGST_SGST') {
          cgstAmount = this.round2(taxAmount / 2);
          sgstAmount = this.round2(taxAmount - cgstAmount);
          appliedTaxType = 'CGST_SGST';
        } else {
          igstAmount = this.round2(sourceIgst * valueRatio);
          cgstAmount = this.round2(sourceCgst * valueRatio);
          sgstAmount = this.round2(sourceSgst * valueRatio);
          const sumComponents = this.round2(igstAmount + cgstAmount + sgstAmount);
          const diff = this.round2(taxAmount - sumComponents);
          if (diff !== 0) {
            igstAmount = this.round2(igstAmount + diff);
          }
          const hasIgst = igstAmount > 0;
          const hasSplit = cgstAmount > 0 || sgstAmount > 0;
          appliedTaxType = hasIgst && hasSplit ? 'MIXED' : hasIgst ? 'IGST' : hasSplit ? 'CGST_SGST' : 'NONE';
        }

        return {
          productId: item.productId,
          productName: product.name,
          quantity: new Prisma.Decimal(item.quantity),
          unitPrice: new Prisma.Decimal(item.unitPrice),
          lineTotal: new Prisma.Decimal(lineTotal),
          taxableAmount: new Prisma.Decimal(taxableAmount),
          taxAmount: new Prisma.Decimal(taxAmount),
          igstAmount: new Prisma.Decimal(igstAmount),
          cgstAmount: new Prisma.Decimal(cgstAmount),
          sgstAmount: new Prisma.Decimal(sgstAmount),
          appliedTaxType,
          sourceTaxSnapshot: {
            sourceQuoteId: sourceQuote.id,
            sourceQuoteNumber: sourceQuote.quoteNumber,
            returnLineTotal: lineTotal,
            allocatedSourceLineTotal,
            valueRatio,
            allocations,
          } as Prisma.InputJsonValue,
          restockToInventory: item.restockToInventory ?? true,
        };
      }) as Prisma.ProductReturnItemUncheckedCreateWithoutProductReturnInput[];

      return tx.productReturn.create({
        data: {
          tenantId,
          returnNumber,
          type: dto.type,
          quoteId: dto.quoteId,
          purchaseOrderId: dto.purchaseOrderId,
          customerId: dto.customerId,
          reason: dto.reason,
          notes: dto.notes,
          createdById: userId,
          items: {
            create: returnItemsCreateData,
          },
        },
        include: {
          items: true,
        },
      });
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.productReturn.findMany({
      where: { tenantId },
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const productReturn = await this.prisma.productReturn.findFirst({
      where: {
        tenantId,
        id,
      },
      include: {
        items: true,
      },
    });

    if (!productReturn) {
      throw new NotFoundException('Return not found');
    }

    return productReturn;
  }

  async updateStatus(
    tenantId: string,
    userId: string,
    id: string,
    status: ProductReturnStatus,
  ) {
    const updatedReturn = await this.prisma.$transaction(async (tx) => {
      const productReturn = await tx.productReturn.findFirst({
        where: {
          tenantId,
          id,
        },
        include: {
          items: true,
        },
      });

      if (!productReturn) {
        throw new NotFoundException('Return not found');
      }

      if (productReturn.status === status) {
        return productReturn;
      }

      const allowed = this.allowedStatusTransitions[productReturn.status];

      if (!allowed.includes(status)) {
        throw new BadRequestException(
          `Invalid return status transition from ${productReturn.status} to ${status}`,
        );
      }

      if (
        productReturn.status === ProductReturnStatus.COMPLETED &&
        status === ProductReturnStatus.COMPLETED
      ) {
        throw new BadRequestException('Return already completed');
      }

      if (
        status === ProductReturnStatus.COMPLETED &&
        productReturn.status !== ProductReturnStatus.APPROVED
      ) {
        throw new BadRequestException(
          'Only APPROVED returns can be moved to COMPLETED',
        );
      }

      if (status === ProductReturnStatus.COMPLETED) {
        for (const item of productReturn.items) {
          if (!item.restockToInventory) {
            continue;
          }

          if (productReturn.type === ProductReturnType.SALES_RETURN) {
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
                onHand: item.quantity,
                reserved: new Prisma.Decimal(0),
                reorderLevel: new Prisma.Decimal(0),
              },
              update: {
                onHand: {
                  increment: item.quantity,
                },
              },
            });

            await tx.inventoryLedgerEntry.create({
              data: {
                tenantId,
                stockId: stock.id,
                productId: item.productId,
                movementType: InventoryMovementType.ADJUST_IN,
                quantity: item.quantity,
                referenceType: InventoryReferenceType.RETURN,
                referenceId: productReturn.id,
                note: `Sales return completed: ${productReturn.returnNumber}`,
                createdById: userId,
              },
            });
          }

          if (productReturn.type === ProductReturnType.PURCHASE_RETURN) {
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
                `Inventory stock not initialized for product ${item.productName}`,
              );
            }

            const currentOnHand = Number(stock.onHand);
            const currentReserved = Number(stock.reserved);
            const returnQty = Number(item.quantity);
            const nextOnHand = currentOnHand - returnQty;

            if (nextOnHand < 0) {
              throw new BadRequestException(
                `Insufficient on-hand stock for purchase return: ${item.productName}`,
              );
            }

            if (nextOnHand < currentReserved) {
              throw new BadRequestException(
                `Cannot reduce stock below reserved quantity for ${item.productName}`,
              );
            }

            const updatedStock = await tx.inventoryStock.update({
              where: {
                id: stock.id,
              },
              data: {
                onHand: new Prisma.Decimal(nextOnHand),
              },
            });

            await tx.inventoryLedgerEntry.create({
              data: {
                tenantId,
                stockId: updatedStock.id,
                productId: item.productId,
                movementType: InventoryMovementType.ADJUST_OUT,
                quantity: item.quantity,
                referenceType: InventoryReferenceType.RETURN,
                referenceId: productReturn.id,
                note: `Purchase return completed: ${productReturn.returnNumber}`,
                createdById: userId,
              },
            });
          }
        }
      }

      return tx.productReturn.update({
        where: {
          id: productReturn.id,
        },
        data: {
          status,
          processedAt: status === ProductReturnStatus.COMPLETED ? new Date() : null,
        },
        include: {
          items: true,
        },
      });
    });

    if (
      updatedReturn.status === ProductReturnStatus.COMPLETED &&
      updatedReturn.type === ProductReturnType.SALES_RETURN
    ) {
      await this.commissionsService.createReversalForCompletedSalesReturn(
        tenantId,
        updatedReturn.id,
      );
    }

    return updatedReturn;
  }
}
