import { UserRole } from '@prisma/client';

export type JwtPayload = {
  sub: string;
  tenantId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
};
