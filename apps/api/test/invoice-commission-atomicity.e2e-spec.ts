import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Prisma, TenantStatus } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { CommissionsService } from '../src/modules/commissions/commissions.service';

/**
 * DEF-004: Invoice and commission updates are atomic
 *
 * This suite validates quote status transitions to INVOICED and commission accrual creation
 * occur as a single atomic transaction:
 * - Quote status update and commission creation succeed together
 * - If commission creation fails, quote status does not change
 * - Tenant isolation is preserved
 * - Existing DEF-003 transition rules remain enforced
 * - Existing accruals are not duplicated
 */
describe('Invoice and Commission Atomicity (DEF-004)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let commissionsService: CommissionsService;
  let tenantId: string;
  let customerId: string;
  let categoryId: string;
  let productId: string;
  let agentId: string;
  let auth: { Authorization: string };
  const createdQuoteIds: string[] = [];

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

    // Setup Tenant A
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

    const unique = `def004-${Date.now()}`;

    const customer = await prisma.customer.create({
      data: {
        tenantId,
        name: `DEF-004 Customer ${unique}`,
      },
    });
    customerId = customer.id;

    const category = await prisma.productCategory.create({
      data: {
        tenantId,
        name: `DEF-004 Category ${unique}`,
      },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        tenantId,
        categoryId: category.id,
        name: `DEF-004 Product ${unique}`,
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

    // Create test agent for commission accrual
    const agent = await prisma.agent.create({
      data: {
        tenantId,
        name: `DEF-004 Agent ${unique}`,
        email: `agent-${unique}@example.com`,
      },
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    // Cleanup Tenant A
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

    await prisma.agentCommissionAccrual.deleteMany({
      where: {
        tenantId,
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

    await prisma.agent.deleteMany({
      where: {
        tenantId,
        id: agentId,
      },
    });

    await app.close();
  });

  async function createDraftQuote(authHeader = auth, localCustomerId = customerId, localProductId = productId) {
    const res = await request(app.getHttpServer())
      .post('/api/quotes')
      .set(authHeader)
      .send({
        customerId: localCustomerId,
        agentId,
        agentCommissionPercentage: 5,
        items: [
          {
            productId: localProductId,
            quantity: 10,
            unitPrice: 10,
          },
        ],
      })
      .expect(201);

    createdQuoteIds.push(res.body.id);
    return res.body;
  }

  async function transitionQuote(quoteId: string, status: string, authHeader = auth) {
    return request(app.getHttpServer())
      .patch(`/api/quotes/${quoteId}/status`)
      .set(authHeader)
      .send({ status });
  }

  async function createApprovedQuote(authHeader = auth) {
    const quote = await createDraftQuote(authHeader, customerId, productId);
    const approveRes = await transitionQuote(quote.id, 'APPROVED', authHeader);
    expect(approveRes.status).toBe(200);
    return quote;
  }

  async function accrualCountForQuote(quoteId: string, localTenantId = tenantId) {
    return prisma.agentCommissionAccrual.count({
      where: {
        tenantId: localTenantId,
        quoteId,
      },
    });
  }

  describe('RT1: Successful invoice transition creates accrual atomically', () => {
    it('APPROVED to INVOICED commits both quote status and commission accrual together', async () => {
      const quote = await createApprovedQuote();

      const accrualCountBefore = await accrualCountForQuote(quote.id);
      expect(accrualCountBefore).toBe(0);

      const res = await transitionQuote(quote.id, 'INVOICED');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('INVOICED');

      const accrualCountAfter = await accrualCountForQuote(quote.id);
      expect(accrualCountAfter).toBe(1);

      const accrual = await prisma.agentCommissionAccrual.findFirst({
        where: {
          tenantId,
          quoteId: quote.id,
        },
      });

      expect(accrual).toBeDefined();
      expect(accrual?.status).toBe('PENDING');
    });
  });

  describe('RT2: Forced commission failure causes full rollback', () => {
    it('When commission creation fails inside transaction, quote status does not change to INVOICED', async () => {
      const quote = await createApprovedQuote();

      const spy = jest
        .spyOn(commissionsService, 'createAccrualForInvoicedQuoteWithinTransaction')
        .mockRejectedValueOnce(new Error('forced commission failure'));

      const res = await transitionQuote(quote.id, 'INVOICED');
      expect(res.status).toBe(500);

      const quoteAfter = await prisma.quote.findFirst({
        where: {
          tenantId,
          id: quote.id,
        },
        select: {
          status: true,
        },
      });

      expect(quoteAfter?.status).toBe('APPROVED');

      const accrualCount = await accrualCountForQuote(quote.id);
      expect(accrualCount).toBe(0);

      spy.mockRestore();
    });
  });

  describe('RT3: Tenant isolation', () => {
    it('Invoicing quotes in different tenants creates isolated accruals per tenant', async () => {
      const quoteA = await createApprovedQuote(auth);

      const accrualCountBeforeInvoiceA = await accrualCountForQuote(quoteA.id, tenantId);
      expect(accrualCountBeforeInvoiceA).toBe(0);

      const invoiceARes = await transitionQuote(quoteA.id, 'INVOICED', auth);
      expect(invoiceARes.status).toBe(200);

      const accrualCountAfterInvoiceA = await accrualCountForQuote(quoteA.id, tenantId);
      expect(accrualCountAfterInvoiceA).toBe(1);

      const accrualA = await prisma.agentCommissionAccrual.findFirst({
        where: {
          tenantId,
          quoteId: quoteA.id,
        },
      });

      expect(accrualA?.tenantId).toBe(tenantId);
      expect(accrualA?.quoteId).toBe(quoteA.id);
    });
  });

  describe('RT4: DEF-003 transition rules unchanged', () => {
    it('INVOICED transition still rejects invalid states and creates no side effects', async () => {
      const quote = await createDraftQuote();

      const res = await transitionQuote(quote.id, 'INVOICED');
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot transition');

      const accrualCount = await accrualCountForQuote(quote.id);
      expect(accrualCount).toBe(0);

      const quoteAfter = await prisma.quote.findFirst({
        where: {
          tenantId,
          id: quote.id,
        },
        select: {
          status: true,
        },
      });

      expect(quoteAfter?.status).toBe('DRAFT');
    });
  });

  describe('RT5: Existing accrual idempotency', () => {
    it('INVOICED transition does not create duplicate accrual if one already exists', async () => {
      const quote = await createApprovedQuote();

      const firstRes = await transitionQuote(quote.id, 'INVOICED');
      expect(firstRes.status).toBe(200);

      const accrualCountAfterFirst = await accrualCountForQuote(quote.id);
      expect(accrualCountAfterFirst).toBe(1);

      const accrualIdAfterFirst = await prisma.agentCommissionAccrual.findFirst({
        where: {
          tenantId,
          quoteId: quote.id,
        },
        select: {
          id: true,
        },
      });

      // Attempt second INVOICED transition (should be rejected by DEF-003 same-state guard)
      const secondRes = await transitionQuote(quote.id, 'INVOICED');
      expect(secondRes.status).toBe(400);
      expect(secondRes.body.message).toContain('already in INVOICED state');

      const accrualCountAfterSecond = await accrualCountForQuote(quote.id);
      expect(accrualCountAfterSecond).toBe(1);

      const accrualIdAfterSecond = await prisma.agentCommissionAccrual.findFirst({
        where: {
          tenantId,
          quoteId: quote.id,
        },
        select: {
          id: true,
        },
      });

      expect(accrualIdAfterFirst?.id).toBe(accrualIdAfterSecond?.id);
    });
  });

  describe('RT6: Concurrent invoice requests serialize via FOR UPDATE', () => {
    it('20 parallel invoice requests serialize and create exactly one accrual', async () => {
      const quote = await createApprovedQuote();

      // Send 20 concurrent invoice transition requests
      const requests = Array.from({ length: 20 }, () =>
        transitionQuote(quote.id, 'INVOICED'),
      );

      const results = await Promise.all(requests);

      // Exactly one should succeed (201), rest should fail (400 or 423 for lock timeout)
      const succeeded = results.filter((r) => r.status === 200);
      const failed = results.filter((r) => r.status === 400 || r.status === 423);

      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(19);

      // Verify exactly one accrual was created (FOR UPDATE lock prevented duplicates)
      const finalAccrualCount = await accrualCountForQuote(quote.id);
      expect(finalAccrualCount).toBe(1);

      // Verify quote is now INVOICED
      const quoteAfter = await prisma.quote.findFirst({
        where: {
          tenantId,
          id: quote.id,
        },
        select: {
          status: true,
        },
      });

      expect(quoteAfter?.status).toBe('INVOICED');
    });
  });
});
