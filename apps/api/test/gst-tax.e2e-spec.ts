import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

const round2 = (value: number) => Number(value.toFixed(2));

describe('GST Tax E2E', () => {
  let app: INestApplication;
  let accessToken: string;

  let categoryId: string;
  let customerKaId: string;
  let customerMhId: string;
  let product18Id: string;
  let product12Id: string;
  let supplierId: string;

  const defaultRates = [
    { classificationCode: 'GST18', ratePercentage: 18 },
    { classificationCode: 'GST12', ratePercentage: 12 },
  ];

  const authHeader = () => ({ Authorization: `Bearer ${accessToken}` });

  const setGstConfig = async (rates = defaultRates) => {
    await request(app.getHttpServer())
      .put('/api/tenant-settings/gst-config')
      .set(authHeader())
      .send({
        sellerStateCode: 'KA',
        sellerGstin: '29ABCDE1234F2Z5',
        rates,
      })
      .expect(200);
  };

  const createQuote = async (payload: Record<string, unknown>) => {
    const response = await request(app.getHttpServer())
      .post('/api/quotes')
      .set(authHeader())
      .send(payload)
      .expect(201);

    return response.body;
  };

  const updateQuoteStatus = async (quoteId: string, status: string) => {
    await request(app.getHttpServer())
      .patch(`/api/quotes/${quoteId}/status`)
      .set(authHeader())
      .send({ status })
      .expect(200);
  };

  const invoiceQuote = async (quoteId: string) => {
    await updateQuoteStatus(quoteId, 'APPROVED');
    await updateQuoteStatus(quoteId, 'INVOICED');
  };

  const getQuote = async (quoteId: string) => {
    const response = await request(app.getHttpServer())
      .get(`/api/quotes/${quoteId}`)
      .set(authHeader())
      .expect(200);

    return response.body;
  };

  const createSalesReturn = async (payload: Record<string, unknown>, status = 201) => {
    return request(app.getHttpServer())
      .post('/api/returns')
      .set(authHeader())
      .send(payload)
      .expect(status);
  };

  const quoteSnapshot = (quote: any) => ({
    status: quote.status,
    subtotal: String(quote.subtotal),
    subtotalBeforeDiscount: String(quote.subtotalBeforeDiscount),
    taxableAmount: String(quote.taxableAmount),
    taxAmount: String(quote.taxAmount),
    taxPercentage: String(quote.taxPercentage),
    igstAmount: String(quote.igstAmount),
    cgstAmount: String(quote.cgstAmount),
    sgstAmount: String(quote.sgstAmount),
    totalAmount: String(quote.totalAmount),
    sellerStateCode: quote.sellerStateCode ?? null,
    customerBillingStateCode: quote.customerBillingStateCode ?? null,
    placeOfSupplyStateCode: quote.placeOfSupplyStateCode ?? null,
    items: (quote.items ?? []).map((item: any) => ([
      item.id,
      item.productId,
      String(item.quantity),
      String(item.unitPrice),
      String(item.baseUnitPrice),
      String(item.netUnitPrice),
      String(item.lineTotal),
      String(item.taxableAmount),
      String(item.taxAmount),
      String(item.igstAmount),
      String(item.cgstAmount),
      String(item.sgstAmount),
      String(item.gstRateApplied),
      item.taxClassificationCode ?? null,
      item.appliedTaxType,
    ])),
  });

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

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'owner@demo.com',
        password: 'Demo@1234',
      })
      .expect(201);

    accessToken = login.body.accessToken;

    const categories = await request(app.getHttpServer())
      .get('/api/categories')
      .set(authHeader())
      .expect(200);

    categoryId = categories.body[0].id;

    await setGstConfig();

    const suffix = Date.now();

    const customerKa = await request(app.getHttpServer())
      .post('/api/customers')
      .set(authHeader())
      .send({
        name: `GST Customer KA ${suffix}`,
        phone: '9000000101',
        email: `gst-ka-${suffix}@example.com`,
        billingStateCode: 'KA',
      })
      .expect(201);

    customerKaId = customerKa.body.id;

    const customerMh = await request(app.getHttpServer())
      .post('/api/customers')
      .set(authHeader())
      .send({
        name: `GST Customer MH ${suffix}`,
        phone: '9000000102',
        email: `gst-mh-${suffix}@example.com`,
        billingStateCode: 'MH',
      })
      .expect(201);

    customerMhId = customerMh.body.id;

    const product18 = await request(app.getHttpServer())
      .post('/api/products')
      .set(authHeader())
      .send({
        categoryId,
        name: `GST Product 18 ${suffix}`,
        sku: `GST18-${suffix}`,
        unit: 'NOS',
        costPrice: 80,
        sellingPrice: 100,
        taxClassificationCode: 'GST18',
        taxClassificationLabel: 'GST 18% Product',
      })
      .expect(201);

    product18Id = product18.body.id;

    const product12 = await request(app.getHttpServer())
      .post('/api/products')
      .set(authHeader())
      .send({
        categoryId,
        name: `GST Product 12 ${suffix}`,
        sku: `GST12-${suffix}`,
        unit: 'NOS',
        costPrice: 160,
        sellingPrice: 200,
        taxClassificationCode: 'GST12',
        taxClassificationLabel: 'GST 12% Product',
      })
      .expect(201);

    product12Id = product12.body.id;

    const supplier = await request(app.getHttpServer())
      .post('/api/suppliers')
      .set(authHeader())
      .send({
        name: `GST Supplier ${suffix}`,
        phone: '9000000199',
        email: `gst-supplier-${suffix}@example.com`,
      })
      .expect(201);

    supplierId = supplier.body.id;

    const purchaseOrder = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(authHeader())
      .send({
        supplierId,
        items: [
          { productId: product18Id, quantity: 50, unitCost: 70 },
          { productId: product12Id, quantity: 50, unitCost: 140 },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/purchases/${purchaseOrder.body.id}/receive`)
      .set(authHeader())
      .send({})
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GST-E2E-01: supports mixed GST rates in one quote', async () => {
    const quote = await createQuote({
      customerId: customerKaId,
      placeOfSupplyStateCode: 'KA',
      items: [
        { productId: product18Id, quantity: 2 },
        { productId: product12Id, quantity: 1 },
      ],
      notes: 'GST mixed rates test',
    });

    const item18 = quote.items.find((item: any) => item.productId === product18Id);
    const item12 = quote.items.find((item: any) => item.productId === product12Id);

    expect(item18).toBeDefined();
    expect(item12).toBeDefined();
    expect(Number(item18.gstRateApplied)).toBe(18);
    expect(Number(item12.gstRateApplied)).toBe(12);

    const sumLineTax = round2(
      quote.items.reduce((sum: number, item: any) => sum + Number(item.taxAmount), 0),
    );
    expect(sumLineTax).toBe(round2(Number(quote.taxAmount)));
  });

  it('GST-E2E-02: applies intra-state CGST/SGST split', async () => {
    const quote = await createQuote({
      customerId: customerKaId,
      placeOfSupplyStateCode: 'KA',
      items: [{ productId: product18Id, quantity: 1 }],
      notes: 'GST intra-state test',
    });

    for (const item of quote.items) {
      expect(item.appliedTaxType).toBe('CGST_SGST');
      expect(round2(Number(item.igstAmount))).toBe(0);
      expect(round2(Number(item.cgstAmount) + Number(item.sgstAmount))).toBe(
        round2(Number(item.taxAmount)),
      );
    }

    expect(round2(Number(quote.igstAmount))).toBe(0);
    expect(round2(Number(quote.cgstAmount) + Number(quote.sgstAmount))).toBe(
      round2(Number(quote.taxAmount)),
    );
  });

  it('GST-E2E-03: applies inter-state IGST', async () => {
    const quote = await createQuote({
      customerId: customerMhId,
      placeOfSupplyStateCode: 'MH',
      items: [{ productId: product18Id, quantity: 1 }],
      notes: 'GST inter-state test',
    });

    for (const item of quote.items) {
      expect(item.appliedTaxType).toBe('IGST');
      expect(round2(Number(item.igstAmount))).toBe(round2(Number(item.taxAmount)));
      expect(round2(Number(item.cgstAmount))).toBe(0);
      expect(round2(Number(item.sgstAmount))).toBe(0);
    }

    expect(round2(Number(quote.igstAmount))).toBe(round2(Number(quote.taxAmount)));
    expect(round2(Number(quote.cgstAmount))).toBe(0);
    expect(round2(Number(quote.sgstAmount))).toBe(0);
  });

  it('GST-E2E-04: computes tax after line discount', async () => {
    const quote = await createQuote({
      customerId: customerKaId,
      placeOfSupplyStateCode: 'KA',
      items: [
        {
          productId: product18Id,
          quantity: 2,
          unitPrice: 100,
          discountType: 'PERCENTAGE',
          discountValue: 10,
        },
      ],
      notes: 'GST line discount before tax test',
    });

    const item = quote.items[0];
    expect(round2(Number(item.taxableAmount))).toBe(round2(Number(item.lineTotal)));

    const expectedTax = round2((Number(item.taxableAmount) * Number(item.gstRateApplied)) / 100);
    expect(round2(Number(item.taxAmount))).toBe(expectedTax);
  });

  it('GST-E2E-05: applies order discount before tax with reconciled line totals', async () => {
    const quote = await createQuote({
      customerId: customerKaId,
      placeOfSupplyStateCode: 'KA',
      orderDiscountType: 'FIXED_AMOUNT',
      orderDiscountValue: 30,
      items: [
        { productId: product18Id, quantity: 2 },
        { productId: product12Id, quantity: 1 },
      ],
      notes: 'GST order discount before tax test',
    });

    const sumLineTaxable = round2(
      quote.items.reduce((sum: number, item: any) => sum + Number(item.taxableAmount), 0),
    );

    expect(sumLineTaxable).toBe(round2(Number(quote.taxableAmount)));
    expect(round2(Number(quote.subtotal) - Number(quote.taxableAmount))).toBe(
      round2(Number(quote.orderDiscountAmount)),
    );
  });

  it('GST-E2E-06: header totals reconcile exactly with rounded line totals', async () => {
    const quote = await createQuote({
      customerId: customerKaId,
      placeOfSupplyStateCode: 'KA',
      orderDiscountType: 'PERCENTAGE',
      orderDiscountValue: 7,
      items: [
        { productId: product18Id, quantity: 3, unitPrice: 333.33 },
        { productId: product12Id, quantity: 2, unitPrice: 199.99 },
      ],
      notes: 'GST rounding reconciliation test',
    });

    const lineTaxable = round2(
      quote.items.reduce((sum: number, item: any) => sum + Number(item.taxableAmount), 0),
    );
    const lineTax = round2(
      quote.items.reduce((sum: number, item: any) => sum + Number(item.taxAmount), 0),
    );

    expect(lineTaxable).toBe(round2(Number(quote.taxableAmount)));
    expect(lineTax).toBe(round2(Number(quote.taxAmount)));
    expect(round2(Number(quote.taxableAmount) + Number(quote.taxAmount))).toBe(
      round2(Number(quote.totalAmount)),
    );
  });

  it('GST-E2E-07: keeps legacy taxPercentage as derived compatibility value', async () => {
    const quote = await createQuote({
      customerId: customerKaId,
      placeOfSupplyStateCode: 'KA',
      items: [{ productId: product18Id, quantity: 1 }],
      notes: 'GST legacy taxPercentage test',
    });

    const taxableAmount = Number(quote.taxableAmount);
    const taxAmount = Number(quote.taxAmount);
    const expectedTaxPercentage = taxableAmount > 0 ? round2((taxAmount / taxableAmount) * 100) : 0;

    expect(round2(Number(quote.taxPercentage))).toBe(expectedTaxPercentage);
  });

  it('GST-E2E-08: keeps invoice tax snapshot immutable after config changes', async () => {
    const quote = await createQuote({
      customerId: customerKaId,
      placeOfSupplyStateCode: 'KA',
      items: [
        { productId: product18Id, quantity: 1 },
        { productId: product12Id, quantity: 1 },
      ],
      notes: 'GST invoice snapshot immutability test',
    });

    await invoiceQuote(quote.id);

    const before = await getQuote(quote.id);
    const beforeSnapshot = quoteSnapshot(before);

    await setGstConfig([
      { classificationCode: 'GST18', ratePercentage: 28 },
      { classificationCode: 'GST12', ratePercentage: 5 },
    ]);

    const after = await getQuote(quote.id);
    const afterSnapshot = quoteSnapshot(after);

    expect(afterSnapshot).toEqual(beforeSnapshot);

    // Restore default config for subsequent tests.
    await setGstConfig();
  });

  it('GST-E2E-09: rejects sales return from non-invoiced quote', async () => {
    const quote = await createQuote({
      customerId: customerKaId,
      placeOfSupplyStateCode: 'KA',
      items: [{ productId: product18Id, quantity: 1 }],
      notes: 'GST non-invoiced return rejection test',
    });

    const invalidReturn = await createSalesReturn(
      {
        type: 'SALES_RETURN',
        quoteId: quote.id,
        items: [
          {
            productId: product18Id,
            quantity: 1,
            unitPrice: Number(quote.totalAmount),
            restockToInventory: true,
          },
        ],
      },
      400,
    );

    expect(String(invalidReturn.body.message)).toContain(
      'Sales return is allowed only for invoiced or dispatched quotes',
    );
  });

  it('GST-E2E-10: computes partial sales return tax from source snapshot', async () => {
    const quote = await createQuote({
      customerId: customerKaId,
      placeOfSupplyStateCode: 'KA',
      items: [{ productId: product18Id, quantity: 2 }],
      notes: 'GST partial return source snapshot test',
    });

    await invoiceQuote(quote.id);

    const sourceQuote = await getQuote(quote.id);
    const sourceItem = sourceQuote.items.find((item: any) => item.productId === product18Id);

    const returnQuantity = 0.5;
    const sourceUnitPrice = Number(sourceItem.lineTotal) / Number(sourceItem.quantity);

    const createdReturn = await createSalesReturn({
      type: 'SALES_RETURN',
      quoteId: quote.id,
      items: [
        {
          productId: product18Id,
          quantity: returnQuantity,
          unitPrice: sourceUnitPrice,
          restockToInventory: true,
        },
      ],
    });

    const returnItem = createdReturn.body.items[0];

    expect(createdReturn.body.quoteId).toBe(quote.id);
    expect(returnItem.sourceTaxSnapshot).toBeDefined();

    const expectedTax = round2(
      (Number(sourceItem.taxAmount) / Number(sourceItem.quantity)) * returnQuantity,
    );
    expect(round2(Number(returnItem.taxAmount))).toBe(expectedTax);
  });

  it('GST-E2E-11: prevents cumulative partial returns from exceeding sold quantity', async () => {
    const quote = await createQuote({
      customerId: customerKaId,
      placeOfSupplyStateCode: 'KA',
      items: [{ productId: product12Id, quantity: 1 }],
      notes: 'GST cumulative partial return cap test',
    });

    await invoiceQuote(quote.id);

    const sourceQuote = await getQuote(quote.id);
    const sourceItem = sourceQuote.items.find((item: any) => item.productId === product12Id);
    const sourceUnitPrice = Number(sourceItem.lineTotal) / Number(sourceItem.quantity);

    await createSalesReturn({
      type: 'SALES_RETURN',
      quoteId: quote.id,
      items: [{ productId: product12Id, quantity: 0.6, unitPrice: sourceUnitPrice }],
    });

    await createSalesReturn({
      type: 'SALES_RETURN',
      quoteId: quote.id,
      items: [{ productId: product12Id, quantity: 0.4, unitPrice: sourceUnitPrice }],
    });

    const invalid = await createSalesReturn(
      {
        type: 'SALES_RETURN',
        quoteId: quote.id,
        items: [{ productId: product12Id, quantity: 0.1, unitPrice: sourceUnitPrice }],
      },
      400,
    );

    expect(String(invalid.body.message)).toContain('Return quantity exceeds sold quantity');
  });

  it('GST-E2E-12: does not mutate original quote or quote-item snapshots on partial return', async () => {
    const quote = await createQuote({
      customerId: customerKaId,
      placeOfSupplyStateCode: 'KA',
      items: [{ productId: product18Id, quantity: 1 }],
      notes: 'GST quote immutability on return test',
    });

    await invoiceQuote(quote.id);

    const before = await getQuote(quote.id);
    const beforeSnapshot = quoteSnapshot(before);

    await createSalesReturn({
      type: 'SALES_RETURN',
      quoteId: quote.id,
      items: [
        {
          productId: product18Id,
          quantity: 0.5,
          unitPrice: Number(before.totalAmount) / 2,
          restockToInventory: true,
        },
      ],
    });

    const after = await getQuote(quote.id);
    const afterSnapshot = quoteSnapshot(after);

    expect(afterSnapshot).toEqual(beforeSnapshot);
  });
});
