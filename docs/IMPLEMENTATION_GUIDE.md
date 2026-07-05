# ShopPilot Implementation Guide

**Decision Engine Foundation (6 Weeks)**

---

## Architecture Decisions (Final)

### 1. Knowledge Governance: **Both Model**

```
Explicit Rule         → DecisionRule (must-follow)
User Preference       → TenantPreference (ranking influence)  
Shop Feedback         → RecommendationFeedback (learning signal)
```

Example:
```
Bore depth 300-350ft → 3HP = DecisionRule (ACTIVE, approved by TENANT_OWNER)
Prefer Texmo brand = TenantPreference (weight: +10 points)
Rejected CRI 10 times = RecommendationFeedback (data point, not rule yet)
```

**No model fine-tuning now.** Collect feedback data in Phase 4, learn in Phase 8.

### 2. Multi-Industry: **Core + Packs**

**Core** (domain-agnostic, shared across all shops):
- `Product`, `Attribute`, `Compatibility`, `SolutionTemplate`, `DecisionRule`

**Industry Packs** (plugged into core):
- Motor Pack: HP, Head, Phase, BoreDepth, rules like "300-350ft → 3HP"
- Furniture Pack: Material, Size, Color, rules
- CCTV Pack: Resolution, Coverage, DVR, rules

**Launch with motor pack only.** Generic core validated with one shop.

### 3. Decision Transparency: **Separate Audit Trail**

Quote stores **snapshots** (what the shop quoted):
```json
{
  "productName": "Motor 3HP",
  "sku": "MOT-3HP-001",
  "priceSnapshot": 45000,
  "taxRateSnapshot": 18,
  "attributesSnapshot": { "hp": 3, "phase": "single", "head": 350 }
}
```

Recommendation stores **why** (what the AI decided):
```json
{
  "recommendationRunId": "rec_xyz",
  "appliedRule": "BORE_WELL_300_350_SINGLE",
  "candidates": [
    { "productId": "mot_1", "rank": 1, "score": 92, "scoreBreakdown": {...} }
  ],
  "feedback": [
    { "action": "ACCEPTED", "by": "salesman_1", "at": "2026-07-06" }
  ]
}
```

Quote can reference `recommendationRunId` for audit trail lookup.

### 4. First Shop: **Real Validation, Light Architecture**

**We don't wait for perfect design.**
**We don't hardcode motors.**
**We build generic foundations, validate with motors first.**

---

## Phase 2: Product Attributes (Week 1-2)

### Database Schema

Add to `apps/api/prisma/schema.prisma`:

```prisma
enum AttributeDataType {
  TEXT
  NUMBER
  BOOLEAN
  SELECT
}

model AttributeDefinition {
  id String @id @default(cuid())
  tenantId String?              // NULL = platform standard
  code String                   // HP, HEAD, PHASE, MATERIAL
  name String
  dataType AttributeDataType
  unit String?                  // "horsepower", "feet", "meters"
  allowedValues Json?           // For SELECT: ["SINGLE", "THREE"]
  description String?
  appliesToCategoryId String?   // Optional: restrict to category
  active Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, code])
  @@index([tenantId])
  @@index([code])
}

model ProductAttributeValue {
  id String @id @default(cuid())
  productId String
  attributeDefinitionId String
  valueText String?
  valueNumber Decimal?
  valueBoolean Boolean?
  valueJson Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  
  @@unique([productId, attributeDefinitionId])
  @@index([productId])
  @@index([attributeDefinitionId])
}
```

Add to `Product` model:
```prisma
model Product {
  // ... existing fields ...
  attributeValues ProductAttributeValue[]
  metadata Json?                // Temporary bridge before full normalization
  barcode String?
  description String?
  gstRate Decimal?
  
  @@index([tenantId, categoryId])
}
```

### Seed Data (Motors)

Create `apps/api/prisma/seeds/motor-attributes.ts`:

