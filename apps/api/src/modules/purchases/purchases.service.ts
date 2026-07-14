import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  InventoryReferenceType,
  Prisma,
  PurchaseOrderStatus,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly allowedStatusTransitions: Record<
    PurchaseOrderStatus,
    PurchaseOrderStatus[]
  > = {
    DRAFT: [PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.CANCELLED],
    ORDERED: [
      PurchaseOrderStatus.PARTIALLY_RECEIVED,
      PurchaseOrderStatus.RECEIVED,
      PurchaseOrderStatus.CANCELLED,
    ],
    PARTIALLY_RECEIVED: [
      PurchaseOrderStatus.RECEIVED,
      PurchaseOrderStatus.CANCELLED,
    ],
    RECEIVED: [],
    CANCELLED: [],
  };

  private async generateOrderNumber(tenantId: string) {
    const count = await this.prisma.purchaseOrder.count({
      where: { tenantId },
    });

    return `PO-${String(count + 1).padStart(5, '0')}`;
  }

  async create(tenantId: string, userId: string, dto: CreatePurchaseOrderDto) {
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

    const subtotal = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitCost,
      0,
    );
    const taxPercentage = dto.taxPercentage ?? 0;
    const taxAmount = subtotal * (taxPercentage / 100);
    const totalAmount = subtotal + taxAmount;

    const orderNumber = await this.generateOrderNumber(tenantId);

    return this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        orderNumber,
        status: PurchaseOrderStatus.ORDERED,
        supplierName: dto.supplierName,
        supplierPhone: dto.supplierPhone,
        supplierEmail: dto.supplierEmail,
        supplierGstNumber: dto.supplierGstNumber,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        notes: dto.notes,
        subtotal: new Prisma.Decimal(subtotal),
        taxAmount: new Prisma.Decimal(taxAmount),
        totalAmount: new Prisma.Decimal(totalAmount),
        createdById: userId,
        items: {
          create: dto.items.map((item) => {
            const product = productById.get(item.productId)!;
            const lineTotal = item.quantity * item.unitCost;

            return {
              productId: item.productId,
              productName: product.name,
              quantity: new Prisma.Decimal(item.quantity),
              unitCost: new Prisma.Decimal(item.unitCost),
              lineTotal: new Prisma.Decimal(lineTotal),
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
    return this.prisma.purchaseOrder.findMany({
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
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: {
        tenantId,
        id,
      },
      include: {
        items: true,
      },
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    return purchaseOrder;
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: PurchaseOrderStatus,
  ) {
    const purchaseOrder = await this.findOne(tenantId, id);

    if (purchaseOrder.status === status) {
      return purchaseOrder;
    }

    const allowed = this.allowedStatusTransitions[purchaseOrder.status];

    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Invalid purchase order status transition from ${purchaseOrder.status} to ${status}`,
      );
    }

    if (status === PurchaseOrderStatus.RECEIVED) {
      const allReceived = purchaseOrder.items.every(
        (item) => Number(item.receivedQuantity) >= Number(item.quantity),
      );

      if (!allReceived) {
        throw new BadRequestException(
          'Cannot mark as RECEIVED until all line items are fully received',
        );
      }
    }

    if (
      status === PurchaseOrderStatus.CANCELLED &&
      purchaseOrder.items.some((item) => Number(item.receivedQuantity) > 0)
    ) {
      throw new BadRequestException(
        'Cannot cancel a purchase order that has already received quantities',
      );
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status,
        receivedAt: status === PurchaseOrderStatus.RECEIVED ? new Date() : null,
      },
      include: {
        items: true,
      },
    });
  }

  async receive(
    tenantId: string,
    userId: string,
    id: string,
    dto: ReceivePurchaseOrderDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findFirst({
        where: {
          tenantId,
          id,
        },
        include: {
          items: true,
        },
      });

      if (!purchaseOrder) {
        throw new NotFoundException('Purchase order not found');
      }

      if (purchaseOrder.status === PurchaseOrderStatus.CANCELLED) {
        throw new BadRequestException('Cancelled purchase order cannot be received');
      }

      if (purchaseOrder.status === PurchaseOrderStatus.RECEIVED) {
        throw new BadRequestException('Purchase order already received');
      }

      const inputByItemId = new Map(
        (dto.items ?? []).map((item) => [item.purchaseOrderItemId, item]),
      );

      for (const item of purchaseOrder.items) {
        const currentReceived = Number(item.receivedQuantity);
        const ordered = Number(item.quantity);
        const remaining = ordered - currentReceived;

        if (remaining <= 0) {
          continue;
        }

        const input = inputByItemId.get(item.id);
        const receiveQty = input ? input.receivedQuantity : remaining;

        if (receiveQty <= 0) {
          continue;
        }

        if (receiveQty > remaining) {
          throw new BadRequestException(
            `Received quantity exceeds remaining for item ${item.productName}`,
          );
        }

        await tx.purchaseOrderItem.update({
          where: {
            id: item.id,
          },
          data: {
            receivedQuantity: {
              increment: new Prisma.Decimal(receiveQty),
            },
          },
        });

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
            onHand: new Prisma.Decimal(receiveQty),
            reserved: new Prisma.Decimal(0),
            reorderLevel: new Prisma.Decimal(0),
          },
          update: {
            onHand: {
              increment: new Prisma.Decimal(receiveQty),
            },
          },
        });

        await tx.inventoryLedgerEntry.create({
          data: {
            tenantId,
            stockId: stock.id,
            productId: item.productId,
            movementType: InventoryMovementType.IN,
            quantity: new Prisma.Decimal(receiveQty),
            referenceType: InventoryReferenceType.ORDER,
            referenceId: purchaseOrder.id,
            note: dto.note || `Received against purchase order ${purchaseOrder.orderNumber}`,
            createdById: userId,
          },
        });
      }

      const refreshedItems = await tx.purchaseOrderItem.findMany({
        where: {
          purchaseOrderId: purchaseOrder.id,
        },
      });

      const allReceived = refreshedItems.every(
        (item) => Number(item.receivedQuantity) >= Number(item.quantity),
      );
      const anyReceived = refreshedItems.some(
        (item) => Number(item.receivedQuantity) > 0,
      );

      const nextStatus = allReceived
        ? PurchaseOrderStatus.RECEIVED
        : anyReceived
          ? PurchaseOrderStatus.PARTIALLY_RECEIVED
          : purchaseOrder.status;

      return tx.purchaseOrder.update({
        where: {
          id: purchaseOrder.id,
        },
        data: {
          status: nextStatus,
          receivedAt: allReceived ? new Date() : null,
        },
        include: {
          items: true,
        },
      });
    });
  }
}
