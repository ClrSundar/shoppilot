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
}
