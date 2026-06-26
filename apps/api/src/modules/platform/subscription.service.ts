import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get tenant's current subscription
   */
  async getSubscription(tenantId: string) {
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
      throw new BadRequestException('Subscription not found');
    }

    return subscription;
  }

  /**
   * Upgrade or downgrade tenant plan
   */
  async changePlan(tenantId: string, planCode: string) {
    const currentSubscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (!currentSubscription) {
      throw new BadRequestException('Current subscription not found');
    }

    const newPlan = await this.prisma.plan.findUnique({
      where: { code: planCode },
    });

    if (!newPlan) {
      throw new BadRequestException('Plan not found');
    }

    if (currentSubscription.planId === newPlan.id) {
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
      message: `Plan changed from ${currentSubscription.plan.name} to ${newPlan.name}`,
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
