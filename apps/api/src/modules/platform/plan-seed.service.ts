import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PlanSeedService {
  constructor(private prisma: PrismaService) {}

  async seedPlans(): Promise<void> {
    // Define all feature flags
    const featureFlags = [
      {
        code: 'PDF_EXPORT',
        name: 'PDF Export',
        description: 'Export quotes and reports as PDF',
      },
      {
        code: 'ADVANCED_ANALYTICS',
        name: 'Advanced Analytics',
        description: 'Access detailed analytics and reports',
      },
      {
        code: 'TEAM_MEMBERS',
        name: 'Team Members',
        description: 'Add multiple team members',
      },
      {
        code: 'BULK_UPLOAD',
        name: 'Bulk Upload',
        description: 'Import customers and products in bulk',
      },
      {
        code: 'API_ACCESS',
        name: 'API Access',
        description: 'REST API access for integrations',
      },
      {
        code: 'CUSTOM_BRANDING',
        name: 'Custom Branding',
        description: 'White-label shop name and logo',
      },
    ];

    // Create or update feature flags
    const createdFlags = await Promise.all(
      featureFlags.map((flag) =>
        this.prisma.featureFlag.upsert({
          where: { code: flag.code },
          update: { name: flag.name, description: flag.description },
          create: flag,
        }),
      ),
    );

    const flagMap = new Map(createdFlags.map((f) => [f.code, f]));

    // Define plans
    interface FeatureConfig {
      enabled: boolean;
      limitValue?: number;
    }

    interface PlanConfig {
      code: string;
      name: string;
      description: string;
      priceAmount: number;
      features: Record<string, FeatureConfig>;
    }

    const plansConfig: PlanConfig[] = [
      {
        code: 'FREE',
        name: 'Free Plan',
        description: 'For small electrical/plumbing shops getting started',
        priceAmount: 0,
        features: {
          TEAM_MEMBERS: { enabled: true, limitValue: 1 },
          PDF_EXPORT: { enabled: false },
          ADVANCED_ANALYTICS: { enabled: false },
          BULK_UPLOAD: { enabled: false },
          API_ACCESS: { enabled: false },
          CUSTOM_BRANDING: { enabled: false },
        },
      },
      {
        code: 'PRO',
        name: 'Pro Plan',
        description: 'For growing shops with team collaboration needs',
        priceAmount: 99,
        features: {
          TEAM_MEMBERS: { enabled: true, limitValue: 10 },
          PDF_EXPORT: { enabled: true },
          ADVANCED_ANALYTICS: { enabled: true },
          BULK_UPLOAD: { enabled: true },
          API_ACCESS: { enabled: false },
          CUSTOM_BRANDING: { enabled: false },
        },
      },
      {
        code: 'ENTERPRISE',
        name: 'Enterprise Plan',
        description: 'Full-featured plan for large multi-location operations',
        priceAmount: 499,
        features: {
          TEAM_MEMBERS: { enabled: true, limitValue: 100 },
          PDF_EXPORT: { enabled: true },
          ADVANCED_ANALYTICS: { enabled: true },
          BULK_UPLOAD: { enabled: true },
          API_ACCESS: { enabled: true },
          CUSTOM_BRANDING: { enabled: true },
        },
      },
    ];

    // Create or update plans with features
    for (const planConfig of plansConfig) {
      const plan = await this.prisma.plan.upsert({
        where: { code: planConfig.code },
        update: {
          name: planConfig.name,
          description: planConfig.description,
          priceAmount: planConfig.priceAmount,
        },
        create: {
          code: planConfig.code,
          name: planConfig.name,
          description: planConfig.description,
          priceAmount: planConfig.priceAmount,
          currency: 'USD',
          billingCycle: 'MONTHLY',
          trialDays: planConfig.code === 'FREE' ? 0 : 14,
          isActive: true,
        },
      });

      // Delete existing features for this plan
      await this.prisma.planFeature.deleteMany({
        where: { planId: plan.id },
      });

      // Create new features
      for (const [featureCode, config] of Object.entries(
        planConfig.features,
      )) {
        const flag = flagMap.get(featureCode);
        if (flag) {
          await this.prisma.planFeature.create({
            data: {
              planId: plan.id,
              featureFlagId: flag.id,
              enabled: config.enabled,
              limitValue: config.limitValue || null,
            },
          });
        }
      }
    }

    console.log('✓ Plans and features seeded successfully');
  }
}
