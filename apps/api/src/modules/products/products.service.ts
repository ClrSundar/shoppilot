import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
