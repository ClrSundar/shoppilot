import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { UnifiedBulkUploadService, type BulkUploadResult } from './unified-bulk-upload.service';

@ApiTags('Bulk Upload')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('bulk-upload')
export class UnifiedBulkUploadController {
  constructor(
    private readonly unifiedBulkUploadService: UnifiedBulkUploadService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async unifiedBulkUpload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<BulkUploadResult> {
    return this.unifiedBulkUploadService.bulkUpload(user.tenantId, user.sub, file);
  }
}
