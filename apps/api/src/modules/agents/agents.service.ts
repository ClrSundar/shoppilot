import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import {
  getNumberCell,
  getStringCell,
  parseExcelRows,
} from '../../common/utils/excel.util';

import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

const convertedStatuses = ['APPROVED', 'INVOICED', 'DISPATCHED'] as const;

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async bulkUpload(tenantId: string, file: Express.Multer.File) {
    const rows = parseExcelRows(file);

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      const name = getStringCell(row, ['name', 'agentname', 'agent']);

      if (!name) {
        skipped += 1;
        errors.push(`Row ${index + 2}: Name is required`);
        continue;
      }

      const defaultCommissionPercentage = getNumberCell(row, [
        'defaultcommissionpercentage',
        'commissionpercentage',
        'commission',
      ]);

      if (
        defaultCommissionPercentage !== null &&
        (defaultCommissionPercentage < 0 || defaultCommissionPercentage > 100)
      ) {
        skipped += 1;
        errors.push(`Row ${index + 2}: Commission percentage must be between 0 and 100`);
        continue;
      }

      try {
        await this.prisma.agent.create({
          data: {
            tenantId,
            name,
            phone: getStringCell(row, ['phone', 'phonenumber']) || undefined,
            whatsappNumber:
              getStringCell(row, ['whatsappnumber', 'whatsapp']) || undefined,
            email: getStringCell(row, ['email']) || undefined,
            address: getStringCell(row, ['address']) || undefined,
            referenceCode:
              getStringCell(row, ['referencecode', 'refcode', 'code']) ||
              undefined,
            defaultCommissionPercentage:
              defaultCommissionPercentage ?? undefined,
          },
        });

        created += 1;
      } catch (error) {
        skipped += 1;

        const message =
          error instanceof Error ? error.message : 'Failed to create agent';
        errors.push(`Row ${index + 2}: ${message}`);
      }
    }

    return {
      totalRows: rows.length,
      created,
      skipped,
      errors,
    };
  }

  async create(tenantId: string, dto: CreateAgentDto) {
    return this.prisma.agent.create({
      data: {
        tenantId,
        name: dto.name,
        phone: dto.phone,
        whatsappNumber: dto.whatsappNumber,
        email: dto.email,
        address: dto.address,
        referenceCode: dto.referenceCode,
        defaultCommissionPercentage: dto.defaultCommissionPercentage,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.agent.findMany({
      where: {
        tenantId,
      },
      include: {
        _count: {
          select: {
            quotes: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const agent = await this.prisma.agent.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        _count: {
          select: {
            quotes: true,
          },
        },
      },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    return agent;
  }

  async update(tenantId: string, id: string, dto: UpdateAgentDto) {
    await this.ensureAgentExists(tenantId, id);

    return this.prisma.agent.update({
      where: {
        id,
      },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.ensureAgentExists(tenantId, id);

    return this.prisma.agent.update({
      where: {
        id,
      },
      data: {
        active: false,
      },
    });
  }

  async getOverviewStats(tenantId: string) {
    const [totalAgents, activeAgents, quoteSummary, topCommissionRows] =
      await Promise.all([
        this.prisma.agent.count({ where: { tenantId } }),
        this.prisma.agent.count({ where: { tenantId, active: true } }),
        this.prisma.quote.aggregate({
          where: {
            tenantId,
            agentId: {
              not: null,
            },
          },
          _count: {
            _all: true,
          },
          _sum: {
            totalAmount: true,
            agentCommissionAmount: true,
          },
        }),
        this.prisma.quote.groupBy({
          by: ['agentId'],
          where: {
            tenantId,
            agentId: {
              not: null,
            },
          },
          _count: {
            _all: true,
          },
          _sum: {
            totalAmount: true,
            agentCommissionAmount: true,
          },
          orderBy: {
            _sum: {
              agentCommissionAmount: 'desc',
            },
          },
          take: 5,
        }),
      ]);

    const topAgentIds = topCommissionRows
      .map((row) => row.agentId)
      .filter((agentId): agentId is string => Boolean(agentId));

    const topAgents = await this.prisma.agent.findMany({
      where: {
        tenantId,
        id: {
          in: topAgentIds,
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
    });

    const topAgentById = new Map(topAgents.map((agent) => [agent.id, agent]));

    return {
      totalAgents,
      activeAgents,
      inactiveAgents: totalAgents - activeAgents,
      totalReferredQuotes: quoteSummary._count._all,
      totalReferredAmount: Number(quoteSummary._sum.totalAmount ?? 0),
      totalCommissionAmount: Number(quoteSummary._sum.agentCommissionAmount ?? 0),
      topAgentsByCommission: topCommissionRows.map((row) => ({
        agentId: row.agentId,
        agent: row.agentId ? topAgentById.get(row.agentId) ?? null : null,
        quoteCount: row._count._all,
        totalAmount: Number(row._sum.totalAmount ?? 0),
        totalCommissionAmount: Number(row._sum.agentCommissionAmount ?? 0),
      })),
    };
  }

  async getAgentStats(tenantId: string, agentId: string) {
    const agent = await this.ensureAgentExists(tenantId, agentId);

    const [summary, convertedQuoteCount, recentQuotes] = await Promise.all([
      this.prisma.quote.aggregate({
        where: {
          tenantId,
          agentId,
        },
        _count: {
          _all: true,
        },
        _sum: {
          totalAmount: true,
          agentCommissionAmount: true,
        },
      }),
      this.prisma.quote.count({
        where: {
          tenantId,
          agentId,
          status: {
            in: [...convertedStatuses],
          },
        },
      }),
      this.prisma.quote.findMany({
        where: {
          tenantId,
          agentId,
        },
        include: {
          customer: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      }),
    ]);

    const totalQuotes = summary._count._all;

    return {
      agent,
      totalQuotes,
      convertedQuotes: convertedQuoteCount,
      conversionRate: totalQuotes
        ? Number(((convertedQuoteCount / totalQuotes) * 100).toFixed(2))
        : 0,
      totalReferredAmount: Number(summary._sum.totalAmount ?? 0),
      totalCommissionAmount: Number(summary._sum.agentCommissionAmount ?? 0),
      recentQuotes,
    };
  }

  private async ensureAgentExists(tenantId: string, agentId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: {
        id: agentId,
        tenantId,
      },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    return agent;
  }
}
