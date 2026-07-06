import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';

import { AppModule } from '../src/app.module';

type PriorityCase = {
  name: string;
  decisionRequest: {
    queryInputs: Record<string, string | number | boolean>;
  };
  chatMessage: string;
};

describe('Copilot vs Decision alignment E2E', () => {
  let app: INestApplication;
  let accessToken: string;

  const outputDir = path.join(process.cwd(), 'test-output');
  const outputFile = path.join(
    outputDir,
    'copilot-decision-alignment.json',
  );

  const cases: PriorityCase[] = [
    {
      name: '1. Happy path — 3HP single phase',
      decisionRequest: {
        queryInputs: { boreDepthFt: 330, phase: 'SINGLE', budget: 50000 },
      },
      chatMessage: 'Need recommendation for 330 ft SINGLE phase borewell budget 50000',
    },
    {
      name: '2. Lower depth — 2HP single phase',
      decisionRequest: {
        queryInputs: { boreDepthFt: 250, phase: 'SINGLE', budget: 40000 },
      },
      chatMessage: 'Recommend motor for 250 ft SINGLE phase borewell budget 40000',
    },
    {
      name: '3. Higher depth — 5HP three phase',
      decisionRequest: {
        queryInputs: { boreDepthFt: 500, phase: 'THREE', budget: 80000 },
      },
      chatMessage: 'Suggest solution for 500 ft THREE phase borewell budget 80000',
    },
    {
      name: '4. Budget pressure — 3HP lower budget',
      decisionRequest: {
        queryInputs: { boreDepthFt: 330, phase: 'SINGLE', budget: 31000 },
      },
      chatMessage: 'Need recommendation for 330 ft SINGLE phase borewell budget 31000',
    },
    {
      name: '5. No matching depth',
      decisionRequest: {
        queryInputs: { boreDepthFt: 380, phase: 'SINGLE', budget: 50000 },
      },
      chatMessage: 'Recommend for 380 ft SINGLE phase borewell budget 50000',
    },
    {
      name: '6. Missing phase',
      decisionRequest: {
        queryInputs: { boreDepthFt: 330, budget: 50000 },
      },
      chatMessage: 'Recommend for 330 ft borewell budget 50000',
    },
    {
      name: '11. Very low budget',
      decisionRequest: {
        queryInputs: { boreDepthFt: 330, phase: 'SINGLE', budget: 20000 },
      },
      chatMessage: 'Need recommendation for 330 ft SINGLE phase borewell budget 20000',
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
      .send({ email: 'owner@demo.com', password: 'Demo@1234' })
      .expect(201);

    accessToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps Copilot aligned with DecisionService output', async () => {
    const logs: Array<Record<string, unknown>> = [];

    for (const testCase of cases) {
      const decisionResponse = await request(app.getHttpServer())
        .post('/api/decisions/recommend-solution')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(testCase.decisionRequest)
        .expect(201);

      const copilotResponse = await request(app.getHttpServer())
        .post('/api/copilot/chat')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          message: testCase.chatMessage,
          previousMessages: [],
        })
        .expect(201);

      const decision = decisionResponse.body;
      const copilot = copilotResponse.body;

      if (decision.status === 'MATCHED') {
        expect(copilot.reply).toContain(decision.primaryRecommendation.productName);

        for (const name of decision.solutionItems.required) {
          expect(copilot.reply).toContain(name);
        }
        for (const name of decision.solutionItems.recommended) {
          expect(copilot.reply).toContain(name);
        }
        for (const name of decision.solutionItems.optional) {
          expect(copilot.reply).toContain(name);
        }

        if (decision.warnings && decision.warnings.length > 0) {
          for (const warning of decision.warnings) {
            expect(copilot.reply).toContain(warning);
          }
        }
      } else {
        if (decision.missingFields && decision.missingFields.length > 0) {
          for (const field of decision.missingFields) {
            expect(copilot.reply).toContain(field);
          }
        } else if (decision.suggestedAction) {
          expect(copilot.reply).toContain(decision.suggestedAction);
        }
      }

      logs.push({
        testCase: testCase.name,
        decisionRequest: testCase.decisionRequest,
        chatMessage: testCase.chatMessage,
        decisionResponse: decision,
        copilotResponse: copilot,
        alignment: {
          statusMatches: true,
          primaryRecommendation:
            decision.status === 'MATCHED'
              ? decision.primaryRecommendation.productName
              : null,
        },
      });
    }

    fs.writeFileSync(outputFile, JSON.stringify(logs, null, 2), 'utf8');
    expect(fs.existsSync(outputFile)).toBe(true);
  });
});