import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import {
  agentDiscountCategories,
  type AgentDiscountCategory,
} from '../quotes/dto/create-quote.dto';
import {
  agentDiscountLabels,
  defaultAgentDiscountByCategory,
} from './agent-discount-config.constants';
import { UpdateAgentDiscountConfigDto } from './dto/update-agent-discount-config.dto';

type AgentDiscountMap = Record<AgentDiscountCategory, number>;

@Injectable()
export class TenantSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAgentDiscountConfig(tenantId: string) {
    const defaults = await this.getResolvedDiscountMap(tenantId);

    return {
      items: agentDiscountCategories.map((category) => ({
        category,
        label: agentDiscountLabels[category],
        defaultDiscountPercentage: defaults[category],
      })),
    };
  }

  async updateAgentDiscountConfig(
    tenantId: string,
    actorRole: UserRole,
    dto: UpdateAgentDiscountConfigDto,
  ) {
    if (actorRole !== UserRole.OWNER) {
      throw new ForbiddenException('Only OWNER can update agent type discounts');
    }

    const persistedConfig = dto.items.reduce<AgentDiscountMap>((acc, item) => {
      acc[item.category] = Number(item.defaultDiscountPercentage);
      return acc;
    }, { ...defaultAgentDiscountByCategory });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        agentDiscountConfig: persistedConfig,
      },
    });

    return this.getAgentDiscountConfig(tenantId);
  }

  async getResolvedDiscountMap(tenantId: string): Promise<AgentDiscountMap> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { agentDiscountConfig: true },
    });

    const config =
      tenant?.agentDiscountConfig &&
      typeof tenant.agentDiscountConfig === 'object' &&
      !Array.isArray(tenant.agentDiscountConfig)
        ? (tenant.agentDiscountConfig as Record<string, unknown>)
        : {};

    return agentDiscountCategories.reduce<AgentDiscountMap>((acc, category) => {
      const configuredValue = config[category];

      if (
        typeof configuredValue === 'number' &&
        Number.isFinite(configuredValue) &&
        configuredValue >= 0 &&
        configuredValue <= 100
      ) {
        acc[category] = Number(configuredValue);
      } else {
        acc[category] = defaultAgentDiscountByCategory[category];
      }

      return acc;
    }, { ...defaultAgentDiscountByCategory });
  }
}
