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

import { ReturnsService } from './returns.service';
import { CreateProductReturnDto } from './dto/create-product-return.dto';
import { UpdateProductReturnStatusDto } from './dto/update-product-return-status.dto';

@ApiTags('Returns')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProductReturnDto) {
    return this.returnsService.create(user.tenantId, user.sub, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.returnsService.findAll(user.tenantId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.returnsService.findOne(user.tenantId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductReturnStatusDto,
  ) {
    return this.returnsService.updateStatus(user.tenantId, user.sub, id, dto.status);
  }
}
