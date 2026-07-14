import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

import { TenantSettingsService } from './tenant-settings.service';
import { UpdateAgentDiscountConfigDto } from './dto/update-agent-discount-config.dto';

@ApiTags('Tenant Settings')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(private readonly tenantSettingsService: TenantSettingsService) {}

  @Get('agent-discounts')
  getAgentDiscountConfig(@CurrentUser() user: JwtPayload) {
    return this.tenantSettingsService.getAgentDiscountConfig(user.tenantId);
  }

  @Put('agent-discounts')
  updateAgentDiscountConfig(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateAgentDiscountConfigDto,
  ) {
    return this.tenantSettingsService.updateAgentDiscountConfig(
      user.tenantId,
      user.role,
      dto,
    );
  }
}
