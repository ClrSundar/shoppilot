import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Prisma, TenantStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { CommissionsService } from '../src/modules/commissions/commissions.service';

/**
 * DEF-005: Payment balance race condition stabilization
 *
 * This suite validates quote-linked payment coordination and financial invariants:
 * - Concurrent payment creation does not exceed quote total
 * - Non-payable quote states reject payments with zero persistence mutations
 * - Payment + commission updates are atomic (commission failure rolls back payment)
 */
describe('Payments Balance Race Condition (DEF-005)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let commissionsService: CommissionsService;
  let tenantId: string;
  let customerId: string;
  let categoryId: string;
  let productId: string;
  let auth: { Authorization: string };
  let tenantB: { id: string; code: string };
  let tenantBUser: { id: string; email: string; password: string };
  let tenantBCustomerId: string;
  let tenantBCategoryId: string;
  let tenantBProductId: string;
  let authB: { Authorization: string };
  const createdQuoteIds: string[] = [];
  const createdQuoteIdsTenantB: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    commissionsService = moduleFixture.get<CommissionsService>(CommissionsService);

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'owner@demo.com',
        password: 'Demo@1234',
        tenantCode: 'DEMO',
      })
      .expect(201);

    auth = { Authorization: `Bearer ${loginRes.body.accessToken}` };

    const owner = await prisma.user.findFirst({
      where: {
        email: 'owner@demo.com',
      },
      include: {
        tenant: true,
      },
    });

    if (!owner || owner.tenant.status !== TenantStatus.ACTIVE) {
      throw new Error('Demo owner or active tenant not found');
    }

    tenantId = owner.tenantId;

    const unique = `def005-${Date.now()}`;

    const customer = await prisma.customer.create({
      data: {
        tenantId,
        name: `DEF-005 Customer ${unique}`,
      },
    });
    customerId = customer.id;

    const category = await prisma.productCategory.create({
      data: {
        tenantId,
        name: `DEF-005 Category ${unique}`,
      },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        tenantId,
        categoryId: category.id,
        name: `DEF-005 Product ${unique}`,
        costPrice: new Prisma.Decimal('50.00'),
        sellingPrice: new Prisma.Decimal('10.00'),
      },
    });
    productId = product.id;

    await prisma.inventoryStock.create({
      data: {
        tenantId,
        productId,
        onHand: new Prisma.Decimal('1000.00'),
        reserved: new Prisma.Decimal('0.00'),
        reorderLevel: new Prisma.Decimal('10.00'),
      },
    });

    const tenantBSuffix = `${Date.now()}`;
    tenantB = await prisma.tenant.create({
      data: {
        name: `DEF-005 Tenant B ${tenantBSuffix}`,
        code: `def005b-${tenantBSuffix}`,
        status: TenantStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
      },
    });

    const tenantBPassword = 'Def005B@123';
    const tenantBHashedPassword = await bcrypt.hash(tenantBPassword, 10);
    const tenantBEmail = `def005b-${tenantBSuffix}@example.com`;

    const createdTenantBUser = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        name: 'DEF-005 Tenant B Owner',
        email: tenantBEmail,
        password: tenantBHashedPassword,
        role: 'OWNER',
        active: true,
      },
      select: {
        id: true,
      },
    });

    tenantBUser = {
      id: createdTenantBUser.id,
      email: tenantBEmail,
      password: tenantBPassword,
    };

    const tenantBLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: tenantBUser.email,
        password: tenantBUser.password,
        tenantCode: tenantB.code,
      })
      .expect(201);

    authB = { Authorization: `Bearer ${tenantBLogin.body.accessToken}` };

    const tenantBCustomer = await prisma.customer.create({
      data: {
        tenantId: tenantB.id,
        name: `DEF-005 B Customer ${tenantBSuffix}`,
      },
    });
    tenantBCustomerId = tenantBCustomer.id;

    const tenantBCategory = await prisma.productCategory.create({
      data: {
        tenantId: tenantB.id,
        name: `DEF-005 B Category ${tenantBSuffix}`,
      },
    });
    tenantBCategoryId = tenantBCategory.id;

    const tenantBProduct = await prisma.product.create({
      data: {
        tenantId: tenantB.id,
        categoryId: tenantBCategory.id,
        name: `DEF-005 B Product ${tenantBSuffix}`,
        costPrice: new Prisma.Decimal('50.00'),
        sellingPrice: new Prisma.Decimal('10.00'),
      },
    });
    tenantBProductId = tenantBProduct.id;

    await prisma.inventoryStock.create({
      data: {
        tenantId: tenantB.id,
        productId: tenantBProductId,
        onHand: new Prisma.Decimal('1000.00'),
        reserved: new Prisma.Decimal('0.00'),
        reorderLevel: new Prisma.Decimal('10.00'),
      },
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({
      where: {
        tenantId,
        quoteId: {
          in: createdQuoteIds,
        },
      },
    });

    await prisma.quoteItem.deleteMany({
      where: {
        quoteId: {
          in: createdQuoteIds,
        },
      },
    });

    await prisma.quote.deleteMany({
      where: {
        tenantId,
        id: {
          in: createdQuoteIds,
        },
      },
    });

    await prisma.inventoryLedgerEntry.deleteMany({
      where: {
        tenantId,
        productId,
        referenceId: {
          in: createdQuoteIds,
        },
      },
    });

    await prisma.inventoryStock.deleteMany({
      where: {
        tenantId,
        productId,
      },
    });

    await prisma.product.deleteMany({
      where: {
        tenantId,
        id: productId,
      },
    });

    await prisma.productCategory.deleteMany({
      where: {
        tenantId,
        id: categoryId,
      },
    });

    await prisma.customer.deleteMany({
      where: {
        tenantId,
        id: customerId,
      },
    });

    await prisma.payment.deleteMany({
      where: {
        tenantId: tenantB.id,
        quoteId: {
          in: createdQuoteIdsTenantB,
        },
      },
    });

    await prisma.quoteItem.deleteMany({
      where: {
        quoteId: {
          in: createdQuoteIdsTenantB,
        },
      },
    });

    await prisma.quote.deleteMany({
      where: {
        tenantId: tenantB.id,
        id: {
          in: createdQuoteIdsTenantB,
        },
      },
    });

    await prisma.inventoryLedgerEntry.deleteMany({
      where: {
        tenantId: tenantB.id,
        productId: tenantBProductId,
        referenceId: {
          in: createdQuoteIdsTenantB,
        },
      },
    });

    await prisma.inventoryStock.deleteMany({
      where: {
        tenantId: tenantB.id,
        productId: tenantBProductId,
      },
    });

    await prisma.product.deleteMany({
      where: {
        tenantId: tenantB.id,
        id: tenantBProductId,
      },
    });

    await prisma.productCategory.deleteMany({
      where: {
        tenantId: tenantB.id,
        id: tenantBCategoryId,
      },
    });

    await prisma.customer.deleteMany({
      where: {
        tenantId: tenantB.id,
        id: tenantBCustomerId,
      },
    });

    await prisma.user.deleteMany({
      where: {
        tenantId: tenantB.id,
        id: tenantBUser.id,
      },
    });

    await prisma.tenant.deleteMany({
      where: {
        id: tenantB.id,
      },
    });

    await app.close();
  });

  async function createDraftQuote() {
    return createDraftQuoteForAuth(auth, customerId, productId, createdQuoteIds);
  }

  async function createDraftQuoteForAuth(
    authHeader: { Authorization: string },
    localCustomerId: string,
    localProductId: string,
    tracking: string[],
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/quotes')
      .set(authHeader)
      .send({
        customerId: localCustomerId,
        items: [
          {
            productId: localProductId,
            quantity: 10,
            unitPrice: 10,
          },
        ],
      })
      .expect(201);

    tracking.push(res.body.id);
    return res.body;
  }

  async function transitionQuote(quoteId: string, status: string) {
    return transitionQuoteForAuth(auth, quoteId, status);
  }

  async function transitionQuoteForAuth(
    authHeader: { Authorization: string },
    quoteId: string,
    status: string,
  ) {
    return request(app.getHttpServer())
      .patch(`/api/quotes/${quoteId}/status`)
      .set(authHeader)
      .send({ status });
  }

  async function createInvoicedQuote() {
    const quote = await createDraftQuote();
    const approveRes = await transitionQuote(quote.id, 'APPROVED');
    expect(approveRes.status).toBe(200);

    const invoiceRes = await transitionQuote(quote.id, 'INVOICED');
    expect(invoiceRes.status).toBe(200);

    return quote;
  }

  async function trackedAmountForQuote(quoteId: string) {
    return trackedAmountForQuoteByTenant(tenantId, quoteId);
  }

  async function trackedAmountForQuoteByTenant(
    localTenantId: string,
    quoteId: string,
  ) {
    const aggregate = await prisma.payment.aggregate({
      where: {
        tenantId: localTenantId,
        quoteId,
        direction: 'RECEIVED',
        status: {
          in: ['PENDING', 'COMPLETED'],
        },
      },
      _sum: {
        amount: true,
      },
    });

    return Number(aggregate._sum.amount ?? 0);
  }

  async function paymentCountForQuote(quoteId: string) {
    return prisma.payment.count({
      where: {
        tenantId,
        quoteId,
        direction: 'RECEIVED',
        status: {
          in: ['PENDING', 'COMPLETED'],
        },
      },
    });
  }

  describe('RT2: Concurrent quote payments', () => {
    it('20 parallel requests serialize by quote and never exceed quote total', async () => {
      const quote = await createInvoicedQuote();

      const requests = Array.from({ length: 20 }, () =>
        request(app.getHttpServer())
          .post('/api/payments')
          .set(auth)
          .send({
            quoteId: quote.id,
            amount: 10,
            method: 'CASH',
            status: 'COMPLETED',
          }),
      );

      const results = await Promise.all(requests);

      const success = results.filter((r) => r.status === 201);
      const failed = results.filter((r) => r.status === 400);

      expect(success.length).toBe(10);
      expect(failed.length).toBe(10);

      const finalTrackedAmount = await trackedAmountForQuote(quote.id);
      expect(finalTrackedAmount).toBe(100);
      expect(finalTrackedAmount).toBeLessThanOrEqual(100);
    });
  });

  describe('RT5: Non-payable quote status', () => {
    it('DRAFT quote payment returns 400 with no payment or commission persistence changes', async () => {
      const quote = await createDraftQuote();

      const paymentCountBefore = await paymentCountForQuote(quote.id);
      const commissionCountBefore = await prisma.agentCommissionAccrual.count({
        where: {
          tenantId,
          quoteId: quote.id,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/payments')
        .set(auth)
        .send({
          quoteId: quote.id,
          amount: 10,
          method: 'CASH',
          status: 'COMPLETED',
        });

      expect(res.status).toBe(400);

      const paymentCountAfter = await paymentCountForQuote(quote.id);
      const commissionCountAfter = await prisma.agentCommissionAccrual.count({
        where: {
          tenantId,
          quoteId: quote.id,
        },
      });

      expect(paymentCountAfter).toBe(paymentCountBefore);
      expect(commissionCountAfter).toBe(commissionCountBefore);
    });
  });

  describe('RT7: Standalone overpayment rejection', () => {
    it('quote total 100 rejects additional payment after reaching full amount', async () => {
      const quote = await createInvoicedQuote();

      await request(app.getHttpServer())
        .post('/api/payments')
        .set(auth)
        .send({
          quoteId: quote.id,
          amount: 100,
          method: 'CASH',
          status: 'COMPLETED',
        })
        .expect(201);

      const overpaymentResponse = await request(app.getHttpServer())
        .post('/api/payments')
        .set(auth)
        .send({
          quoteId: quote.id,
          amount: 1,
          method: 'CASH',
          status: 'COMPLETED',
        });

      expect(overpaymentResponse.status).toBe(400);

      const finalTrackedAmount = await trackedAmountForQuote(quote.id);
      const finalPaymentCount = await paymentCountForQuote(quote.id);
      expect(finalTrackedAmount).toBe(100);
      expect(finalPaymentCount).toBe(1);
    });
  });

  describe('RT8: API contract compatibility', () => {
    it('POST /payments response shape is unchanged for quote payment', async () => {
      const quote = await createInvoicedQuote();

      const res = await request(app.getHttpServer())
        .post('/api/payments')
        .set(auth)
        .send({
          quoteId: quote.id,
          amount: 20,
          method: 'CASH',
          status: 'COMPLETED',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('quoteId', quote.id);
      expect(res.body).toHaveProperty('customerId', customerId);
      expect(res.body).toHaveProperty('amount');
      expect(res.body).toHaveProperty('direction', 'RECEIVED');
      expect(res.body).toHaveProperty('method', 'CASH');
      expect(res.body).toHaveProperty('status', 'COMPLETED');
      expect(res.body).toHaveProperty('paymentDate');
      expect(res.body).toHaveProperty('quote');
      expect(res.body.quote).toHaveProperty('id', quote.id);
    });
  });

  describe('RT9: Atomic rollback on commission failure', () => {
    it('commission failure rolls back payment creation', async () => {
      const quote = await createInvoicedQuote();

      const spy = jest
        .spyOn(commissionsService, 'markAccrualsEarnedWithinTransaction')
        .mockRejectedValueOnce(new Error('forced commission failure'));

      const paymentsBefore = await paymentCountForQuote(quote.id);
      const trackedAmountBefore = await trackedAmountForQuote(quote.id);

      const res = await request(app.getHttpServer())
        .post('/api/payments')
        .set(auth)
        .send({
          quoteId: quote.id,
          amount: 10,
          method: 'CASH',
          status: 'COMPLETED',
        });

      expect(res.status).toBe(500);

      const paymentsAfter = await paymentCountForQuote(quote.id);
      const trackedAmountAfter = await trackedAmountForQuote(quote.id);

      expect(paymentsAfter).toBe(paymentsBefore);
      expect(trackedAmountAfter).toBe(trackedAmountBefore);

      spy.mockRestore();
    });
  });

  describe('RT11: Tenant isolation for quote payment coordination', () => {
    it('payments across tenants remain aggregate- and balance-isolated', async () => {
      const quoteA = await createInvoicedQuote();
      const quoteB = await createDraftQuoteForAuth(
        authB,
        tenantBCustomerId,
        tenantBProductId,
        createdQuoteIdsTenantB,
      );

      const approveB = await transitionQuoteForAuth(authB, quoteB.id, 'APPROVED');
      expect(approveB.status).toBe(200);
      const invoiceB = await transitionQuoteForAuth(authB, quoteB.id, 'INVOICED');
      expect(invoiceB.status).toBe(200);

      const [firstA, firstB] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/payments')
          .set(auth)
          .send({
            quoteId: quoteA.id,
            amount: 100,
            method: 'CASH',
            status: 'COMPLETED',
          }),
        request(app.getHttpServer())
          .post('/api/payments')
          .set(authB)
          .send({
            quoteId: quoteB.id,
            amount: 100,
            method: 'CASH',
            status: 'COMPLETED',
          }),
      ]);

      expect(firstA.status).toBe(201);
      expect(firstB.status).toBe(201);

      const [overA, overB] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/payments')
          .set(auth)
          .send({
            quoteId: quoteA.id,
            amount: 1,
            method: 'CASH',
            status: 'COMPLETED',
          }),
        request(app.getHttpServer())
          .post('/api/payments')
          .set(authB)
          .send({
            quoteId: quoteB.id,
            amount: 1,
            method: 'CASH',
            status: 'COMPLETED',
          }),
      ]);

      expect(overA.status).toBe(400);
      expect(overB.status).toBe(400);

      const finalTrackedAmountA = await trackedAmountForQuoteByTenant(tenantId, quoteA.id);
      const finalTrackedAmountB = await trackedAmountForQuoteByTenant(tenantB.id, quoteB.id);

      expect(finalTrackedAmountA).toBe(100);
      expect(finalTrackedAmountB).toBe(100);
    });
  });
});
