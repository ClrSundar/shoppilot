import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@ApiTags('Agents')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAgentDto) {
    return this.agentsService.create(user.tenantId, dto);
  }

  @Post('bulk-upload')
  @UseInterceptors(FileInterceptor('file'))
  bulkUpload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.agentsService.bulkUpload(user.tenantId, file);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.agentsService.findAll(user.tenantId);
  }

  @Get('stats/overview')
  getOverviewStats(@CurrentUser() user: JwtPayload) {
    return this.agentsService.getOverviewStats(user.tenantId);
  }

  @Get(':id/stats')
  getAgentStats(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.agentsService.getAgentStats(user.tenantId, id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.agentsService.findOne(user.tenantId, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentsService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.agentsService.remove(user.tenantId, id);
  }
}
