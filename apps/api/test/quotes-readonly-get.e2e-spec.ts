import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, QuoteStatus, TenantStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Quotes GET Read-only behavior (DEF-002)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let accessToken = '';
  let tenantId = '';

  let customerId = '';
  let categoryId = '';
  let productId = '';
  let stockId = '';
  let quoteId = '';
  let quoteNumber = '';

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

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'owner@demo.com',
        password: 'Demo@1234',
        tenantCode: 'DEMO',
      })
      .expect(201);

    accessToken = loginResponse.body.accessToken;

    const owner = await prisma.user.findFirst({
      where: {
        email: 'owner@demo.com',
      },
      include: {
        tenant: true,
      },
    });

    if (!owner || owner.tenant.status !== TenantStatus.ACTIVE) {
      throw new Error('Demo owner or active tenant not found for DEF-002 tests');
    }

    tenantId = owner.tenantId;

    const unique = Date.now().toString();

    const customer = await prisma.customer.create({
      data: {
        tenantId,
        name: `DEF-002 Customer ${unique}`,
      },
    });
    customerId = customer.id;

    const category = await prisma.productCategory.create({
      data: {
        tenantId,
        name: `DEF-002 Category ${unique}`,
      },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        tenantId,
        categoryId,
        name: `DEF-002 Product ${unique}`,
        costPrice: new Prisma.Decimal('100.00'),
        sellingPrice: new Prisma.Decimal('150.00'),
      },
    });
    productId = product.id;

    const stock = await prisma.inventoryStock.create({
      data: {
        tenantId,
        productId,
        onHand: new Prisma.Decimal('20.00'),
        reserved: new Prisma.Decimal('5.00'),
      },
    });
    stockId = stock.id;

    const nextQuoteCount = await prisma.quote.count({ where: { tenantId } });
    quoteNumber = `QT-DEF002-${nextQuoteCount + 1}-${unique}`;

    const quote = await prisma.quote.create({
      data: {
        tenantId,
        customerId,
        quoteNumber,
        status: QuoteStatus.APPROVED,
        stockReserved: true,
        validUntil: new Date(Date.now() - 60 * 60 * 1000),
        subtotal: new Prisma.Decimal('150.00'),
        subtotalBeforeDiscount: new Prisma.Decimal('150.00'),
        taxableAmount: new Prisma.Decimal('150.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('150.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        lineDiscountAmount: new Prisma.Decimal('0.00'),
        orderDiscountAmount: new Prisma.Decimal('0.00'),
        taxPercentage: new Prisma.Decimal('0.00'),
        igstAmount: new Prisma.Decimal('0.00'),
        cgstAmount: new Prisma.Decimal('0.00'),
        sgstAmount: new Prisma.Decimal('0.00'),
        items: {
          create: [
            {
              productId,
              productName: product.name,
              quantity: new Prisma.Decimal('5.00'),
              unitPrice: new Prisma.Decimal('30.00'),
              baseUnitPrice: new Prisma.Decimal('30.00'),
              discountAmount: new Prisma.Decimal('0.00'),
              netUnitPrice: new Prisma.Decimal('30.00'),
              lineTotal: new Prisma.Decimal('150.00'),
              taxableAmount: new Prisma.Decimal('150.00'),
              taxAmount: new Prisma.Decimal('0.00'),
              igstAmount: new Prisma.Decimal('0.00'),
              cgstAmount: new Prisma.Decimal('0.00'),
              sgstAmount: new Prisma.Decimal('0.00'),
            },
          ],
        },
      },
    });
    quoteId = quote.id;
  });

  afterAll(async () => {
    if (quoteId) {
      await prisma.quoteItem.deleteMany({ where: { quoteId } });
    }

    if (quoteId) {
      await prisma.quote.deleteMany({ where: { id: quoteId, tenantId } });
    }

    if (stockId) {
      await prisma.inventoryStock.deleteMany({ where: { id: stockId, tenantId } });
    }

    if (productId) {
      await prisma.product.deleteMany({ where: { id: productId, tenantId } });
    }

    if (categoryId) {
      await prisma.productCategory.deleteMany({ where: { id: categoryId, tenantId } });
    }

    if (customerId) {
      await prisma.customer.deleteMany({ where: { id: customerId, tenantId } });
    }

    await app.close();
  });

  async function capturePersistenceState() {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, tenantId },
      select: {
        id: true,
        status: true,
        stockReserved: true,
        updatedAt: true,
      },
    });

    const stock = await prisma.inventoryStock.findFirst({
      where: { id: stockId, tenantId },
      select: {
        id: true,
        reserved: true,
        onHand: true,
        updatedAt: true,
      },
    });

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: {
        id: true,
        updatedAt: true,
      },
    });

    const ledgerCount = await prisma.inventoryLedgerEntry.count({
      where: {
        tenantId,
        referenceType: 'QUOTE',
        referenceId: quoteId,
      },
    });

    return {
      quote,
      stock,
      customer,
      ledgerCount,
    };
  }

  function assertListQuoteContract(quote: Record<string, unknown>) {
    expect(quote).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        quoteNumber: expect.any(String),
        customerId: expect.any(String),
        status: expect.any(String),
        stockReserved: expect.any(Boolean),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        customer: expect.any(Object),
        items: expect.any(Array),
      }),
    );
  }

  function assertDetailQuoteContract(quote: Record<string, unknown>) {
    expect(quote).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        quoteNumber: expect.any(String),
        customerId: expect.any(String),
        status: expect.any(String),
        stockReserved: expect.any(Boolean),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        customer: expect.any(Object),
        items: expect.any(Array),
      }),
    );
  }

  function pickDetailSnapshot(quote: Record<string, any>) {
    return {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      customerId: quote.customerId,
      status: quote.status,
      stockReserved: quote.stockReserved,
      totalAmount: quote.totalAmount,
      validUntil: quote.validUntil,
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
      items: Array.isArray(quote.items)
        ? quote.items.map((item: Record<string, any>) => ({
            id: item.id,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
          }))
        : [],
    };
  }

  it('AC1/AC7/AC8/AC9: GET /quotes is read-only and does not mutate quote, inventory, ledger, customer state', async () => {
    const before = await capturePersistenceState();

    const response = await request(app.getHttpServer())
      .get('/api/quotes')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.some((q: { id: string }) => q.id === quoteId)).toBe(true);

    const responseQuote = response.body.find(
      (q: { id: string }) => q.id === quoteId,
    ) as Record<string, unknown>;
    assertListQuoteContract(responseQuote);

    const after = await capturePersistenceState();

    expect(after.quote?.status).toBe(before.quote?.status);
    expect(after.quote?.stockReserved).toBe(before.quote?.stockReserved);
    expect(after.quote?.updatedAt.toISOString()).toBe(
      before.quote?.updatedAt.toISOString(),
    );

    expect(after.stock?.reserved.toString()).toBe(before.stock?.reserved.toString());
    expect(after.stock?.onHand.toString()).toBe(before.stock?.onHand.toString());
    expect(after.stock?.updatedAt.toISOString()).toBe(
      before.stock?.updatedAt.toISOString(),
    );

    expect(after.customer?.updatedAt.toISOString()).toBe(
      before.customer?.updatedAt.toISOString(),
    );
    expect(after.ledgerCount).toBe(before.ledgerCount);
  });

  it('AC2/AC5/AC6/AC7/AC8/AC9: GET /quotes/:id is read-only and response contract is unchanged', async () => {
    const before = await capturePersistenceState();

    const response = await request(app.getHttpServer())
      .get(`/api/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.id).toBe(quoteId);
    expect(response.body.customerId).toBe(customerId);
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items).toHaveLength(1);
    assertDetailQuoteContract(response.body as Record<string, unknown>);
    expect(response.body.items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        productId: expect.any(String),
        productName: expect.any(String),
      }),
    );

    const after = await capturePersistenceState();

    expect(after.quote?.status).toBe(before.quote?.status);
    expect(after.quote?.stockReserved).toBe(before.quote?.stockReserved);
    expect(after.quote?.updatedAt.toISOString()).toBe(
      before.quote?.updatedAt.toISOString(),
    );

    expect(after.stock?.reserved.toString()).toBe(before.stock?.reserved.toString());
    expect(after.stock?.onHand.toString()).toBe(before.stock?.onHand.toString());
    expect(after.stock?.updatedAt.toISOString()).toBe(
      before.stock?.updatedAt.toISOString(),
    );

    expect(after.customer?.updatedAt.toISOString()).toBe(
      before.customer?.updatedAt.toISOString(),
    );
    expect(after.ledgerCount).toBe(before.ledgerCount);
  });

  it('AC3/AC11: repeated GET detail requests remain idempotent while quote is overdue', async () => {
    const before = await capturePersistenceState();

    let firstSnapshot: Record<string, unknown> | null = null;

    for (let i = 0; i < 100; i += 1) {
      const response = await request(app.getHttpServer())
        .get(`/api/quotes/${quoteId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const currentSnapshot = pickDetailSnapshot(response.body);

      if (!firstSnapshot) {
        firstSnapshot = currentSnapshot;
      } else {
        expect(currentSnapshot).toEqual(firstSnapshot);
      }
    }

    const after = await capturePersistenceState();

    expect(after.quote?.status).toBe(before.quote?.status);
    expect(after.quote?.stockReserved).toBe(before.quote?.stockReserved);
    expect(after.quote?.updatedAt.toISOString()).toBe(
      before.quote?.updatedAt.toISOString(),
    );
    expect(after.stock?.reserved.toString()).toBe(before.stock?.reserved.toString());
    expect(after.stock?.updatedAt.toISOString()).toBe(
      before.stock?.updatedAt.toISOString(),
    );
    expect(after.ledgerCount).toBe(before.ledgerCount);
  });

  it('AC4: parallel GET requests produce zero persistence mutations', async () => {
    const before = await capturePersistenceState();

    const calls = Array.from({ length: 10 }, () =>
      request(app.getHttpServer())
        .get(`/api/quotes/${quoteId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200),
    );

    await Promise.all(calls);

    const after = await capturePersistenceState();

    expect(after.quote?.status).toBe(before.quote?.status);
    expect(after.quote?.stockReserved).toBe(before.quote?.stockReserved);
    expect(after.quote?.updatedAt.toISOString()).toBe(
      before.quote?.updatedAt.toISOString(),
    );
    expect(after.stock?.reserved.toString()).toBe(before.stock?.reserved.toString());
    expect(after.stock?.updatedAt.toISOString()).toBe(
      before.stock?.updatedAt.toISOString(),
    );
    expect(after.ledgerCount).toBe(before.ledgerCount);
  });

  it('AC4: parallel GET list requests produce zero persistence mutations', async () => {
    const before = await capturePersistenceState();

    const calls = Array.from({ length: 10 }, () =>
      request(app.getHttpServer())
        .get('/api/quotes')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200),
    );

    const responses = await Promise.all(calls);

    for (const response of responses) {
      expect(Array.isArray(response.body)).toBe(true);
      const responseQuote = response.body.find(
        (q: { id: string }) => q.id === quoteId,
      ) as Record<string, unknown>;
      expect(responseQuote).toBeDefined();
      assertListQuoteContract(responseQuote);
    }

    const after = await capturePersistenceState();

    expect(after.quote?.status).toBe(before.quote?.status);
    expect(after.quote?.stockReserved).toBe(before.quote?.stockReserved);
    expect(after.quote?.updatedAt.toISOString()).toBe(
      before.quote?.updatedAt.toISOString(),
    );
    expect(after.stock?.reserved.toString()).toBe(before.stock?.reserved.toString());
    expect(after.stock?.updatedAt.toISOString()).toBe(
      before.stock?.updatedAt.toISOString(),
    );
    expect(after.ledgerCount).toBe(before.ledgerCount);
  });

  it('AC4: mixed GET list and detail concurrency produces zero persistence mutations', async () => {
    const before = await capturePersistenceState();

    const mixedCalls = Array.from({ length: 10 }, (_, index) => {
      if (index % 2 === 0) {
        return request(app.getHttpServer())
          .get('/api/quotes')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      }

      return request(app.getHttpServer())
        .get(`/api/quotes/${quoteId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    const responses = await Promise.all(mixedCalls);

    for (let i = 0; i < responses.length; i += 1) {
      const response = responses[i];
      if (i % 2 === 0) {
        expect(Array.isArray(response.body)).toBe(true);
        const responseQuote = response.body.find(
          (q: { id: string }) => q.id === quoteId,
        ) as Record<string, unknown>;
        expect(responseQuote).toBeDefined();
        assertListQuoteContract(responseQuote);
      } else {
        assertDetailQuoteContract(response.body as Record<string, unknown>);
        expect(response.body.id).toBe(quoteId);
      }
    }

    const after = await capturePersistenceState();

    expect(after.quote?.status).toBe(before.quote?.status);
    expect(after.quote?.stockReserved).toBe(before.quote?.stockReserved);
    expect(after.quote?.updatedAt.toISOString()).toBe(
      before.quote?.updatedAt.toISOString(),
    );
    expect(after.stock?.reserved.toString()).toBe(before.stock?.reserved.toString());
    expect(after.stock?.updatedAt.toISOString()).toBe(
      before.stock?.updatedAt.toISOString(),
    );
    expect(after.ledgerCount).toBe(before.ledgerCount);
  });

  it('AC10: quote version remains unchanged when versioning exists', async () => {
    const quoteTableColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Quote'
    `;

    const hasVersion = quoteTableColumns.some((col) => col.column_name === 'version');

    if (!hasVersion) {
      expect(hasVersion).toBe(false);
      return;
    }

    const beforeRows = await prisma.$queryRaw<Array<{ version: number }>>`
      SELECT version FROM "Quote" WHERE id = ${quoteId}
    `;

    await request(app.getHttpServer())
      .get(`/api/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const afterRows = await prisma.$queryRaw<Array<{ version: number }>>`
      SELECT version FROM "Quote" WHERE id = ${quoteId}
    `;

    expect(afterRows[0]?.version).toBe(beforeRows[0]?.version);
  });
});
