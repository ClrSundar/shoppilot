import { SetMetadata, Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureService } from '../../modules/platform/feature.service';

export const FEATURE_FLAG_KEY = 'featureFlag';

export const RequireFeature = (featureCode: string) =>
  SetMetadata(FEATURE_FLAG_KEY, featureCode);

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private featureService: FeatureService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureCode = this.reflector.get<string>(
      FEATURE_FLAG_KEY,
      context.getHandler(),
    );

    if (!featureCode) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('No tenant information');
    }

    const feature = await this.featureService.checkFeature(
      tenantId,
      featureCode,
    );

    if (!feature.enabled) {
      throw new ForbiddenException(
        `This feature (${featureCode}) is not available in your current plan`,
      );
    }

    return true;
  }
}
