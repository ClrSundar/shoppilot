import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { RequireFeature } from '../../common/guards/feature.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { InventoryService } from './inventory.service';
import { InitializeStockDto } from './dto/initialize-stock.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { InventoryLedgerQueryDto } from './dto/inventory-ledger-query.dto';

@ApiTags('Inventory')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@RequireFeature('INVENTORY_MANAGEMENT')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('stocks/initialize')
  initializeStock(@CurrentUser() user: JwtPayload, @Body() dto: InitializeStockDto) {
    return this.inventoryService.initializeStock(user.tenantId, user.sub, dto);
  }

  @Get('stocks')
  findAllStocks(@CurrentUser() user: JwtPayload) {
    return this.inventoryService.findAllStocks(user.tenantId);
  }

  @Get('stocks/product/:productId')
  findStockByProduct(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
  ) {
    return this.inventoryService.findStockByProduct(user.tenantId, productId);
  }

  @Post('adjustments')
  adjustStock(@CurrentUser() user: JwtPayload, @Body() dto: AdjustInventoryDto) {
    return this.inventoryService.adjustStock(user.tenantId, user.sub, dto);
  }

  @Get('ledger')
  listLedger(
    @CurrentUser() user: JwtPayload,
    @Query() query: InventoryLedgerQueryDto,
  ) {
    return this.inventoryService.listLedger(user.tenantId, query.productId);
  }
}
