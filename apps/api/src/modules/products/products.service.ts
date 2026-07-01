import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import {
  getNumberCell,
  getStringCell,
  parseExcelRows,
} from '../../common/utils/excel.util';

import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async bulkUpload(tenantId: string, file: Express.Multer.File) {
    const rows = parseExcelRows(file);

    const categories = await this.prisma.productCategory.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true },
    });

    const categoriesByName = new Map(
      categories.map((category) => [category.name.toLowerCase(), category.id]),
    );
    const categoriesById = new Set(categories.map((category) => category.id));

    // Fetch existing products for duplicate checking
    const existingProducts = await this.prisma.product.findMany({
      where: { tenantId, active: true },
      select: { name: true, sku: true },
    });

    const productNameSet = new Set(
      existingProducts.map((p) => p.name.toLowerCase()),
    );
    const productSkuSet = new Set(
      existingProducts.filter((p) => p.sku).map((p) => p.sku!.toLowerCase()),
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      const name = getStringCell(row, ['name', 'productname', 'product']);
      const categoryIdCell = getStringCell(row, ['categoryid']);
      const categoryName = getStringCell(row, ['category', 'categoryname']);
      const costPrice = getNumberCell(row, ['costprice', 'cost']);
      const sellingPrice = getNumberCell(row, ['sellingprice', 'price', 'mrp']);
      const sku = getStringCell(row, ['sku']) || undefined;

      if (!name || costPrice === null || sellingPrice === null) {
        skipped += 1;
        errors.push(
          `Row ${index + 2}: name, costPrice and sellingPrice are required`,
        );
        continue;
      }

      // Check for duplicate product name
      if (productNameSet.has(name.toLowerCase())) {
        skipped += 1;
        errors.push(`Row ${index + 2}: Product '${name}' already exists`);
        continue;
      }

      // Check for duplicate SKU if provided
      if (sku && productSkuSet.has(sku.toLowerCase())) {
        skipped += 1;
        errors.push(
          `Row ${index + 2}: Product with SKU '${sku}' already exists`,
        );
        continue;
      }

      let categoryId = '';
      if (categoryIdCell && categoriesById.has(categoryIdCell)) {
        categoryId = categoryIdCell;
      } else if (categoryName) {
        categoryId = categoriesByName.get(categoryName.toLowerCase()) ?? '';
      }

      if (!categoryId) {
        skipped += 1;
        errors.push(
          `Row ${index + 2}: valid categoryId or category name is required`,
        );
        continue;
      }

      await this.prisma.product.create({
        data: {
          tenantId,
          categoryId,
          name,
          sku,
          brand: getStringCell(row, ['brand']) || undefined,
          unit: getStringCell(row, ['unit']) || 'NOS',
          costPrice,
          sellingPrice,
          imageUrl: getStringCell(row, ['imageurl', 'image']) || undefined,
        },
      });

      // Add to sets to prevent duplicates within this batch
      productNameSet.add(name.toLowerCase());
      if (sku) {
        productSkuSet.add(sku.toLowerCase());
      }

      created += 1;
    }

    return {
      totalRows: rows.length,
      created,
      skipped,
      errors,
    };
  }

  async create(tenantId: string, dto: CreateProductDto) {
    const category = await this.prisma.productCategory.findFirst({
      where: {
        id: dto.categoryId,
        tenantId,
      },
    });

    if (!category) {
      throw new BadRequestException('Invalid category');
    }

    return this.prisma.product.create({
      data: {
        tenantId,

        categoryId: dto.categoryId,

        name: dto.name,

        sku: dto.sku,

        brand: dto.brand,

        unit: dto.unit || 'NOS',

        costPrice: dto.costPrice,

        sellingPrice: dto.sellingPrice,

        imageUrl: dto.imageUrl,
      },
      include: {
        category: true,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.product.findMany({
      where: {
        tenantId,
        active: true,
      },
      include: {
        category: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        tenantId,
      },
      include: {
        category: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    const existingProduct = await this.prisma.product.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found');
    }

    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findFirst({
        where: {
          id: dto.categoryId,
          tenantId,
        },
      });

      if (!category) {
        throw new BadRequestException('Invalid category');
      }
    }

    return this.prisma.product.update({
      where: {
        id,
        tenantId,
      },
      data: dto,
      include: {
        category: true,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.product.update({
      where: {
        id,
        tenantId,
      },
      data: {
        active: false,
      },
      include: {
        category: true,
      },
    });
  }
}