```typescript
// Attributes
await prisma.attributeDefinition.create({
  data: {
    code: 'HP',
    name: 'Horsepower',
    dataType: 'NUMBER',
    unit: 'hp',
    description: 'Motor horsepower rating'
  }
});

await prisma.attributeDefinition.create({
  data: {
    code: 'HEAD',
    name: 'Total Head',
    dataType: 'NUMBER',
    unit: 'feet',
    description: 'Maximum discharge head in feet'
  }
});

await prisma.attributeDefinition.create({
  data: {
    code: 'PHASE',
    name: 'Phase',
    dataType: 'SELECT',
    allowedValues: JSON.stringify(['SINGLE', 'THREE']),
    description: 'Electrical phase'
  }
});

// Product attributes (link products to attributes)
const motor3hp = await prisma.product.findFirst({
  where: { name: 'Motor 3HP' }
});

if (motor3hp) {
  await prisma.productAttributeValue.create({
    data: {
      productId: motor3hp.id,
      attributeDefinitionId: hpAttr.id,
      valueNumber: 3
    }
  });
  
  await prisma.productAttributeValue.create({
    data: {
      productId: motor3hp.id,
      attributeDefinitionId: headAttr.id,
      valueNumber: 350
    }
  });
  
  await prisma.productAttributeValue.create({
    data: {
      productId: motor3hp.id,
      attributeDefinitionId: phaseAttr.id,
      valueText: 'SINGLE'
    }
  });
}
```

### Checklist

- [ ] Add AttributeDefinition + ProductAttributeValue to schema.prisma
- [ ] Add metadata, barcode, description, gstRate to Product model
- [ ] Create Prisma migration: `npx prisma migrate dev --name add_product_attributes`
- [ ] Create seed file: `prisma/seeds/motor-attributes.ts`
- [ ] Seed motor attributes: `npx prisma db seed`
- [ ] Type-check: `pnpm -C apps/api exec tsc --noEmit`

---

## Phase 3: Compatibility & Solutions (Week 2-3)

### Database Schema

```prisma
enum CompatibilityRelationType {
  REQUIRED_WITH
  RECOMMENDED_WITH
  ALTERNATIVE_TO
  INCOMPATIBLE_WITH
}

enum RequirementType {
  REQUIRED
  RECOMMENDED
  OPTIONAL
}

model ProductCompatibility {
  id String @id @default(cuid())
  tenantId String?                  // NULL = platform standard
  sourceProductId String
  targetProductId String
  relationType CompatibilityRelationType
  reason String?
  priority Int @default(2)          // 1=critical, 2=important, 3=nice-to-have
  active Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  source Product @relation("source", fields: [sourceProductId], references: [id], onDelete: Cascade)
  target Product @relation("target", fields: [targetProductId], references: [id], onDelete: Cascade)

  @@unique([tenantId, sourceProductId, targetProductId, relationType])
  @@index([sourceProductId])
  @@index([targetProductId])
}

model SolutionTemplate {
  id String @id @default(cuid())
  tenantId String?                  // NULL = platform standard
  code String
  name String
  categoryId String?
  purpose String?
  description String?
  active Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  items SolutionTemplateItem[]

  @@unique([tenantId, code])
  @@index([tenantId])
}

model SolutionTemplateItem {
  id String @id @default(cuid())
  solutionTemplateId String
  productCategoryId String?
  productId String?
  requirementType RequirementType
  defaultQuantity Decimal @default(1)
  reason String?
  priority Int @default(2)
  createdAt DateTime @default(now())

  template SolutionTemplate @relation(fields: [solutionTemplateId], references: [id], onDelete: Cascade)

  @@index([solutionTemplateId])
  @@index([productId])
}
```

### Seed Data

Create `prisma/seeds/motor-compatibility.ts`:

```typescript
// Example: Motor 3HP requires Starter
const motor3hp = await prisma.product.findFirst({ where: { name: 'Motor 3HP' } });
const starter = await prisma.product.findFirst({ where: { name: 'Starter' } });

if (motor3hp && starter) {
  await prisma.productCompatibility.create({
    data: {
      sourceProductId: motor3hp.id,
      targetProductId: starter.id,
      relationType: 'REQUIRED_WITH',
      reason: 'Starter required to start the motor',
      priority: 1
    }
  });
}

// Solution template: BOREWELL_STANDARD_3HP
const boreCategory = await prisma.category.findFirst({ 
  where: { name: 'Submersible Motors' } 
});

const template = await prisma.solutionTemplate.create({
  data: {
    code: 'BOREWELL_STANDARD_3HP',
    name: 'Bore Well Standard 3HP Installation',
    categoryId: boreCategory?.id,
    purpose: 'Standard bore well installation for 300-350ft depth',
    items: {
      create: [
        { productId: motor3hp.id, requirementType: 'REQUIRED', reason: 'Main pump' },
        { productId: starter.id, requirementType: 'REQUIRED', reason: 'Motor starter' },
        { productId: rope.id, requirementType: 'RECOMMENDED', defaultQuantity: 2, reason: 'Safety rope' }
      ]
    }
  }
});
```

