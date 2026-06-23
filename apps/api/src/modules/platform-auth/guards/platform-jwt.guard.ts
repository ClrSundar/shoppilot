import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class PlatformJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing platform token');
    }

    const token = authHeader.split(' ')[1];

    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'shoppilot-local-secret',
      });

      if (!payload.isPlatformAdmin) {
        throw new UnauthorizedException('Not a platform admin token');
      }

      request.platformAdmin = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid platform token');
    }
  }
}
