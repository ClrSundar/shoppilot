import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

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

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    return this.prisma.productCategory.update({
      where: {
        id,
        tenantId,
      },
      data: dto,
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

    return this.prisma.productCategory.update({
      where: {
        id,
        tenantId,
      },
      data: {
        active: false,
      },
    });
  }
}
