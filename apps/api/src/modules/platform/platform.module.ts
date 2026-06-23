import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'shoppilot-local-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