### Checklist

- [ ] Add ProductCompatibility + SolutionTemplate to schema.prisma
- [ ] Update Product model with compatibility relations
- [ ] Create Prisma migration: `npx prisma migrate dev --name add_compatibility_solutions`
- [ ] Create seed file: `prisma/seeds/motor-compatibility.ts`
- [ ] Seed data: `npx prisma db seed`
- [ ] Type-check: `pnpm -C apps/api exec tsc --noEmit`

---

## Phase 4: Decision Audit Trail (Week 3-4)

### Database Schema

```prisma
enum DecisionRuleStatus {
  DRAFT
  ACTIVE
  RETIRED
}

enum RecommendationRunStatus {
  PENDING
  COMPLETED
  FAILED
}

enum RecommendationAction {
  ACCEPTED
  MODIFIED
  REJECTED
  IGNORED
}

model DecisionRule {
  id String @id @default(cuid())
  tenantId String?
  capability String                // RECOMMEND_SOLUTION
  name String
  description String?
  conditions Json                   // { category, depthFt, phase, budget, etc. }
  outcome Json                      // { requiredAttributes, solutionTemplateCode, rankingWeights }
  priority Int @default(1)
  version Int @default(1)
  status DecisionRuleStatus @default(DRAFT)
  explanation String?               // Why this rule exists
  createdById String
  approvedById String?
  approvedAt DateTime?
  effectiveFrom DateTime?
  effectiveTo DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, capability, name, version])
  @@index([tenantId, capability, status])
  @@index([createdAt])
}

model RecommendationRun {
  id String @id @default(cuid())
  tenantId String
  copilotSessionId String?
  customerId String?
  capability String                // RECOMMEND_SOLUTION
  input Json                        // { category, depthFt, phase, budget }
  result Json?                      // Solution details
  confidence Decimal @db.Decimal(5, 2)  // 0-100
  status RecommendationRunStatus @default(PENDING)
  appliedRuleId String?
  appliedRuleVersion Int?
  createdAt DateTime @default(now())

  candidates RecommendationCandidate[]
  feedback RecommendationFeedback[]

  @@index([tenantId, customerId])
  @@index([tenantId, createdAt])
  @@index([copilotSessionId])
}

model RecommendationCandidate {
  id String @id @default(cuid())
  recommendationRunId String
  productId String
  rank Int
  score Decimal @db.Decimal(5, 2)
  scoreBreakdown Json                // { stock: 35, preference: 30, price: 25, performance: 2 }
  selected Boolean @default(false)
  rejectionReason String?
  createdAt DateTime @default(now())

  run RecommendationRun @relation(fields: [recommendationRunId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id])

  @@index([recommendationRunId])
  @@index([productId])
}

model RecommendationFeedback {
  id String @id @default(cuid())
  recommendationRunId String
  actorUserId String?
  action RecommendationAction
  finalProductId String?
  reasonCode String?
  note String?
  createdAt DateTime @default(now())

  run RecommendationRun @relation(fields: [recommendationRunId], references: [id], onDelete: Cascade)

  @@index([recommendationRunId])
  @@index([actorUserId])
}
```

### Checklist

- [ ] Add DecisionRule + RecommendationRun/Candidate/Feedback to schema.prisma
- [ ] Create Prisma migration: `npx prisma migrate dev --name add_decision_audit_trail`
- [ ] Create seed file: `prisma/seeds/motor-decision-rules.ts` with example rule
- [ ] Seed example rule: "If depth 300-350ft AND phase=SINGLE → use 3HP motor + starter"
- [ ] Type-check: `pnpm -C apps/api exec tsc --noEmit`

---

## Phase 5: Decision Engine API (Week 4-5)

### Service Structure

```bash
# Generate module and service
nest generate module decision
nest generate service decision
```

Create `apps/api/src/modules/decision/dto/recommend-solution.dto.ts`:

