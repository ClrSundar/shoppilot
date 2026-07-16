import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCustomerTypeDto } from './dto/create-customer-type.dto';
import { UpdateCustomerTypeDto } from './dto/update-customer-type.dto';
import { CustomerTypesService } from './customer-types.service';

@ApiTags('Customer Types')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('customer-types')
export class CustomerTypesController {
  constructor(private readonly customerTypesService: CustomerTypesService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCustomerTypeDto) {
    return this.customerTypesService.create(user.tenantId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.customerTypesService.findAll(user.tenantId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.customerTypesService.findOne(user.tenantId, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerTypeDto,
  ) {
    return this.customerTypesService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.customerTypesService.remove(user.tenantId, id);
  }
}
