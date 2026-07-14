import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateSupplierDto) {
    const existing = await this.prisma.supplier.findFirst({
      where: {
        tenantId,
        name: dto.name,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new BadRequestException('Supplier with same name already exists');
    }

    return this.prisma.supplier.create({
      data: {
        tenantId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        gstNumber: dto.gstNumber,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.supplier.findMany({
      where: {
        tenantId,
        active: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return supplier;
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto) {
    await this.findOne(tenantId, id);

    if (dto.name) {
      const duplicate = await this.prisma.supplier.findFirst({
        where: {
          tenantId,
          name: dto.name,
          id: {
            not: id,
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicate) {
        throw new BadRequestException('Supplier with same name already exists');
      }
    }

    return this.prisma.supplier.update({
      where: {
        id,
      },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    const supplier = await this.findOne(tenantId, id);

    const linkedPoCount = await this.prisma.purchaseOrder.count({
      where: {
        tenantId,
        supplierId: id,
      },
    });

    if (linkedPoCount > 0) {
      return this.prisma.supplier.update({
        where: {
          id: supplier.id,
        },
        data: {
          active: false,
        },
      });
    }

    return this.prisma.supplier.delete({
      where: {
        id: supplier.id,
      },
    });
  }
}
