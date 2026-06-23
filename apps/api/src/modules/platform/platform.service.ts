import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RejectTenantDto } from './dto/reject-tenant.dto';

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async getTenants(status?: TenantStatus) {
    return this.prisma.tenant.findMany({
      where: status ? { status } : {},
      include: {
        users: {
          where: { role: 'OWNER' },
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveTenant(tenantId: string, adminId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: TenantStatus.ACTIVE,
        approvedById: adminId,
        approvedAt: new Date(),
        rejectedReason: null,
      },
    });
  }

  async rejectTenant(tenantId: string, adminId: string, dto: RejectTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: TenantStatus.CANCELLED,
        approvedById: adminId,
        approvedAt: new Date(),
        rejectedReason: dto.reason ?? 'Rejected by admin',
      },
    });
  }

  async suspendTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TenantStatus.SUSPENDED },
    });
  }

  async unsuspendTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TenantStatus.ACTIVE },
    });
  }
}
