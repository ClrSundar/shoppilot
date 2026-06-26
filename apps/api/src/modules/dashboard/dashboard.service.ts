import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(tenantId: string) {
    const [categories, products, customers, quotes] = await Promise.all([
      this.prisma.productCategory.count({ where: { tenantId, active: true } }),
      this.prisma.product.count({ where: { tenantId, active: true } }),
      this.prisma.customer.count({ where: { tenantId, active: true } }),
      this.prisma.quote.count({ where: { tenantId } }),
    ]);

    return {
      categories,
      products,
      customers,
      quotes,
    };
  }

  async getOverview(tenantId: string) {
    const [metrics, subscription, users] = await Promise.all([
      this.getMetrics(tenantId),
      this.prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      }),
      this.prisma.user.count({ where: { tenantId, active: true } }),
    ]);

    return {
      metrics,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            plan: {
              code: subscription.plan.code,
              name: subscription.plan.name,
              priceAmount: subscription.plan.priceAmount,
            },
            startAt: subscription.startAt,
            endAt: subscription.endAt,
            trialEndAt: subscription.trialEndAt,
          }
        : null,
      activeUsers: users,
    };
  }
}

