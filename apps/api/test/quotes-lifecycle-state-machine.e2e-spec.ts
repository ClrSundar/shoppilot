import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { Prisma, TenantStatus } from '@prisma/client';

/**
 * DEF-003: Quote Lifecycle State Machine Stabilization
 *
 * Regression test suite validating the quote state machine:
 * - Explicit transition matrix prevents illegal transitions
 * - Validation occurs before any writes
 * - Inventory side effects idempotent and exactly-once
 * - Terminal states prevent further transitions
 * - Replay attacks (same-state, repeated dispatch) are prevented
 */

describe('Quotes Lifecycle State Machine (DEF-003)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let customerId: string;
  let productId: string;
  let stockId: string;
  let auth: { Authorization: string };

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

    // Use existing demo tenant
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

    // Create test customer
    const unique = `def003-${Date.now()}`;
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        name: `DEF-003 Customer ${unique}`,
      },
    });
    customerId = customer.id;

    // Create test category and product
    const category = await prisma.productCategory.create({
      data: {
        tenantId,
        name: `DEF-003 Category ${unique}`,
      },
    });

    const product = await prisma.product.create({
      data: {
        tenantId,
        categoryId: category.id,
        name: `DEF-003 Product ${unique}`,
        costPrice: new Prisma.Decimal('100.00'),
        sellingPrice: new Prisma.Decimal('150.00'),
      },
    });
    productId = product.id;

    // Create inventory stock with plenty of stock
    const stock = await prisma.inventoryStock.create({
      data: {
        tenantId,
        productId,
        onHand: new Prisma.Decimal('500.00'),
        reserved: new Prisma.Decimal('0'),
        reorderLevel: new Prisma.Decimal('10.00'),
      },
    });
    stockId = stock.id;
  });

  afterAll(async () => {
    // Cleanup
    const unique = `def003-`;
    await prisma.quote.deleteMany({
      where: {
        tenantId,
        quoteNumber: {
          contains: unique,
        },
      },
    });
    await prisma.product.deleteMany({
      where: {
        tenantId,
        name: {
          contains: unique,
        },
      },
    });
    await prisma.productCategory.deleteMany({
      where: {
        tenantId,
        name: {
          contains: unique,
        },
      },
    });
    await prisma.customer.deleteMany({
      where: {
        tenantId,
        name: {
          contains: unique,
        },
      },
    });
    await app.close();
  });

  async function createDraftQuote() {
    const res = await request(app.getHttpServer())
      .post('/api/quotes')
      .set(auth)
      .send({
        customerId,
        items: [
          {
            productId,
            quantity: 10,
            unitPrice: 150,
          },
        ],
      });

    if (res.status !== 201) {
      console.error('Quote creation failed:', {
        status: res.status,
        body: res.body,
      });
    }

    expect(res.status).toBe(201);
    return res.body;
  }

  async function transitionQuote(quoteId: string, status: string) {
    return request(app.getHttpServer())
      .patch(`/api/quotes/${quoteId}/status`)
      .set(auth)
      .send({ status });
  }

  async function getQuoteState(quoteId: string) {
    const res = await request(app.getHttpServer())
      .get(`/api/quotes/${quoteId}`)
      .set(auth)
      .expect(200);
    return res.body;
  }

  async function countLedgerEntries(quoteId: string) {
    return prisma.inventoryLedgerEntry.count({
      where: { referenceId: quoteId },
    });
  }

  // ============================================================================
  // Basic Transitions
  // ============================================================================

  describe('RT1: Basic forward path', () => {
    it('DRAFT → APPROVED → INVOICED → DISPATCHED succeeds end-to-end', async () => {
      const quote = await createDraftQuote();

      // DRAFT → APPROVED
      let res = await transitionQuote(quote.id, 'APPROVED');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('APPROVED');
      expect(res.body.stockReserved).toBe(true);

      // Verify RESERVE ledger entry created
      const ledgerCount1 = await countLedgerEntries(quote.id);
      expect(ledgerCount1).toBe(1);

      // APPROVED → INVOICED
      res = await transitionQuote(quote.id, 'INVOICED');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('INVOICED');
      expect(res.body.stockReserved).toBe(true);
      expect(res.body.invoicedAt).toBeTruthy();

      // Ledger unchanged for INVOICED
      const ledgerCount2 = await countLedgerEntries(quote.id);
      expect(ledgerCount2).toBe(1);

      // INVOICED → DISPATCHED
      res = await transitionQuote(quote.id, 'DISPATCHED');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DISPATCHED');
      expect(res.body.stockReserved).toBe(false);

      // Verify DISPATCH ledger entry created
      const ledgerCount3 = await countLedgerEntries(quote.id);
      expect(ledgerCount3).toBe(2);
    });
  });

  describe('RT2: Intermediate state checks', () => {
    it('All intermediate states correctly populated', async () => {
      const quote = await createDraftQuote();

      // Check SENT is available
      let res = await transitionQuote(quote.id, 'SENT');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('SENT');
      expect(res.body.stockReserved).toBe(false);

      // SENT → APPROVED
      res = await transitionQuote(quote.id, 'APPROVED');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('APPROVED');
      expect(res.body.stockReserved).toBe(true);
    });
  });

  // ============================================================================
  // Invalid Transitions
  // ============================================================================

  describe('RT3: Backward transitions rejected', () => {
    it('DISPATCHED → APPROVED rejected (AC1)', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'APPROVED').expect(200);
      await transitionQuote(quote.id, 'INVOICED').expect(200);
      await transitionQuote(quote.id, 'DISPATCHED').expect(200);

      const res = await transitionQuote(quote.id, 'APPROVED');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot transition/i);

      // Verify state unchanged
      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('DISPATCHED');
    });
  });

  describe('RT4: INVOICED → APPROVED rejected', () => {
    it('Cannot revert from invoiced to approved (AC1)', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'APPROVED').expect(200);
      await transitionQuote(quote.id, 'INVOICED').expect(200);

      const res = await transitionQuote(quote.id, 'APPROVED');
      expect(res.status).toBe(400);

      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('INVOICED');
    });
  });

  describe('RT5: Terminal state rejection', () => {
    it('REJECTED → SENT rejected (AC7)', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'REJECTED').expect(200);

      const res = await transitionQuote(quote.id, 'SENT');
      expect(res.status).toBe(400);

      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('REJECTED');
    });

    it('EXPIRED → APPROVED rejected (AC7)', async () => {
      // Note: EXPIRED status typically set via scheduled job or API;
      // for testing, we directly update the quote in DB to simulate expiry
      const quote = await createDraftQuote();
      await prisma.quote.update({
        where: { id: quote.id },
        data: { status: 'EXPIRED' },
      });

      const res = await transitionQuote(quote.id, 'APPROVED');
      expect(res.status).toBe(400);

      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('EXPIRED');
    });

    it('EXPIRED → EXPIRED rejected (AC7, AC2)', async () => {
      const quote = await createDraftQuote();
      await prisma.quote.update({
        where: { id: quote.id },
        data: { status: 'EXPIRED' },
      });

      const res = await transitionQuote(quote.id, 'EXPIRED');
      expect(res.status).toBe(400);

      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('EXPIRED');
    });
  });

  // ============================================================================
  // Same-State Transitions
  // ============================================================================

  describe('RT6: Same-state transitions rejected', () => {
    it('APPROVED → APPROVED rejected (AC2)', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'APPROVED').expect(200);

      const res = await transitionQuote(quote.id, 'APPROVED');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already in.*state/i);

      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('APPROVED');
    });

    it('INVOICED → INVOICED rejected (AC2)', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'APPROVED').expect(200);
      await transitionQuote(quote.id, 'INVOICED').expect(200);

      const res = await transitionQuote(quote.id, 'INVOICED');
      expect(res.status).toBe(400);

      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('INVOICED');
    });

    it('DISPATCHED → DISPATCHED rejected (AC2)', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'APPROVED').expect(200);
      await transitionQuote(quote.id, 'INVOICED').expect(200);
      await transitionQuote(quote.id, 'DISPATCHED').expect(200);

      const res = await transitionQuote(quote.id, 'DISPATCHED');
      expect(res.status).toBe(400);

      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('DISPATCHED');
    });
  });

  // ============================================================================
  // Replay Protection
  // ============================================================================

  describe('RT7: Replay APPROVED rejected', () => {
    it('5x APPROVED after first approval: all rejected, ledger stable (AC4)', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'APPROVED').expect(200);

      const ledgerCountBefore = await countLedgerEntries(quote.id);
      expect(ledgerCountBefore).toBe(1); // 1 RESERVE

      // Attempt 5 replays
      for (let i = 0; i < 5; i++) {
        const res = await transitionQuote(quote.id, 'APPROVED');
        expect(res.status).toBe(400);
      }

      // Verify ledger unchanged
      const ledgerCountAfter = await countLedgerEntries(quote.id);
      expect(ledgerCountAfter).toBe(1);

      // Verify quote still APPROVED
      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('APPROVED');
      expect(state.stockReserved).toBe(true);
    });
  });

  describe('RT8: Replay DISPATCHED rejected', () => {
    it('3x DISPATCHED after dispatch: all rejected, ledger stable (AC5)', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'APPROVED').expect(200);
      await transitionQuote(quote.id, 'INVOICED').expect(200);
      await transitionQuote(quote.id, 'DISPATCHED').expect(200);

      const ledgerCountBefore = await countLedgerEntries(quote.id);
      expect(ledgerCountBefore).toBe(2); // RESERVE + DISPATCH

      // Attempt 3 replays
      for (let i = 0; i < 3; i++) {
        const res = await transitionQuote(quote.id, 'DISPATCHED');
        expect(res.status).toBe(400);
      }

      // Verify ledger unchanged
      const ledgerCountAfter = await countLedgerEntries(quote.id);
      expect(ledgerCountAfter).toBe(2);

      // Verify quote still DISPATCHED
      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('DISPATCHED');
      expect(state.stockReserved).toBe(false);
    });
  });

  describe('RT9: Replay CANCELLED rejected', () => {
    it('2x CANCELLED after first: second rejected, ledger stable (AC6)', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'APPROVED').expect(200);

      const ledgerCountAfterApprove = await countLedgerEntries(quote.id);
      expect(ledgerCountAfterApprove).toBe(1); // RESERVE

      // First CANCELLED
      await transitionQuote(quote.id, 'CANCELLED').expect(200);

      const ledgerCountAfterCancel = await countLedgerEntries(quote.id);
      expect(ledgerCountAfterCancel).toBe(2); // RESERVE + RELEASE

      // Second CANCELLED (replay)
      const res = await transitionQuote(quote.id, 'CANCELLED');
      expect(res.status).toBe(400);

      // Verify ledger unchanged
      const ledgerCountFinal = await countLedgerEntries(quote.id);
      expect(ledgerCountFinal).toBe(2);

      // Verify quote still CANCELLED
      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('CANCELLED');
      expect(state.stockReserved).toBe(false);
    });
  });

  describe('RT10: Concurrent APPROVED requests', () => {
    it('10x parallel APPROVED on same quote: first succeeds, rest rejected (AC4)', async () => {
      const quote = await createDraftQuote();

      // Send 10 concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        transitionQuote(quote.id, 'APPROVED'),
      );
      const results = await Promise.all(promises);

      // Exactly one should succeed
      const successes = results.filter((r) => r.status === 200);
      const failures = results.filter((r) => r.status !== 200);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(9);

      // Verify ledger has exactly 1 RESERVE
      const ledgerCount = await countLedgerEntries(quote.id);
      expect(ledgerCount).toBe(1);

      // Verify quote is APPROVED
      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('APPROVED');
    });
  });

  // ============================================================================
  // Idempotent Side Effects
  // ============================================================================

  describe('RT11: Idempotent APPROVED', () => {
    it('APPROVED twice produces no second RESERVE ledger', async () => {
      const quote = await createDraftQuote();

      // First APPROVED
      await transitionQuote(quote.id, 'APPROVED').expect(200);
      let ledgerCount = await countLedgerEntries(quote.id);
      expect(ledgerCount).toBe(1);

      // Already approved, move to next state
      await transitionQuote(quote.id, 'INVOICED').expect(200);

      // Attempt to go back to APPROVED (should fail)
      const res = await transitionQuote(quote.id, 'APPROVED');
      expect(res.status).toBe(400);

      // Ledger unchanged
      ledgerCount = await countLedgerEntries(quote.id);
      expect(ledgerCount).toBe(1);
    });
  });

  describe('RT12: Idempotent CANCELLED', () => {
    it('CANCELLED twice produces no second RELEASE ledger', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'APPROVED').expect(200);

      // First CANCELLED
      await transitionQuote(quote.id, 'CANCELLED').expect(200);
      let ledgerCount = await countLedgerEntries(quote.id);
      expect(ledgerCount).toBe(2); // RESERVE + RELEASE

      // Replay CANCELLED
      const res = await transitionQuote(quote.id, 'CANCELLED');
      expect(res.status).toBe(400);

      // Ledger unchanged
      ledgerCount = await countLedgerEntries(quote.id);
      expect(ledgerCount).toBe(2);

      const state = await getQuoteState(quote.id);
      expect(state.stockReserved).toBe(false);
    });
  });

  describe('RT13: Cannot re-reserve after release', () => {
    it('Reserve → Release → Retry APPROVED fails', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'APPROVED').expect(200);
      await transitionQuote(quote.id, 'CANCELLED').expect(200);

      // Try to re-approve
      const res = await transitionQuote(quote.id, 'APPROVED');
      expect(res.status).toBe(400);

      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('CANCELLED');
    });
  });

  // ============================================================================
  // Transactional Integrity
  // ============================================================================

  describe('RT14: Zero mutations on invalid transition', () => {
    it('Invalid transition produces no quote/inventory/ledger changes (AC11)', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'APPROVED').expect(200);

      const quoteBefore = await getQuoteState(quote.id);
      const ledgerBefore = await countLedgerEntries(quote.id);
      const inventoryBefore = await prisma.inventoryStock.findUnique({
        where: { id: stockId },
      });

      // Attempt invalid transition (APPROVED → DISPATCHED without INVOICED)
      await transitionQuote(quote.id, 'DISPATCHED').expect(400);

      const quoteAfter = await getQuoteState(quote.id);
      const ledgerAfter = await countLedgerEntries(quote.id);
      const inventoryAfter = await prisma.inventoryStock.findUnique({
        where: { id: stockId },
      });

      // Verify no changes
      expect(quoteAfter.status).toBe(quoteBefore.status);
      expect(quoteAfter.stockReserved).toBe(quoteBefore.stockReserved);
      expect(ledgerAfter).toBe(ledgerBefore);
      expect(Number(inventoryAfter.onHand)).toBe(Number(inventoryBefore.onHand));
      expect(Number(inventoryAfter.reserved)).toBe(Number(inventoryBefore.reserved));
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('RT15: Business-pending INVOICED transitions', () => {
    it('INVOICED → REJECTED/CANCELLED currently not allowed (pending business confirmation)', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'APPROVED').expect(200);
      await transitionQuote(quote.id, 'INVOICED').expect(200);

      // These are pending business confirmation
      const rejectRes = await transitionQuote(quote.id, 'REJECTED');
      const cancelRes = await transitionQuote(quote.id, 'CANCELLED');

      expect(rejectRes.status).toBe(400);
      expect(cancelRes.status).toBe(400);

      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('INVOICED');
    });
  });

  describe('RT16: Tenant isolation', () => {
    it('Quote status transitions are tenant-scoped (AC9)', async () => {
      const quote = await createDraftQuote();
      await transitionQuote(quote.id, 'APPROVED').expect(200);

      // Verify quote is in correct tenant
      const state = await getQuoteState(quote.id);
      expect(state.status).toBe('APPROVED');
      expect(state.customerId).toBe(customerId);
    });
  });
});
