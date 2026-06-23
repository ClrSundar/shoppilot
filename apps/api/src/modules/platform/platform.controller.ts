import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantStatus } from '@prisma/client';
import { PlatformService } from './platform.service';
import { PlatformJwtGuard } from '../platform-auth/guards/platform-jwt.guard';
import { RejectTenantDto } from './dto/reject-tenant.dto';

@ApiTags('Platform Admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(PlatformJwtGuard)
@Controller('platform/tenants')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get()
  getTenants(@Query('status') status?: TenantStatus) {
    return this.platformService.getTenants(status);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @Request() req: any) {
    return this.platformService.approveTenant(id, req.platformAdmin.sub);
  }

  @Patch(':id/reject')
  reject(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: RejectTenantDto,
  ) {
    return this.platformService.rejectTenant(id, req.platformAdmin.sub, dto);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.platformService.suspendTenant(id);
  }

  @Patch(':id/unsuspend')
  unsuspend(@Param('id') id: string) {
    return this.platformService.unsuspendTenant(id);
  }
}
