import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

import { PurchasesService } from './purchases.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';

@ApiTags('Purchases')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePurchaseOrderDto) {
    return this.purchasesService.create(user.tenantId, user.sub, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.purchasesService.findAll(user.tenantId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.purchasesService.findOne(user.tenantId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderStatusDto,
  ) {
    return this.purchasesService.updateStatus(user.tenantId, id, dto.status);
  }

  @Post(':id/receive')
  receive(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return this.purchasesService.receive(user.tenantId, user.sub, id, dto);
  }
}
