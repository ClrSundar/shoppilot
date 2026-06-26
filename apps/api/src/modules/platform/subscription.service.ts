import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get tenant's current subscription
   */
  async getSubscription(tenantId: string) {
    let subscription = await this.prisma.subscription.findUnique({
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
      // Auto-assign FREE plan for tenants created before subscription system
      subscription = await this.assignFreePlan(tenantId);
    }

    return subscription;
  }

  /**
   * Assign FREE plan to a tenant (used for new registrations and backfill)
   */
  async assignFreePlan(tenantId: string) {
    const freePlan = await this.prisma.plan.findUnique({ where: { code: 'FREE' } });
    if (!freePlan) {
      throw new BadRequestException('FREE plan not found — ensure seed has run');
    }

    return this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId: freePlan.id,
        status: 'ACTIVE',
        startAt: new Date(),
      },
      update: {},
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
  }

  /**
   * Upgrade or downgrade tenant plan
   */
  async changePlan(tenantId: string, planCode: string) {
    let currentSubscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (!currentSubscription) {
      // Backfill: assign FREE plan first, then allow the change
      await this.assignFreePlan(tenantId);
      currentSubscription = await this.prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      });
    }

    // At this point subscription is guaranteed to exist
    const sub = currentSubscription!;

    const newPlan = await this.prisma.plan.findUnique({
      where: { code: planCode },
    });

    if (!newPlan) {
      throw new BadRequestException('Plan not found');
    }

    if (sub.planId === newPlan.id) {
      throw new BadRequestException('Already on this plan');
    }

    // Update subscription
    const updated = await this.prisma.subscription.update({
      where: { tenantId },
      data: {
        planId: newPlan.id,
        status: 'ACTIVE',
      },
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

    return {
      message: `Plan changed from ${sub.plan.name} to ${newPlan.name}`,
      subscription: updated,
    };
  }

  /**
   * Cancel tenant subscription
   */
  async cancelSubscription(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (!subscription) {
      throw new BadRequestException('Subscription not found');
    }

    if (subscription.status === 'CANCELLED') {
      throw new BadRequestException('Subscription is already cancelled');
    }

    const updated = await this.prisma.subscription.update({
      where: { tenantId },
      data: {
        status: 'CANCELLED',
        endAt: new Date(),
      },
    });

    return {
      message: 'Subscription cancelled',
      subscription: updated,
    };
  }

  /**
   * Get all available plans
   */
  async getPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      include: {
        features: {
          include: { featureFlag: true },
        },
      },
      orderBy: { priceAmount: 'asc' },
    });
  }
}
