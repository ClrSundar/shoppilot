import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { PlatformController } from './platform.controller';
import { SubscriptionController } from './subscription.controller';
import { PlatformService } from './platform.service';
import { FeatureService } from './feature.service';
import { PlanSeedService } from './plan-seed.service';
import { SubscriptionService } from './subscription.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'shoppilot-local-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [PlatformController, SubscriptionController],
  providers: [PlatformService, FeatureService, PlanSeedService, SubscriptionService],
  exports: [FeatureService, SubscriptionService],
})
export class PlatformModule {}
