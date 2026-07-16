import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { getStringCell, parseExcelRows } from '../../common/utils/excel.util';

import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async bulkUpload(tenantId: string, file: any) {
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
    if (dto.customerTypeId) {
      const customerType = await this.prisma.customerType.findFirst({
        where: {
          id: dto.customerTypeId,
          tenantId,
          active: true,
        },
        select: {
          id: true,
        },
      });

      if (!customerType) {
        throw new BadRequestException('Customer type not found');
      }
    }

    return this.prisma.customer.create({
      data: {
        tenantId,

        name: dto.name,
        phone: dto.phone,
        whatsappNumber: dto.whatsappNumber,
        email: dto.email,
        address: dto.address,
        gstNumber: dto.gstNumber,
        customerTypeId: dto.customerTypeId,
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
    if (dto.customerTypeId) {
      const customerType = await this.prisma.customerType.findFirst({
        where: {
          id: dto.customerTypeId,
          tenantId,
          active: true,
        },
        select: {
          id: true,
        },
      });

      if (!customerType) {
        throw new BadRequestException('Customer type not found');
      }
    }

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

  async mergeCustomers(
    tenantId: string,
    sourceCustomerId: string,
    targetCustomerId: string,
  ) {
    if (sourceCustomerId === targetCustomerId) {
      throw new BadRequestException('Source and target customers must differ');
    }

    const [source, target] = await Promise.all([
      this.prisma.customer.findFirst({
        where: {
          id: sourceCustomerId,
          tenantId,
        },
      }),
      this.prisma.customer.findFirst({
        where: {
          id: targetCustomerId,
          tenantId,
        },
      }),
    ]);

    if (!source) {
      throw new NotFoundException('Source customer not found');
    }

    if (!target) {
      throw new NotFoundException('Target customer not found');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const quoteResult = await tx.quote.updateMany({
        where: {
          tenantId,
          customerId: sourceCustomerId,
        },
        data: {
          customerId: targetCustomerId,
        },
      });

      const prismaWithWhatsApp = tx as unknown as {
        whatsAppConversation: {
          updateMany(args: {
            where: {
              tenantId: string;
              customerId: string;
            };
            data: {
              customerId: string;
            };
          }): Promise<{ count: number }>;
        };
        whatsAppMessage: {
          updateMany(args: {
            where: {
              tenantId: string;
              customerId: string;
            };
            data: {
              customerId: string;
            };
          }): Promise<{ count: number }>;
        };
      };

      const [conversationResult, messageResult] = await Promise.all([
        prismaWithWhatsApp.whatsAppConversation.updateMany({
          where: {
            tenantId,
            customerId: sourceCustomerId,
          },
          data: {
            customerId: targetCustomerId,
          },
        }),
        prismaWithWhatsApp.whatsAppMessage.updateMany({
          where: {
            tenantId,
            customerId: sourceCustomerId,
          },
          data: {
            customerId: targetCustomerId,
          },
        }),
      ]);

      await tx.customer.update({
        where: {
          id: sourceCustomerId,
          tenantId,
        },
        data: {
          active: false,
          name: `${source.name} (merged)`,
        },
      });

      return {
        quotesMoved: quoteResult.count,
        conversationsMoved: conversationResult.count,
        messagesMoved: messageResult.count,
      };
    });

    return {
      success: true,
      sourceCustomerId,
      targetCustomerId,
      ...result,
    };
  }
}
