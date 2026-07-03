import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../common/prisma/prisma.service';

import { WhatsappService } from './whatsapp.service';

@Injectable()
export class WhatsappMaintenanceService {
  private readonly logger = new Logger(WhatsappMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeChannelData() {
    const tenants = await this.prisma.tenant.findMany({
      where: {
        active: true,
      },
      select: {
        id: true,
      },
    });

    let purgedTenants = 0;

    for (const tenant of tenants) {
      try {
        await this.whatsappService.purgeStaleChannelData(tenant.id);
        purgedTenants += 1;
      } catch (error) {
        this.logger.warn(
          `WhatsApp purge failed for tenant ${tenant.id}: ${String(error)}`,
        );
      }
    }

    this.logger.log(`WhatsApp channel purge completed for ${purgedTenants} tenants`);
  }
}
