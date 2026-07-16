import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CustomerAccountsService } from '../customer-accounts/customer-accounts.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerAccountsService: CustomerAccountsService,
  ) {}

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

  async getLowStockProducts(tenantId: string, limit: number = 10) {
    const lowStockItems = await this.prisma.inventoryStock.findMany({
      where: {
        tenantId,
        active: true,
      },
      include: {
        product: {
          include: {
            category: true,
          },
        },
      },
      orderBy: {
        onHand: 'asc',
      },
    });

    // Filter for items at or below reorder level
    return lowStockItems
      .filter((item) => Number(item.onHand) <= Number(item.reorderLevel))
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        productId: item.product.id,
        productName: item.product.name,
        sku: item.product.sku,
        categoryName: item.product.category?.name,
        onHand: Number(item.onHand),
        reorderLevel: Number(item.reorderLevel),
        reserved: Number(item.reserved),
        available: Number(item.onHand) - Number(item.reserved),
        status: Number(item.onHand) === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      }));
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

  async getOutstandingPayments(tenantId: string) {
    const outstanding = await this.customerAccountsService.getOutstandingCustomers(
      tenantId,
    );

    return {
      totalOutstanding: outstanding.totalOutstanding,
      customerCountWithOutstanding: outstanding.customerCountWithOutstanding,
      topCustomers: outstanding.rows.slice(0, 8),
    };
  }
}

