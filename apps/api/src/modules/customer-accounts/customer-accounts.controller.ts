import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomerAccountsService } from './customer-accounts.service';

@ApiTags('Customer Accounts')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('customer-accounts')
export class CustomerAccountsController {
  constructor(private readonly customerAccountsService: CustomerAccountsService) {}

  @Get(':customerId/summary')
  getSummary(
    @CurrentUser() user: JwtPayload,
    @Param('customerId') customerId: string,
  ) {
    return this.customerAccountsService.getCustomerAccountSummary(
      user.tenantId,
      customerId,
    );
  }

  @Get(':customerId/ledger')
  getLedger(
    @CurrentUser() user: JwtPayload,
    @Param('customerId') customerId: string,
  ) {
    return this.customerAccountsService.getCustomerLedger(user.tenantId, customerId);
  }

  @Get('outstanding/list')
  getOutstanding(@CurrentUser() user: JwtPayload) {
    return this.customerAccountsService.getOutstandingCustomers(user.tenantId);
  }
}
