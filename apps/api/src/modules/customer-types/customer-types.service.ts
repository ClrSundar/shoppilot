import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCustomerTypeDto } from './dto/create-customer-type.dto';
import { UpdateCustomerTypeDto } from './dto/update-customer-type.dto';

@Injectable()
export class CustomerTypesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCode(code: string) {
    return code.trim().toUpperCase().replace(/\s+/g, '_');
  }

  private normalizeName(name: string) {
    return name.trim();
  }

  async create(tenantId: string, dto: CreateCustomerTypeDto) {
    const code = this.normalizeCode(dto.code);

    const existing = await this.prisma.customerType.findUnique({
      where: {
        tenantId_code: {
          tenantId,
          code,
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new BadRequestException('Customer type code already exists');
    }

    return this.prisma.customerType.create({
      data: {
        tenantId,
        code,
        name: this.normalizeName(dto.name),
        defaultDiscountPercentage: new Prisma.Decimal(
          dto.defaultDiscountPercentage ?? 0,
        ),
        creditDays: dto.creditDays,
        creditLimit:
          dto.creditLimit !== undefined
            ? new Prisma.Decimal(dto.creditLimit)
            : undefined,
        priceListId: dto.priceListId,
        active: dto.active ?? true,
      },
      include: {
        _count: {
          select: {
            customers: true,
          },
        },
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.customerType.findMany({
      where: {
        tenantId,
      },
      include: {
        _count: {
          select: {
            customers: true,
          },
        },
      },
      orderBy: [
        {
          active: 'desc',
        },
        {
          name: 'asc',
        },
      ],
    });
  }

  async findOne(tenantId: string, id: string) {
    const customerType = await this.prisma.customerType.findFirst({
      where: {
        tenantId,
        id,
      },
      include: {
        customers: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            active: true,
          },
          take: 20,
          orderBy: {
            name: 'asc',
          },
        },
        _count: {
          select: {
            customers: true,
          },
        },
      },
    });

    if (!customerType) {
      throw new NotFoundException('Customer type not found');
    }

    return customerType;
  }

  async update(tenantId: string, id: string, dto: UpdateCustomerTypeDto) {
    const existing = await this.prisma.customerType.findFirst({
      where: {
        id,
        tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Customer type not found');
    }

    const normalizedCode =
      dto.code !== undefined ? this.normalizeCode(dto.code) : undefined;

    if (normalizedCode) {
      const duplicate = await this.prisma.customerType.findFirst({
        where: {
          tenantId,
          code: normalizedCode,
          id: {
            not: id,
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicate) {
        throw new BadRequestException('Customer type code already exists');
      }
    }

    return this.prisma.customerType.update({
      where: {
        id,
      },
      data: {
        ...(normalizedCode ? { code: normalizedCode } : {}),
        ...(dto.name !== undefined ? { name: this.normalizeName(dto.name) } : {}),
        ...(dto.defaultDiscountPercentage !== undefined
          ? {
              defaultDiscountPercentage: new Prisma.Decimal(
                dto.defaultDiscountPercentage,
              ),
            }
          : {}),
        ...(dto.creditDays !== undefined ? { creditDays: dto.creditDays } : {}),
        ...(dto.creditLimit !== undefined
          ? { creditLimit: new Prisma.Decimal(dto.creditLimit) }
          : {}),
        ...(dto.priceListId !== undefined ? { priceListId: dto.priceListId } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      include: {
        _count: {
          select: {
            customers: true,
          },
        },
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.customerType.findFirst({
      where: {
        id,
        tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Customer type not found');
    }

    return this.prisma.customerType.update({
      where: {
        id,
      },
      data: {
        active: false,
      },
      include: {
        _count: {
          select: {
            customers: true,
          },
        },
      },
    });
  }
}
