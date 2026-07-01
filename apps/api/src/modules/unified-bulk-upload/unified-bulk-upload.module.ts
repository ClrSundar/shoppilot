import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { UnifiedBulkUploadController } from './unified-bulk-upload.controller';
import { UnifiedBulkUploadService } from './unified-bulk-upload.service';

@Module({
  controllers: [UnifiedBulkUploadController],
  providers: [UnifiedBulkUploadService, PrismaService],
})
export class UnifiedBulkUploadModule {}
