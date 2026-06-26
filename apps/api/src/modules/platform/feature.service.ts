import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface FeatureCheckResult {
  enabled: boolean;
  limitValue?: number;
}

@Injectable()
export class FeatureService {
  constructor(private prisma: PrismaService) {}

  /**
   * Check if a feature is enabled for a tenant
   * Checks tenant overrides first, then plan features
   */
  async checkFeature(
    tenantId: string,
    featureCode: string,
  ): Promise<FeatureCheckResult> {
    // Get feature flag first
    const featureFlag = await this.prisma.featureFlag.findUnique({
      where: { code: featureCode },
    });

    if (!featureFlag) {
      return { enabled: false };
    }

    // Check tenant override first
    const override = await this.prisma.tenantFeatureOverride.findUnique({
      where: {
        tenantId_featureFlagId: {
          tenantId,
          featureFlagId: featureFlag.id,
        },
      },
    });

    if (override) {
      return {
        enabled: override.enabled,
        limitValue: override.limitValue || undefined,
      };
    }

    // Get subscription plan
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (!subscription || subscription.status === 'CANCELLED') {
      return { enabled: false };
    }

    if (!featureFlag.isActive) {
      return { enabled: false };
    }

    // Get plan feature
    const planFeature = await this.prisma.planFeature.findUnique({
      where: {
        planId_featureFlagId: {
          planId: subscription.planId,
          featureFlagId: featureFlag.id,
        },
      },
    });

    if (!planFeature) {
      return { enabled: false };
    }

    return {
      enabled: planFeature.enabled,
      limitValue: planFeature.limitValue || undefined,
    };
  }

  /**
   * Check usage against limit
   */
  async checkUsageLimit(
    tenantId: string,
    featureCode: string,
    periodKey: string,
  ): Promise<{
    used: number;
    limit: number | null;
    remaining: number | null;
  }> {
    const feature = await this.checkFeature(tenantId, featureCode);

    if (!feature.enabled || !feature.limitValue) {
      return {
        used: 0,
        limit: null,
        remaining: null,
      };
    }

    const featureFlag = await this.prisma.featureFlag.findUnique({
      where: { code: featureCode },
    });

    if (!featureFlag) {
      return {
        used: 0,
        limit: null,
        remaining: null,
      };
    }

    const counter = await this.prisma.usageCounter.findUnique({
      where: {
        tenantId_featureFlagId_periodKey: {
          tenantId,
          featureFlagId: featureFlag.id,
          periodKey,
        },
      },
    });

    const used = counter?.usedCount || 0;
    const remaining = feature.limitValue - used;

    return {
      used,
      limit: feature.limitValue,
      remaining: Math.max(0, remaining),
    };
  }

  /**
   * Increment usage counter
   */
  async incrementUsage(
    tenantId: string,
    featureCode: string,
    periodKey: string,
    amount: number = 1,
  ): Promise<void> {
    const featureFlag = await this.prisma.featureFlag.findUnique({
      where: { code: featureCode },
    });

    if (!featureFlag) {
      return;
    }

    await this.prisma.usageCounter.upsert({
      where: {
        tenantId_featureFlagId_periodKey: {
          tenantId,
          featureFlagId: featureFlag.id,
          periodKey,
        },
      },
      create: {
        tenantId,
        featureFlagId: featureFlag.id,
        periodKey,
        usedCount: amount,
      },
      update: {
        usedCount: {
          increment: amount,
        },
      },
    });
  }

  /**
   * Get all features available to a tenant
   */
  async getTenantFeatures(tenantId: string): Promise<
    {
      code: string;
      name: string;
      enabled: boolean;
      limitValue?: number;
    }[]
  > {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        plan: {
          include: {
            features: {
              include: { featureFlag: true },
            },
          },
        },
      },
    });

    if (!subscription) {
      return [];
    }

    const overrides = await this.prisma.tenantFeatureOverride.findMany({
      where: { tenantId },
      include: { featureFlag: true },
    });

    const overrideMap = new Map(
      overrides.map((o) => [o.featureFlagId, o]),
    );

    return subscription.plan.features.map((pf) => {
      const override = overrideMap.get(pf.featureFlagId);

      if (override) {
        return {
          code: override.featureFlag.code,
          name: override.featureFlag.name,
          enabled: override.enabled,
          limitValue: override.limitValue || undefined,
        };
      }

      return {
        code: pf.featureFlag.code,
        name: pf.featureFlag.name,
        enabled: pf.enabled,
        limitValue: pf.limitValue || undefined,
      };
    });
  }
}
