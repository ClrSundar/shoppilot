import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

describe('Customer Type Pricing E2E', () => {
  let app: INestApplication;
  let accessToken: string;
  let productId: string;
  let baseUnitPrice: number;

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

    const productsResponse = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(productsResponse.body.length).toBeGreaterThan(0);

    productId = productsResponse.body[0].id;
    baseUnitPrice = Number(productsResponse.body[0].sellingPrice);
    expect(baseUnitPrice).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await app.close();
  });

  const setupCustomerTypeAndCustomer = async (
    name: string,
    code: string,
    discountPct: number,
  ) => {
    const suffix = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);

    const customerTypeResponse = await request(app.getHttpServer())
      .post('/api/customer-types')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name,
        code: `${code}_${suffix}`,
        defaultDiscountPercentage: discountPct,
      })
      .expect(201);

    const customerResponse = await request(app.getHttpServer())
      .post('/api/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${name} Customer ${suffix}`,
        phone: `99${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
        customerTypeId: customerTypeResponse.body.id,
      })
      .expect(201);

    return {
      customerType: customerTypeResponse.body,
      customer: customerResponse.body,
    };
  };

  it('validates API/PricingService behavior only (no web payload assumptions)', async () => {
    const { customer } = await setupCustomerTypeAndCustomer(
      'API Scope',
      'API_SCOPE',
      10,
    );

    const quoteResponse = await request(app.getHttpServer())
      .post('/api/quotes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerId: customer.id,
        items: [
          {
            productId,
            quantity: 1,
            unitPrice: baseUnitPrice,
          },
        ],
      })
      .expect(201);

    const discountAmount = Number(quoteResponse.body.discountAmount);
    expect(discountAmount).toBeCloseTo(Number((baseUnitPrice * 0.1).toFixed(2)), 2);
  });

  it('applies Retail default discount 0%', async () => {
    const { customer } = await setupCustomerTypeAndCustomer('Retail', 'RETAIL', 0);

    const quoteResponse = await request(app.getHttpServer())
      .post('/api/quotes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerId: customer.id,
        items: [
          {
            productId,
            quantity: 1,
            unitPrice: baseUnitPrice,
          },
        ],
      })
      .expect(201);

    const subtotalBeforeDiscount = Number(quoteResponse.body.subtotalBeforeDiscount);
    const subtotal = Number(quoteResponse.body.subtotal);
    const totalDiscount = Number(quoteResponse.body.discountAmount);

    expect(subtotalBeforeDiscount).toBeCloseTo(baseUnitPrice, 2);
    expect(totalDiscount).toBeCloseTo(0, 2);
    expect(subtotal).toBeCloseTo(baseUnitPrice, 2);
  });

  it('applies Wholesale default discount 5%', async () => {
    const { customer } = await setupCustomerTypeAndCustomer(
      'Wholesale',
      'WHOLESALE',
      5,
    );

    const quoteResponse = await request(app.getHttpServer())
      .post('/api/quotes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerId: customer.id,
        items: [
          {
            productId,
            quantity: 1,
            unitPrice: baseUnitPrice,
          },
        ],
      })
      .expect(201);

    const subtotalBeforeDiscount = Number(quoteResponse.body.subtotalBeforeDiscount);
    const subtotal = Number(quoteResponse.body.subtotal);
    const totalDiscount = Number(quoteResponse.body.discountAmount);
    const expectedDiscount = Number((subtotalBeforeDiscount * 0.05).toFixed(2));

    expect(totalDiscount).toBeCloseTo(expectedDiscount, 2);
    expect(subtotal).toBeCloseTo(subtotalBeforeDiscount - expectedDiscount, 2);
  });

  it('applies Dealer default discount 8%', async () => {
    const { customer } = await setupCustomerTypeAndCustomer('Dealer', 'DEALER', 8);

    const quoteResponse = await request(app.getHttpServer())
      .post('/api/quotes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerId: customer.id,
        items: [
          {
            productId,
            quantity: 1,
            unitPrice: baseUnitPrice,
          },
        ],
      })
      .expect(201);

    const subtotalBeforeDiscount = Number(quoteResponse.body.subtotalBeforeDiscount);
    const subtotal = Number(quoteResponse.body.subtotal);
    const totalDiscount = Number(quoteResponse.body.discountAmount);
    const expectedDiscount = Number((subtotalBeforeDiscount * 0.08).toFixed(2));

    expect(totalDiscount).toBeCloseTo(expectedDiscount, 2);
    expect(subtotal).toBeCloseTo(subtotalBeforeDiscount - expectedDiscount, 2);
  });
});