```typescript
export class RecommendSolutionDto {
  @IsString()
  @IsNotEmpty()
  category: string;  // SUBMERSIBLE_MOTOR

  @IsString()
  customerId?: string;

  @IsNumber()
  boreDepthFt?: number;

  @IsString()
  phase?: string;  // SINGLE, THREE

  @IsNumber()
  budget?: number;
}

export class RecommendationResponseDto {
  recommendationId: string;
  confidence: number;
  solution: {
    required: Array<{ productId: string; qty: number; name: string }>;
    recommended: Array<{ productId: string; qty: number; name: string }>;
  };
  candidates: Array<{
    rank: number;
    productId: string;
    productName: string;
    score: number;
    scoreBreakdown: Record<string, number>;
  }>;
  appliedRule: {
    ruleId: string;
    name: string;
    version: number;
  };
  explanation: string;
}
```

Create `apps/api/src/modules/decision/decision.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RecommendSolutionDto, RecommendationResponseDto } from './dto/recommend-solution.dto';

@Injectable()
export class DecisionService {
  constructor(private prisma: PrismaService) {}

  async recommendSolution(
    tenantId: string,
    dto: RecommendSolutionDto,
  ): Promise<RecommendationResponseDto> {
    // 1. Find applicable rules
    const applicableRules = await this.prisma.decisionRule.findMany({
      where: {
        tenantId,
        capability: 'RECOMMEND_SOLUTION',
        status: 'ACTIVE',
        effectiveFrom: { lte: new Date() },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      orderBy: { priority: 'asc' },
    });

    let appliedRule = null;
    let solution = null;

    // 2. Evaluate each rule against input
    for (const rule of applicableRules) {
      const conditions = rule.conditions as Record<string, any>;
      
      // Check if conditions match
      const matches = this.evaluateConditions(conditions, dto);
      if (matches) {
        appliedRule = rule;
        solution = rule.outcome as Record<string, any>;
        break;
      }
    }

    if (!appliedRule) {
      throw new Error('No applicable rule found for this query');
    }

    // 3. Expand solution template
    const template = await this.prisma.solutionTemplate.findFirst({
      where: {
        code: solution.solutionTemplateCode,
      },
      include: {
        items: {
          include: {
            template: true,
          },
        },
      },
    });

    if (!template) {
      throw new Error(`Solution template ${solution.solutionTemplateCode} not found`);
    }

    // 4. Find compatible products
    const requiredProducts = await Promise.all(
      template.items
        .filter((item) => item.requirementType === 'REQUIRED')
        .map((item) =>
          this.prisma.product.findUnique({
            where: { id: item.productId! },
          }),
        ),
    );

    // 5. Rank candidates
    const candidates = await this.rankProducts(
      requiredProducts.filter(Boolean),
      solution.rankingWeights,
      tenantId,
    );

    // 6. Record decision
    const run = await this.prisma.recommendationRun.create({
      data: {
        tenantId,
        capability: 'RECOMMEND_SOLUTION',
        input: dto as any,
        result: { template: template.code, solution },
        confidence: 95,
        status: 'COMPLETED',
        appliedRuleId: appliedRule.id,
        appliedRuleVersion: appliedRule.version,
        candidates: {
          create: candidates.map((c, idx) => ({
            productId: c.product.id,
            rank: idx + 1,
            score: c.score,
            scoreBreakdown: c.breakdown,
          })),
        },
      },
      include: {
        candidates: true,
      },
    });

    // 7. Format response
    return {
      recommendationId: run.id,
      confidence: 95,
      solution: {
        required: requiredProducts.filter(Boolean).map((p) => ({
          productId: p.id,
          qty: 1,
          name: p.name,
        })),
        recommended: [],
      },
      candidates: candidates.map((c, idx) => ({
        rank: idx + 1,
        productId: c.product.id,
        productName: c.product.name,
        score: c.score,
        scoreBreakdown: c.breakdown,
      })),
      appliedRule: {
        ruleId: appliedRule.id,
        name: appliedRule.name,
        version: appliedRule.version,
      },
      explanation: appliedRule.explanation || 'Rule matched your criteria',
    };
  }

  private evaluateConditions(conditions: Record<string, any>, dto: RecommendSolutionDto): boolean {
    // Simple depth check example
    if (conditions.minDepthFt && dto.boreDepthFt! < conditions.minDepthFt) return false;
    if (conditions.maxDepthFt && dto.boreDepthFt! > conditions.maxDepthFt) return false;
    if (conditions.phase && dto.phase !== conditions.phase) return false;
    return true;
  }

  private async rankProducts(
    products: any[],
    weights: Record<string, number>,
    tenantId: string,
  ): Promise<Array<{ product: any; score: number; breakdown: Record<string, number> }>> {
    // Placeholder ranking logic
    return products.map((p) => ({
      product: p,
      score: 85 + Math.random() * 15,
      breakdown: { stock: 35, preference: 30, price: 25, performance: 10 },
    }));
  }
}
```

