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
import { CreateProductReturnDto } from './dto/create-product-return.dto';

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

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
          customerId: true,
          items: {
            select: {
              productId: true,
              quantity: true,
            },
          },
        },
      });

      if (!quote) {
        throw new BadRequestException('Quote not found');
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

    const returnNumber = await this.generateReturnNumber(tenantId);

    return this.prisma.productReturn.create({
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
          create: dto.items.map((item) => {
            const product = productById.get(item.productId)!;
            const lineTotal = item.quantity * item.unitPrice;

            return {
              productId: item.productId,
              productName: product.name,
              quantity: new Prisma.Decimal(item.quantity),
              unitPrice: new Prisma.Decimal(item.unitPrice),
              lineTotal: new Prisma.Decimal(lineTotal),
              restockToInventory: item.restockToInventory ?? true,
            };
          }),
        },
      },
      include: {
        items: true,
      },
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
    return this.prisma.$transaction(async (tx) => {
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
  }
}
