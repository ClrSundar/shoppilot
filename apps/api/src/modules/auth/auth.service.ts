import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { BusinessType, UserRole, TenantStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../../common/prisma/prisma.service';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingTenant = await this.prisma.tenant.findFirst({
      where: { code: dto.shopCode },
    });

    if (existingTenant) {
      throw new BadRequestException('Shop code already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.shopName,
        code: dto.shopCode,
        businessType: dto.businessType,
        status: TenantStatus.PENDING,
      },
    });

    await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: dto.ownerName,
        email: dto.email,
        password: hashedPassword,
        role: UserRole.OWNER,
      },
    });

    // Assign FREE plan subscription
    const freePlan = await this.prisma.plan.findUnique({
      where: { code: 'FREE' },
    });

    if (freePlan) {
      await this.prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: freePlan.id,
          startAt: new Date(),
          status: 'ACTIVE',
        },
      });
    }

    return {
      message: 'Registration successful. Your account is pending approval by an administrator.',
      tenantStatus: TenantStatus.PENDING,
    };
  }

  async login(dto: LoginDto) {
    // Step 1: Resolve tenant by code (tenant identifier)
    const tenant = await this.prisma.tenant.findUnique({
      where: { code: dto.tenantCode },
    });

    if (!tenant) {
      throw new BadRequestException('Shop code not found');
    }

    // Step 2: Query user scoped by tenant AND email (composite query)
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        tenantId: tenant.id,
      },
      include: { tenant: true },
    });

    // Step 3: Validate user exists and is active (generic error for security)
    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Step 4: Validate password
    const validPassword = await bcrypt.compare(dto.password, user.password);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Step 5: Validate tenant status (tenant active state enforcement)
    if (user.tenant.status === TenantStatus.PENDING) {
      throw new ForbiddenException(
        'Your account is pending approval. Please wait for an administrator to approve your registration.',
      );
    }

    if (user.tenant.status === TenantStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Your account has been suspended. Please contact support.',
      );
    }

    if (user.tenant.status === TenantStatus.CANCELLED) {
      throw new ForbiddenException('Your account has been cancelled.');
    }

    // Step 6: Generate token with authenticated user (ensures JWT tenantId matches)
    return this.generateToken(user);
  }

  private generateToken(user: any) {
    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
    };
  }
}