### Controller

Create `apps/api/src/modules/decision/decision.controller.ts`:

```typescript
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { DecisionService } from './decision.service';
import { RecommendSolutionDto, RecommendationResponseDto } from './dto/recommend-solution.dto';

@Controller('api/v1/decisions')
@UseGuards(JwtAuthGuard)
export class DecisionController {
  constructor(private decisionService: DecisionService) {}

  @Post('recommend-solution')
  async recommendSolution(
    @CurrentUser() user: any,
    @Body() dto: RecommendSolutionDto,
  ): Promise<RecommendationResponseDto> {
    return this.decisionService.recommendSolution(user.tenantId, dto);
  }
}
```

### Checklist

- [ ] Generate DecisionModule: `nest generate module decision`
- [ ] Generate DecisionService: `nest generate service decision`
- [ ] Create DecisionController
- [ ] Create DTOs (RecommendSolutionDto, RecommendationResponseDto)
- [ ] Implement `recommendSolution()` service method
- [ ] Implement rule matching logic
- [ ] Implement ranking logic
- [ ] Type-check: `pnpm -C apps/api exec tsc --noEmit`
- [ ] Test endpoint manually with Postman/curl

---

## Phase 6: Copilot Integration (Week 5-6)

### Update Copilot Service

Wire CopilotService to call DecisionModule:

```typescript
// In copilot.service.ts

async chat(
  tenantId: string,
  userId: string,
  message: string,
  sessionId?: string,
): Promise<CopilotChatResponse> {
  // ... existing logic ...

  // When detecting recommendation intent:
  if (this.isRecommendationQuery(message)) {
    const query = this.extractQuery(message);  // Parse customer needs
    const recommendation = await this.decisionService.recommendSolution(
      tenantId,
      query,
    );

    // Store recommendation in audit trail
    await this.persistTurn(sessionId, userId, tenantId, {
      userMessage: message,
      assistantMessage: this.formatRecommendation(recommendation),
      recommendationRunId: recommendation.recommendationId,
    });

    return {
      message: this.formatRecommendation(recommendation),
      recommendationRunId: recommendation.recommendationId,
      confidence: recommendation.confidence,
    };
  }

  // ... rest of logic ...
}
```

### Checklist

- [ ] Inject DecisionService into CopilotService
- [ ] Add `isRecommendationQuery()` intent classifier
- [ ] Add `extractQuery()` to parse customer needs from message
- [ ] Wire chat flow to call DecisionModule
- [ ] Update response to include recommendationRunId
- [ ] Type-check: `pnpm -C apps/api exec tsc --noEmit`
- [ ] Test Copilot chat flow end-to-end

---

## What NOT to Build (Yet)

❌ **Do not build:**
- LangGraph orchestration (Phase 7)
- MCP server (Future)
- Admin UI for rule management (Post-validation)
- Redis caching (Phase 4+)
- Row-level security policies (Phase 4+)
- Microservices architecture (Year 2+)

**Focus on one thing:** Decision Engine that makes deterministic, auditable recommendations.

---

## Success Criteria

By end of Week 6:

✅ **Phase 2**: Product attributes seeded for motors
✅ **Phase 3**: Compatibility relationships defined
✅ **Phase 4**: Recommendation audit trail captured
✅ **Phase 5**: DecisionModule.recommendSolution() API working
✅ **Phase 6**: Copilot chat calling decision engine
✅ **Validation**: One shop uses it, makes real recommendations, provides feedback

---

## Next Steps After Phase 6

1. **Gather Feedback**: What does the real shop want?
2. **Assess**: Is decision engine accurate? Are rules correct?
3. **Then Decide**: Move to LangGraph or refine Phase 2-6 first?

**Don't jump to Phase 7 until Phase 6 is proven with real shop.**
