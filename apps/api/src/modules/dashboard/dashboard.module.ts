import { Module } from '@nestjs/common';
import { CustomerAccountsModule } from '../customer-accounts/customer-accounts.module';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [CustomerAccountsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
