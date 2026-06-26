import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionService } from './subscription.service';
import { ChangePlanDto } from './dto/change-plan.dto';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private subscriptionService: SubscriptionService) {}

  @Get('me')
  async getCurrentSubscription(@CurrentUser() user: JwtPayload) {
    const subscription = await this.subscriptionService.getSubscription(
      user.tenantId,
    );

    return {
      id: subscription.id,
      status: subscription.status,
      plan: {
        id: subscription.plan.id,
        code: subscription.plan.code,
        name: subscription.plan.name,
        description: subscription.plan.description,
        priceAmount: subscription.plan.priceAmount,
        billingCycle: subscription.plan.billingCycle,
        currency: subscription.plan.currency,
        trialDays: subscription.plan.trialDays,
      },
      startAt: subscription.startAt,
      endAt: subscription.endAt,
      trialEndAt: subscription.trialEndAt,
      features: subscription.plan.features.map((pf) => ({
        code: pf.featureFlag.code,
        name: pf.featureFlag.name,
        enabled: pf.enabled,
        limitValue: pf.limitValue,
      })),
    };
  }

  @Get('plans')
  async getAvailablePlans() {
    const plans = await this.subscriptionService.getPlans();

    return plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      priceAmount: plan.priceAmount,
      currency: plan.currency,
      billingCycle: plan.billingCycle,
      trialDays: plan.trialDays,
      features: plan.features.map((pf) => ({
        code: pf.featureFlag.code,
        name: pf.featureFlag.name,
        enabled: pf.enabled,
        limitValue: pf.limitValue,
      })),
    }));
  }

  @Patch('plan')
  async changePlan(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePlanDto,
  ) {
    if (user.role !== 'OWNER') {
      throw new BadRequestException('Only OWNER can change plan');
    }

    const result = await this.subscriptionService.changePlan(
      user.tenantId,
      dto.planCode,
    );

    return {
      message: result.message,
      subscription: {
        id: result.subscription.id,
        status: result.subscription.status,
        plan: {
          id: result.subscription.plan.id,
          code: result.subscription.plan.code,
          name: result.subscription.plan.name,
          priceAmount: result.subscription.plan.priceAmount,
        },
      },
    };
  }

  @Delete()
  async cancelSubscription(@CurrentUser() user: JwtPayload) {
    if (user.role !== 'OWNER') {
      throw new BadRequestException('Only OWNER can cancel subscription');
    }

    const result = await this.subscriptionService.cancelSubscription(
      user.tenantId,
    );

    return {
      message: result.message,
      subscription: {
        id: result.subscription.id,
        status: result.subscription.status,
      },
    };
  }
}
