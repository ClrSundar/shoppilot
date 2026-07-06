import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';

import { AppModule } from '../src/app.module';

type DecisionCase = {
  name: string;
  request: {
    queryInputs: Record<string, string | number | boolean>;
  };
  expectedStatus: 'MATCHED' | 'NO_MATCH';
  expectedRule?: string;
};

describe('Decision Engine E2E', () => {
  let app: INestApplication;
  let accessToken: string;

  const outputDir = path.join(process.cwd(), 'test-output');
  const outputFile = path.join(
    outputDir,
    'decision-engine-request-response.json',
  );

  const cases: DecisionCase[] = [
    {
      name: '1. Happy path — 3HP single phase',
      request: {
        queryInputs: {
          boreDepthFt: 330,
          phase: 'SINGLE',
          budget: 50000,
        },
      },
      expectedStatus: 'MATCHED',
      expectedRule: 'BORE_WELL_300_360_SINGLE',
    },
    {
      name: '2. Lower depth — 2HP single phase',
      request: {
        queryInputs: {
          boreDepthFt: 250,
          phase: 'SINGLE',
          budget: 40000,
        },
      },
      expectedStatus: 'MATCHED',
      expectedRule: 'BORE_WELL_200_280_SINGLE',
    },
    {
      name: '3. Higher depth — 5HP three phase',
      request: {
        queryInputs: {
          boreDepthFt: 500,
          phase: 'THREE',
          budget: 80000,
        },
      },
      expectedStatus: 'MATCHED',
      expectedRule: 'BORE_WELL_400_550_THREE',
    },
    {
      name: '4. Budget pressure — 3HP lower budget',
      request: {
        queryInputs: {
          boreDepthFt: 330,
          phase: 'SINGLE',
          budget: 31000,
        },
      },
      expectedStatus: 'MATCHED',
      expectedRule: 'BORE_WELL_300_360_SINGLE',
    },
    {
      name: '5. No matching depth',
      request: {
        queryInputs: {
          boreDepthFt: 380,
          phase: 'SINGLE',
          budget: 50000,
        },
      },
      expectedStatus: 'NO_MATCH',
    },
    {
      name: '6. Missing phase',
      request: {
        queryInputs: {
          boreDepthFt: 330,
          budget: 50000,
        },
      },
      expectedStatus: 'NO_MATCH',
    },
    {
      name: '7. Missing depth',
      request: {
        queryInputs: {
          phase: 'SINGLE',
          budget: 50000,
        },
      },
      expectedStatus: 'NO_MATCH',
    },
    {
      name: '8. Boundary lower edge',
      request: {
        queryInputs: {
          boreDepthFt: 300,
          phase: 'SINGLE',
          budget: 50000,
        },
      },
      expectedStatus: 'MATCHED',
      expectedRule: 'BORE_WELL_300_360_SINGLE',
    },
    {
      name: '9. Boundary upper edge',
      request: {
        queryInputs: {
          boreDepthFt: 360,
          phase: 'SINGLE',
          budget: 50000,
        },
      },
      expectedStatus: 'MATCHED',
      expectedRule: 'BORE_WELL_300_360_SINGLE',
    },
    {
      name: '10. Wrong phase for depth',
      request: {
        queryInputs: {
          boreDepthFt: 330,
          phase: 'THREE',
          budget: 50000,
        },
      },
      expectedStatus: 'NO_MATCH',
    },
    {
      name: '11. Very low budget',
      request: {
        queryInputs: {
          boreDepthFt: 330,
          phase: 'SINGLE',
          budget: 20000,
        },
      },
      expectedStatus: 'MATCHED',
      expectedRule: 'BORE_WELL_300_360_SINGLE',
    },
    {
      name: '12. No budget',
      request: {
        queryInputs: {
          boreDepthFt: 330,
          phase: 'SINGLE',
        },
      },
      expectedStatus: 'MATCHED',
      expectedRule: 'BORE_WELL_300_360_SINGLE',
    },
  ];

  beforeAll(async () => {
    fs.mkdirSync(outputDir, { recursive: true });

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('writes decision-engine request/response logs', async () => {
    const logs: Array<Record<string, unknown>> = [];

    for (const testCase of cases) {
      const response = await request(app.getHttpServer())
        .post('/api/decisions/recommend-solution')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(testCase.request)
        .expect(201);

      expect(response.body.status).toBe(testCase.expectedStatus);

      if (testCase.expectedRule) {
        expect(response.body.appliedRule?.code).toBe(testCase.expectedRule);
      }

      logs.push({
        testCase: testCase.name,
        request: testCase.request,
        response: response.body,
      });
    }

    fs.writeFileSync(outputFile, JSON.stringify(logs, null, 2), 'utf8');
    expect(fs.existsSync(outputFile)).toBe(true);
  });
});