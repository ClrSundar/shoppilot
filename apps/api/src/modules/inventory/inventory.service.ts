import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  InventoryReferenceType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

import { InitializeStockDto } from './dto/initialize-stock.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async initializeStock(
    tenantId: string,
    userId: string,
    dto: InitializeStockDto,
  ) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: dto.productId,
        tenantId,
        active: true,
      },
    });

    if (!product) {
      throw new BadRequestException('Product not found');
    }

    const existingStock = await this.prisma.inventoryStock.findUnique({
      where: {
        tenantId_productId: {
          tenantId,
          productId: dto.productId,
        },
      },
    });

    if (existingStock) {
      throw new BadRequestException('Stock already initialized for this product');
    }

    const openingStock = dto.openingStock ?? 0;
    const reorderLevel = dto.reorderLevel ?? 0;

    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.inventoryStock.create({
        data: {
          tenantId,
          productId: dto.productId,
          onHand: openingStock,
          reorderLevel,
        },
        include: {
          product: {
            include: {
              category: true,
            },
          },
        },
      });

      if (openingStock > 0) {
        await tx.inventoryLedgerEntry.create({
          data: {
            tenantId,
            stockId: stock.id,
            productId: dto.productId,
            movementType: InventoryMovementType.IN,
            quantity: openingStock,
            referenceType: InventoryReferenceType.MANUAL,
            note: dto.note || 'Opening stock initialization',
            createdById: userId,
          },
        });
      }

      return stock;
    });
  }

  async findAllStocks(tenantId: string) {
    return this.prisma.inventoryStock.findMany({
      where: {
        tenantId,
        active: true,
      },
      include: {
        product: {
          include: {
            category: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async findStockByProduct(tenantId: string, productId: string) {
    const stock = await this.prisma.inventoryStock.findFirst({
      where: {
        tenantId,
        productId,
        active: true,
      },
      include: {
        product: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!stock) {
      throw new NotFoundException('Inventory stock not found for this product');
    }

    return stock;
  }

  async adjustStock(tenantId: string, userId: string, dto: AdjustInventoryDto) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: dto.productId,
        tenantId,
        active: true,
      },
    });

    if (!product) {
      throw new BadRequestException('Product not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.inventoryStock.upsert({
        where: {
          tenantId_productId: {
            tenantId,
            productId: dto.productId,
          },
        },
        create: {
          tenantId,
          productId: dto.productId,
          onHand: 0,
          reserved: 0,
          reorderLevel: 0,
        },
        update: {},
      });

      const currentOnHand = Number(stock.onHand);
      const currentReserved = Number(stock.reserved);
      const quantity = Number(dto.quantity);

      let nextOnHand = currentOnHand;
      let nextReserved = currentReserved;

      if (
        dto.movementType === InventoryMovementType.IN ||
        dto.movementType === InventoryMovementType.ADJUST_IN
      ) {
        nextOnHand += quantity;
      }

      if (
        dto.movementType === InventoryMovementType.OUT ||
        dto.movementType === InventoryMovementType.ADJUST_OUT
      ) {
        nextOnHand -= quantity;

        if (nextOnHand < 0) {
          throw new BadRequestException('Insufficient on-hand stock');
        }

        if (nextOnHand < currentReserved) {
          throw new BadRequestException(
            'Cannot reduce on-hand stock below reserved quantity',
          );
        }
      }

      if (dto.movementType === InventoryMovementType.RESERVE) {
        const available = currentOnHand - currentReserved;

        if (available < quantity) {
          throw new BadRequestException('Insufficient available stock to reserve');
        }

        nextReserved += quantity;
      }

      if (dto.movementType === InventoryMovementType.RELEASE) {
        if (currentReserved < quantity) {
          throw new BadRequestException('Insufficient reserved stock to release');
        }

        nextReserved -= quantity;
      }

      const updatedStock = await tx.inventoryStock.update({
        where: {
          id: stock.id,
        },
        data: {
          onHand: new Prisma.Decimal(nextOnHand),
          reserved: new Prisma.Decimal(nextReserved),
        },
        include: {
          product: {
            include: {
              category: true,
            },
          },
        },
      });

      const ledgerEntry = await tx.inventoryLedgerEntry.create({
        data: {
          tenantId,
          stockId: stock.id,
          productId: dto.productId,
          movementType: dto.movementType,
          quantity: dto.quantity,
          referenceType: dto.referenceType || InventoryReferenceType.MANUAL,
          referenceId: dto.referenceId,
          note: dto.note,
          createdById: userId,
        },
      });

      return {
        stock: updatedStock,
        ledgerEntry,
      };
    });
  }

  async listLedger(tenantId: string, productId?: string) {
    return this.prisma.inventoryLedgerEntry.findMany({
      where: {
        tenantId,
        productId,
      },
      include: {
        product: true,
        stock: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });
  }
}
