import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { getStringCell, parseExcelRows } from '../../common/utils/excel.util';

import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async bulkUpload(tenantId: string, file: Express.Multer.File) {
    const rows = parseExcelRows(file);

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      const name = getStringCell(row, ['name', 'categoryname', 'category']);
      const description = getStringCell(row, ['description']);

      if (!name) {
        skipped += 1;
        errors.push(`Row ${index + 2}: Name is required`);
        continue;
      }

      const existing = await this.prisma.productCategory.findFirst({
        where: { tenantId, name },
      });

      if (existing) {
        skipped += 1;
        errors.push(`Row ${index + 2}: Category '${name}' already exists`);
        continue;
      }

      await this.prisma.productCategory.create({
        data: {
          tenantId,
          name,
          description: description || undefined,
        },
      });

      created += 1;
    }

    return {
      totalRows: rows.length,
      created,
      skipped,
      errors,
    };
  }

  async create(tenantId: string, dto: CreateCategoryDto) {
    const existing = await this.prisma.productCategory.findFirst({
      where: {
        tenantId,
        name: dto.name,
      },
    });

    if (existing) {
      throw new BadRequestException('Category already exists');
    }

    return this.prisma.productCategory.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.productCategory.findMany({
      where: {
        tenantId,
        active: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findArchived(tenantId: string) {
    const categories = await this.prisma.productCategory.findMany({
      where: {
        tenantId,
        active: false,
      },
      include: {
        products: {
          select: {
            id: true,
            active: true,
            inventoryStocks: {
              select: {
                onHand: true,
                reserved: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return categories.map(({ products, ...category }) => {
      let totalOnHand = 0;
      let totalReserved = 0;

      for (const product of products) {
        for (const stock of product.inventoryStocks) {
          totalOnHand += Number(stock.onHand);
          totalReserved += Number(stock.reserved);
        }
      }

      return {
        ...category,
        productsCount: products.length,
        activeProductsCount: products.filter((product) => product.active).length,
        stockSummary: {
          onHand: totalOnHand,
          reserved: totalReserved,
          available: totalOnHand - totalReserved,
        },
      };
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    return this.prisma.productCategory.update({
      where: {
        id,
        tenantId,
      },
      data: dto,
    });
  }

  async restore(tenantId: string, id: string) {
    const category = await this.prisma.productCategory.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return this.prisma.productCategory.update({
      where: {
        id,
        tenantId,
      },
      data: {
        active: true,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const category = await this.prisma.productCategory.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: {
          tenantId,
          categoryId: id,
        },
        select: {
          id: true,
        },
      });

      const productIds = products.map((product) => product.id);

      await tx.product.updateMany({
        where: {
          tenantId,
          categoryId: id,
        },
        data: {
          active: false,
        },
      });

      if (productIds.length > 0) {
        await tx.inventoryStock.updateMany({
          where: {
            tenantId,
            productId: {
              in: productIds,
            },
          },
          data: {
            active: false,
          },
        });
      }

      return tx.productCategory.update({
        where: {
          id,
          tenantId,
        },
        data: {
          active: false,
        },
      });
    });
  }
}
