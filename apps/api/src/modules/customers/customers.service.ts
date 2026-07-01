import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { getStringCell, parseExcelRows } from '../../common/utils/excel.util';

import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async bulkUpload(tenantId: string, file: Express.Multer.File) {
    const rows = parseExcelRows(file);

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      const name = getStringCell(row, ['name', 'customername', 'customer']);

      if (!name) {
        skipped += 1;
        errors.push(`Row ${index + 2}: Name is required`);
        continue;
      }

      await this.prisma.customer.create({
        data: {
          tenantId,
          name,
          phone: getStringCell(row, ['phone', 'phonenumber']) || undefined,
          whatsappNumber:
            getStringCell(row, ['whatsappnumber', 'whatsapp']) || undefined,
          email: getStringCell(row, ['email']) || undefined,
          address: getStringCell(row, ['address']) || undefined,
          gstNumber: getStringCell(row, ['gstnumber', 'gst']) || undefined,
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

  async create(tenantId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        tenantId,

        name: dto.name,
        phone: dto.phone,
        whatsappNumber: dto.whatsappNumber,
        email: dto.email,
        address: dto.address,
        gstNumber: dto.gstNumber,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.customer.findMany({
      where: {
        tenantId,
        active: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(tenantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        tenantId,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async update(tenantId: string, id: string, dto: UpdateCustomerDto) {
    return this.prisma.customer.update({
      where: {
        id,
        tenantId,
      },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.customer.update({
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
