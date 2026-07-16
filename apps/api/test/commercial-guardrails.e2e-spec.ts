import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

describe('Commercial Guardrails E2E', () => {
  let app: INestApplication;
  let accessToken: string;
  let customerId: string;
  let productId: string;
  let supplierId: string;

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

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'owner@demo.com',
        password: 'Demo@1234',
      })
      .expect(201);

    accessToken = loginResponse.body.accessToken;

    const customersResponse = await request(app.getHttpServer())
      .get('/api/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const productsResponse = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(customersResponse.body.length).toBeGreaterThan(0);
    expect(productsResponse.body.length).toBeGreaterThan(0);

    customerId = customersResponse.body[0].id;
    productId = productsResponse.body[0].id;

    const supplierResponse = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `Guardrail Supplier ${Date.now()}`,
        phone: '9000012345',
        email: 'guardrail.supplier@example.com',
        gstNumber: '29ABCDE1234F2Z5',
      })
      .expect(201);

    supplierId = supplierResponse.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks over-collection for quote payments', async () => {
    const quoteResponse = await request(app.getHttpServer())
      .post('/api/quotes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerId,
        items: [
          {
            productId,
            quantity: 1,
          },
        ],
        notes: 'Guardrail test quote payment cap',
      })
      .expect(201);

    const quoteId = quoteResponse.body.id;
    const totalAmount = Number(quoteResponse.body.totalAmount);

    await request(app.getHttpServer())
      .patch(`/api/quotes/${quoteId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'APPROVED',
      })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/quotes/${quoteId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'INVOICED',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        quoteId,
        amount: totalAmount,
        method: 'UPI',
      })
      .expect(201);

    const secondPayment = await request(app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        quoteId,
        amount: 1,
        method: 'UPI',
      })
      .expect(400);

    expect(String(secondPayment.body.message)).toContain(
      'Payment exceeds quote balance',
    );
  });

  it('blocks sales return quantity beyond sold quantity', async () => {
    const quoteResponse = await request(app.getHttpServer())
      .post('/api/quotes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerId,
        items: [
          {
            productId,
            quantity: 1,
          },
        ],
        notes: 'Guardrail test sales return cap',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/quotes/${quoteResponse.body.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'APPROVED',
      })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/quotes/${quoteResponse.body.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'INVOICED',
      })
      .expect(200);

    const invalidReturn = await request(app.getHttpServer())
      .post('/api/returns')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'SALES_RETURN',
        quoteId: quoteResponse.body.id,
        items: [
          {
            productId,
            quantity: 2,
            unitPrice: Number(quoteResponse.body.totalAmount),
            restockToInventory: true,
          },
        ],
      })
      .expect(400);

    expect(String(invalidReturn.body.message)).toContain(
      'Return quantity exceeds sold quantity',
    );
  });

  it('blocks sales return creation for non-invoiced quote', async () => {
    const quoteResponse = await request(app.getHttpServer())
      .post('/api/quotes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerId,
        items: [
          {
            productId,
            quantity: 1,
          },
        ],
        notes: 'Guardrail test non-invoiced sales return',
      })
      .expect(201);

    const invalidReturn = await request(app.getHttpServer())
      .post('/api/returns')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'SALES_RETURN',
        quoteId: quoteResponse.body.id,
        items: [
          {
            productId,
            quantity: 1,
            unitPrice: Number(quoteResponse.body.totalAmount),
            restockToInventory: true,
          },
        ],
      })
      .expect(400);

    expect(String(invalidReturn.body.message)).toContain(
      'Sales return is allowed only for invoiced or dispatched quotes',
    );
  });

  it('blocks purchase return quantity beyond received quantity', async () => {
    const purchaseOrder = await request(app.getHttpServer())
      .post('/api/purchases')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        supplierId,
        items: [
          {
            productId,
            quantity: 1,
            unitCost: 100,
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/purchases/${purchaseOrder.body.id}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    const invalidReturn = await request(app.getHttpServer())
      .post('/api/returns')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'PURCHASE_RETURN',
        purchaseOrderId: purchaseOrder.body.id,
        items: [
          {
            productId,
            quantity: 2,
            unitPrice: 100,
            restockToInventory: false,
          },
        ],
      })
      .expect(400);

    expect(String(invalidReturn.body.message)).toContain(
      'Return quantity exceeds received quantity',
    );
  });

  it('blocks invalid purchase order status transition', async () => {
    const purchaseOrder = await request(app.getHttpServer())
      .post('/api/purchases')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        supplierId,
        items: [
          {
            productId,
            quantity: 1,
            unitCost: 120,
          },
        ],
      })
      .expect(201);

    const invalidTransition = await request(app.getHttpServer())
      .patch(`/api/purchases/${purchaseOrder.body.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'DRAFT',
      })
      .expect(400);

    expect(String(invalidTransition.body.message)).toContain(
      'Invalid purchase order status transition',
    );
  });

  it('blocks direct return transition from REQUESTED to COMPLETED', async () => {
    const quoteResponse = await request(app.getHttpServer())
      .post('/api/quotes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerId,
        items: [
          {
            productId,
            quantity: 1,
          },
        ],
        notes: 'Guardrail test return transition',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/quotes/${quoteResponse.body.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'APPROVED',
      })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/quotes/${quoteResponse.body.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'INVOICED',
      })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/quotes/${quoteResponse.body.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'DISPATCHED',
      })
      .expect(200);

    const createdReturn = await request(app.getHttpServer())
      .post('/api/returns')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'SALES_RETURN',
        quoteId: quoteResponse.body.id,
        items: [
          {
            productId,
            quantity: 1,
            unitPrice: Number(quoteResponse.body.totalAmount),
            restockToInventory: true,
          },
        ],
      })
      .expect(201);

    const invalidTransition = await request(app.getHttpServer())
      .patch(`/api/returns/${createdReturn.body.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'COMPLETED',
      })
      .expect(400);

    expect(String(invalidTransition.body.message)).toContain(
      'Invalid return status transition',
    );
  });
});
