import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'shoppilot-local-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [PlatformAuthController],
  providers: [PlatformAuthService],
})
export class PlatformAuthModule {}
