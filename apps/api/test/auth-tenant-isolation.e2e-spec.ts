import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TenantStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Authentication - Tenant Isolation (DEF-001)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  // Test data
  let tenantA: { id: string; code: string; name: string };
  let tenantB: { id: string; code: string; name: string };
  let userInTenantA: {
    id: string;
    email: string;
    tenantId: string;
    password: string;
  };
  let userInTenantB: {
    id: string;
    email: string;
    tenantId: string;
    password: string;
  };
  let inactiveUserInTenantA: {
    id: string;
    email: string;
    tenantId: string;
  };
  let userSameEmailDifferentTenant: {
    id: string;
    email: string;
    tenantId: string;
    password: string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    jwtService = moduleRef.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    // Cleanup test data
    if (userInTenantA?.id) {
      await prisma.user.deleteMany({
        where: { tenantId: tenantA?.id },
      });
    }
    if (userInTenantB?.id) {
      await prisma.user.deleteMany({
        where: { tenantId: tenantB?.id },
      });
    }
    if (tenantA?.id) {
      await prisma.tenant.delete({ where: { id: tenantA.id } });
    }
    if (tenantB?.id) {
      await prisma.tenant.delete({ where: { id: tenantB.id } });
    }

    await app.close();
  });

  describe('Setup: Create test fixtures', () => {
    it('should create Tenant A with user', async () => {
      const hashedPassword = await bcrypt.hash('Password@123', 10);

      tenantA = await prisma.tenant.create({
        data: {
          name: 'Test Tenant A',
          code: `test-a-${Date.now()}`,
          status: TenantStatus.ACTIVE,
        },
      });

      userInTenantA = {
        id: '',
        email: `alice-${Date.now()}@abc.com`,
        tenantId: tenantA.id,
        password: 'Password@123',
      };

      const createdUser = await prisma.user.create({
        data: {
          name: 'Alice A',
          email: userInTenantA.email,
          password: hashedPassword,
          tenantId: tenantA.id,
          role: 'OWNER',
          active: true,
        },
      });

      userInTenantA.id = createdUser.id;

      expect(tenantA.id).toBeDefined();
      expect(userInTenantA.id).toBeDefined();
    });

    it('should create Tenant B with different user', async () => {
      const hashedPassword = await bcrypt.hash('DifferentPass@456', 10);

      tenantB = await prisma.tenant.create({
        data: {
          name: 'Test Tenant B',
          code: `test-b-${Date.now()}`,
          status: TenantStatus.ACTIVE,
        },
      });

      userInTenantB = {
        id: '',
        email: `bob-${Date.now()}@xyz.com`,
        tenantId: tenantB.id,
        password: 'DifferentPass@456',
      };

      const createdUser = await prisma.user.create({
        data: {
          name: 'Bob B',
          email: userInTenantB.email,
          password: hashedPassword,
          tenantId: tenantB.id,
          role: 'OWNER',
          active: true,
        },
      });

      userInTenantB.id = createdUser.id;

      expect(tenantB.id).toBeDefined();
      expect(userInTenantB.id).toBeDefined();
    });

    it('should create user with same email as Tenant A user but in Tenant B', async () => {
      const hashedPassword = await bcrypt.hash('SameEmail@789', 10);

      userSameEmailDifferentTenant = {
        id: '',
        email: userInTenantA.email, // Same email as Tenant A user
        tenantId: tenantB.id,
        password: 'SameEmail@789',
      };

      const createdUser = await prisma.user.create({
        data: {
          name: 'Alice B (same email)',
          email: userSameEmailDifferentTenant.email,
          password: hashedPassword,
          tenantId: tenantB.id,
          role: 'OWNER',
          active: true,
        },
      });

      userSameEmailDifferentTenant.id = createdUser.id;

      expect(userSameEmailDifferentTenant.id).toBeDefined();
      // Verify schema allows this (email unique per tenant, not globally)
      const userA = await prisma.user.findFirst({
        where: { email: userInTenantA.email, tenantId: tenantA.id },
      });
      const userB = await prisma.user.findFirst({
        where: { email: userInTenantA.email, tenantId: tenantB.id },
      });
      expect(userA?.id).toBe(userInTenantA.id);
      expect(userB?.id).toBe(userSameEmailDifferentTenant.id);
    });

    it('should create inactive user in Tenant A', async () => {
      const hashedPassword = await bcrypt.hash('Inactive@000', 10);

      const createdUser = await prisma.user.create({
        data: {
          name: 'Inactive User',
          email: `inactive-${Date.now()}@abc.com`,
          password: hashedPassword,
          tenantId: tenantA.id,
          role: 'MANAGER',
          active: false, // Explicitly inactive
        },
      });

      inactiveUserInTenantA = {
        id: createdUser.id,
        email: createdUser.email,
        tenantId: tenantA.id,
      };

      expect(inactiveUserInTenantA.id).toBeDefined();
    });
  });

  describe('RT-001: LOGIN_CROSS_TENANT_BLOCKED', () => {
    it('should reject login when user tries to access wrong tenant', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: userInTenantA.email,
          password: userInTenantA.password,
          tenantCode: tenantB.code, // Wrong tenant!
        });

      // AC2: Cross-tenant login rejected
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
      expect(response.body.accessToken).toBeUndefined();
    });
  });

  describe('RT-002: LOGIN_CONCURRENT_TENANTS', () => {
    it('should succeed concurrent logins from same email in different tenants', async () => {
      // Login as user in Tenant A with correct credentials
      const responseA = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: userInTenantA.email,
          password: userInTenantA.password,
          tenantCode: tenantA.code,
        });

      // Login as user in Tenant B (same email, different tenant)
      const responseB = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: userSameEmailDifferentTenant.email,
          password: userSameEmailDifferentTenant.password,
          tenantCode: tenantB.code,
        });

      // AC3: Correct tenant login succeeds (both)
      expect(responseA.status).toBe(201);
      expect(responseB.status).toBe(201);

      // Decode tokens to verify tenantId
      const decodedA = jwtService.decode(responseA.body.accessToken);
      const decodedB = jwtService.decode(responseB.body.accessToken);

      // AC4 & AC7: JWT tenantId matches authenticated tenant
      expect(decodedA.tenantId).toBe(tenantA.id);
      expect(decodedB.tenantId).toBe(tenantB.id);
      expect(decodedA.tenantId).not.toBe(decodedB.tenantId);
    });
  });

  describe('RT-003: LOGIN_JWT_TENANT_CONSISTENCY', () => {
    it('should have JWT.tenantId matching the authenticated tenant', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: userInTenantA.email,
          password: userInTenantA.password,
          tenantCode: tenantA.code,
        });

      expect(response.status).toBe(201);

      const decoded = jwtService.decode(response.body.accessToken);

      // AC4: JWT.tenantId must match authenticated user.tenantId
      expect(decoded.tenantId).toBe(userInTenantA.tenantId);
      expect(decoded.tenantId).toBe(tenantA.id);
      expect(decoded.sub).toBe(userInTenantA.id);
    });
  });

  describe('RT-004: LOGIN_MISSING_TENANT_CODE', () => {
    it('should reject login when tenantCode is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: userInTenantA.email,
          password: userInTenantA.password,
          // tenantCode intentionally omitted
        });

      // AC6: Missing tenant code rejected with 400
      expect(response.status).toBe(400);
      // DTO validation error should indicate missing field
      expect(response.body.message).toBeDefined();
    });
  });

  describe('RT-005: LOGIN_INVALID_TENANT_CODE', () => {
    it('should reject login when tenantCode does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: userInTenantA.email,
          password: userInTenantA.password,
          tenantCode: 'nonexistent-code-xyz',
        });

      // AC5: Invalid tenant code rejected with 400
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Shop code not found');
    });
  });

  describe('RT-006: LOGIN_CORRECT_TENANT_SUCCESS', () => {
    it('should succeed with correct email, password, and tenantCode', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: userInTenantA.email,
          password: userInTenantA.password,
          tenantCode: tenantA.code,
        });

      // AC3: Correct tenant login succeeds
      expect(response.status).toBe(201);
      expect(response.body.accessToken).toBeDefined();

      // AC4: JWT.tenantId correct
      const decoded = jwtService.decode(response.body.accessToken);
      expect(decoded.tenantId).toBe(tenantA.id);
      expect(decoded.sub).toBe(userInTenantA.id);
      expect(decoded.email).toBe(userInTenantA.email);
    });
  });

  describe('RT-007: LOGIN_SAME_EMAIL_DIFFERENT_TENANT_PASSWORD', () => {
    it('should reject login when password is correct for one tenant but wrong for another', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: userSameEmailDifferentTenant.email, // Same email in both tenants
          password: userInTenantA.password, // Password for Tenant A user
          tenantCode: tenantB.code, // But trying to login to Tenant B
        });

      // AC2: Cross-tenant attempt rejected
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
      expect(response.body.accessToken).toBeUndefined();
    });
  });

  describe('RT-008: LOGIN_INACTIVE_USER_REJECTED', () => {
    it('should reject login for inactive user even with correct credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: inactiveUserInTenantA.email,
          password: 'Inactive@000', // Correct password
          tenantCode: tenantA.code, // Correct tenant
        });

      // AC8/Regression: Inactive user rejected with 401
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
      expect(response.body.accessToken).toBeUndefined();
    });
  });

  describe('Regression: Existing behavior preserved', () => {
    it('should reject login when tenant is PENDING', async () => {
      const pendingTenant = await prisma.tenant.create({
        data: {
          name: 'Pending Tenant',
          code: `pending-${Date.now()}`,
          status: TenantStatus.PENDING, // Explicitly pending
        },
      });

      const hashedPassword = await bcrypt.hash('Test@1234', 10);
      const pendingUser = await prisma.user.create({
        data: {
          name: 'Pending User',
          email: `pending-${Date.now()}@test.com`,
          password: hashedPassword,
          tenantId: pendingTenant.id,
          role: 'OWNER',
          active: true,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: pendingUser.email,
          password: 'Test@1234',
          tenantCode: pendingTenant.code,
        });

      // AC10: Tenant active status enforced (PENDING rejected with 403)
      expect(response.status).toBe(403);
      expect(response.body.message).toContain('pending approval');

      // Cleanup
      await prisma.user.delete({ where: { id: pendingUser.id } });
      await prisma.tenant.delete({ where: { id: pendingTenant.id } });
    });

    it('should reject login when tenant is SUSPENDED', async () => {
      const suspendedTenant = await prisma.tenant.create({
        data: {
          name: 'Suspended Tenant',
          code: `suspended-${Date.now()}`,
          status: TenantStatus.SUSPENDED,
        },
      });

      const hashedPassword = await bcrypt.hash('Test@1234', 10);
      const suspendedUser = await prisma.user.create({
        data: {
          name: 'Suspended User',
          email: `suspended-${Date.now()}@test.com`,
          password: hashedPassword,
          tenantId: suspendedTenant.id,
          role: 'OWNER',
          active: true,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: suspendedUser.email,
          password: 'Test@1234',
          tenantCode: suspendedTenant.code,
        });

      // AC10: Tenant active status enforced (SUSPENDED rejected with 403)
      expect(response.status).toBe(403);
      expect(response.body.message).toContain('suspended');

      // Cleanup
      await prisma.user.delete({ where: { id: suspendedUser.id } });
      await prisma.tenant.delete({ where: { id: suspendedTenant.id } });
    });

    it('should reject login when tenant is CANCELLED', async () => {
      const cancelledTenant = await prisma.tenant.create({
        data: {
          name: 'Cancelled Tenant',
          code: `cancelled-${Date.now()}`,
          status: TenantStatus.CANCELLED,
        },
      });

      const hashedPassword = await bcrypt.hash('Test@1234', 10);
      const cancelledUser = await prisma.user.create({
        data: {
          name: 'Cancelled User',
          email: `cancelled-${Date.now()}@test.com`,
          password: hashedPassword,
          tenantId: cancelledTenant.id,
          role: 'OWNER',
          active: true,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: cancelledUser.email,
          password: 'Test@1234',
          tenantCode: cancelledTenant.code,
        });

      // AC10: Tenant active status enforced (CANCELLED rejected with 403)
      expect(response.status).toBe(403);
      expect(response.body.message).toContain('cancelled');

      // Cleanup
      await prisma.user.delete({ where: { id: cancelledUser.id } });
      await prisma.tenant.delete({ where: { id: cancelledTenant.id } });
    });
  });

  describe('AC9: Error messages distinguish tenant vs credential errors', () => {
    it('should return 400 Bad Request for invalid tenantCode (tenant lookup failure)', () => {
      // Error type: tenant identifier issue (bad request)
      // Should be 400, not 401
      // Tested in RT-005
    });

    it('should return 401 Unauthorized for invalid credentials (password/user mismatch)', () => {
      // Error type: credential/authentication issue (unauthorized)
      // Should be 401, not 400
      // Tested in RT-001, RT-007, RT-008
    });
  });
});
