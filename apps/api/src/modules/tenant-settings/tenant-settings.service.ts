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
import { UpdateGstConfigDto } from './dto/update-gst-config.dto';

type AgentDiscountMap = Record<AgentDiscountCategory, number>;

type TenantGstRateConfig = {
  classificationCode: string;
  ratePercentage: number;
};

type TenantGstConfig = {
  sellerGstin?: string;
  sellerStateCode?: string;
  rates: TenantGstRateConfig[];
};

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

  async getGstConfig(tenantId: string) {
    const config = await this.getResolvedGstConfig(tenantId);

    return {
      sellerGstin: config.sellerGstin ?? null,
      sellerStateCode: config.sellerStateCode ?? null,
      rates: config.rates,
    };
  }

  async updateGstConfig(
    tenantId: string,
    actorRole: UserRole,
    dto: UpdateGstConfigDto,
  ) {
    if (actorRole !== UserRole.OWNER) {
      throw new ForbiddenException('Only OWNER can update GST configuration');
    }

    const normalizedRates = dto.rates.map((rate) => ({
      classificationCode: rate.classificationCode.trim().toUpperCase(),
      ratePercentage: Number(rate.ratePercentage),
    }));

    const normalizedConfig: TenantGstConfig = {
      sellerGstin: dto.sellerGstin?.trim() || undefined,
      sellerStateCode: dto.sellerStateCode.trim().toUpperCase(),
      rates: normalizedRates,
    };

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        gstConfig: normalizedConfig,
      },
    });

    return this.getGstConfig(tenantId);
  }

  async getResolvedGstConfig(tenantId: string): Promise<TenantGstConfig> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { gstConfig: true },
    });

    const config =
      tenant?.gstConfig &&
      typeof tenant.gstConfig === 'object' &&
      !Array.isArray(tenant.gstConfig)
        ? (tenant.gstConfig as Record<string, unknown>)
        : {};

    const rawRates = Array.isArray(config.rates) ? config.rates : [];
    const rates: TenantGstRateConfig[] = [];

    for (const rawRate of rawRates) {
      if (!rawRate || typeof rawRate !== 'object' || Array.isArray(rawRate)) {
        continue;
      }

      const entry = rawRate as Record<string, unknown>;
      const classificationCode =
        typeof entry.classificationCode === 'string'
          ? entry.classificationCode.trim().toUpperCase()
          : '';
      const ratePercentage =
        typeof entry.ratePercentage === 'number' && Number.isFinite(entry.ratePercentage)
          ? Number(entry.ratePercentage)
          : NaN;

      if (!classificationCode || Number.isNaN(ratePercentage)) {
        continue;
      }

      rates.push({
        classificationCode,
        ratePercentage,
      });
    }

    const sellerStateCode =
      typeof config.sellerStateCode === 'string' && config.sellerStateCode.trim()
        ? config.sellerStateCode.trim().toUpperCase()
        : undefined;

    const sellerGstin =
      typeof config.sellerGstin === 'string' && config.sellerGstin.trim()
        ? config.sellerGstin.trim()
        : undefined;

    return {
      sellerGstin,
      sellerStateCode,
      rates,
    };
  }
}
