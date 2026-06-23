import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        code: user.tenant.code,
        businessType: user.tenant.businessType,
        status: user.tenant.status,
      },
    };
  }

  async listUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createUser(tenantId: string, actorRole: UserRole, dto: CreateUserDto) {
    // Only OWNER and ADMIN can add users
    if (actorRole !== UserRole.OWNER && actorRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only OWNER or ADMIN can add users');
    }
    // ADMIN cannot create OWNER
    if (actorRole === UserRole.ADMIN && dto.role === UserRole.OWNER) {
      throw new ForbiddenException('ADMIN cannot create an OWNER');
    }

    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: dto.email },
    });
    if (existing) throw new BadRequestException('Email already exists in this tenant');

    const hashed = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: { tenantId, name: dto.name, email: dto.email, password: hashed, role: dto.role },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
  }

  async updateRole(tenantId: string, actorId: string, actorRole: UserRole, targetId: string, dto: UpdateUserRoleDto) {
    if (actorRole !== UserRole.OWNER) {
      throw new ForbiddenException('Only OWNER can change roles');
    }
    if (actorId === targetId) {
      throw new BadRequestException('Cannot change your own role');
    }

    const target = await this.prisma.user.findFirst({ where: { id: targetId, tenantId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === UserRole.OWNER) throw new ForbiddenException('Cannot change OWNER role');

    return this.prisma.user.update({
      where: { id: targetId },
      data: { role: dto.role },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
  }

  async toggleActive(tenantId: string, actorId: string, actorRole: UserRole, targetId: string) {
    if (actorRole !== UserRole.OWNER && actorRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only OWNER or ADMIN can enable/disable users');
    }
    if (actorId === targetId) throw new BadRequestException('Cannot disable yourself');

    const target = await this.prisma.user.findFirst({ where: { id: targetId, tenantId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === UserRole.OWNER) throw new ForbiddenException('Cannot disable the OWNER');

    return this.prisma.user.update({
      where: { id: targetId },
      data: { active: !target.active },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
  }
}
