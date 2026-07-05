# ShopPilot Decision Engine: Quick Reference

## The Big Picture

```
Customer Question: "I have a 330ft bore, single phase. What motor?"
                              ↓
                    Copilot Chat Interface
                              ↓
                    DecisionService.recommendSolution()
                              ↓
        1. Match rules (find "300-350ft + SINGLE → 3HP")
        2. Expand solution (Motor + Starter + Rope)
        3. Find products (Motor_3HP, Starter_X, etc.)
        4. Rank candidates (Motor A: 92 pts, Motor B: 78 pts)
        5. Record decision (RecommendationRun with why)
                              ↓
                 "Motor 3HP (score 92) because..."
                   + full audit trail
```

---

## Phase 2: Attributes Schema

```prisma
model AttributeDefinition {
  code: string        // "HP", "HEAD", "PHASE"
  name: string        // "Horsepower"
  dataType: enum      // TEXT, NUMBER, BOOLEAN, SELECT
  unit: string        // "hp", "feet"
  allowedValues: Json // For SELECT: ["SINGLE", "THREE"]
}

model ProductAttributeValue {
  productId: string
  attributeDefinitionId: string
  valueText?: string
  valueNumber?: Decimal
  valueBoolean?: Boolean
  valueJson?: Json
}
```

**Seed for Motor 3HP:**
```javascript
attributes = [
  { code: "HP", value: 3 },
  { code: "HEAD", value: 350 },
  { code: "PHASE", value: "SINGLE" }
]
```

---

## Phase 3: Compatibility & Solution Schema

```prisma
model ProductCompatibility {
  sourceProductId: string      // Motor
  targetProductId: string      // Starter
  relationType: enum            // REQUIRED_WITH
  priority: int                 // 1 = critical
}

model SolutionTemplate {
  code: string      // "BOREWELL_STANDARD_3HP"
  name: string      // "Bore Well Standard 3HP"
  items: [          // SolutionTemplateItem[]
    { productId, requirementType: "REQUIRED", qty: 1 },
    { productId, requirementType: "RECOMMENDED", qty: 2 }
  ]
}
```

**Seed Compatibility:**
```javascript
Motor_3HP → REQUIRED_WITH → Starter
Motor_3HP → RECOMMENDED_WITH → Rope
Motor_3HP → ALTERNATIVE_TO → Motor_2HP
```

**Seed Solution Template:**
```javascript
BOREWELL_STANDARD_3HP = {
  REQUIRED: Motor_3HP (qty 1),
  REQUIRED: Starter (qty 1),
  RECOMMENDED: Rope (qty 2),
  OPTIONAL: PressureGauge (qty 1)
}
```

---

## Phase 4: Decision Audit Trail Schema

```prisma
model DecisionRule {
  code: string                  // "BORE_WELL_300_350_SINGLE"
  capability: string            // "RECOMMEND_SOLUTION"
  conditions: Json              // { minDepth: 300, maxDepth: 350, phase: "SINGLE" }
  outcome: Json                 // { hp: 3, templateCode: "BOREWELL_STANDARD_3HP" }
  status: enum                  // DRAFT, ACTIVE, RETIRED
  version: int
  approvedById: string
}

model RecommendationRun {
  capability: string            // "RECOMMEND_SOLUTION"
  input: Json                   // { boreDepth: 330, phase: "SINGLE" }
  result: Json                  // { templateCode, solution }
  confidence: Decimal           // 0-100
  appliedRuleId: string
  appliedRuleVersion: int
  candidates: RecommendationCandidate[]
  feedback: RecommendationFeedback[]
}

model RecommendationCandidate {
  rank: int
  score: Decimal                // 0-100
  scoreBreakdown: Json          // { stock: 35, preference: 30, price: 25, perf: 10 }
  selected: boolean
}

model RecommendationFeedback {
  action: enum                  // ACCEPTED, MODIFIED, REJECTED
  reasonCode?: string
  note?: string
}
```

---

## Phase 5: Decision Engine Service Template

```typescript
@Injectable()
export class DecisionService {
  constructor(private prisma: PrismaService) {}

  async recommendSolution(
    tenantId: string,
    input: {
      category: string;
      boreDepthFt?: number;
      phase?: string;
      budget?: number;
    }
  ) {
    // Step 1: Find applicable rules
    const rules = await this.prisma.decisionRule.findMany({
      where: { tenantId, capability: 'RECOMMEND_SOLUTION', status: 'ACTIVE' },
      orderBy: { priority: 'asc' }
    });

    // Step 2: Match input against rules
    let appliedRule = null;
    for (const rule of rules) {
      if (this.conditionsMatch(rule.conditions, input)) {
        appliedRule = rule;
        break;
      }
    }

    if (!appliedRule) throw new Error('No matching rule');

    // Step 3: Expand solution template
    const template = await this.prisma.solutionTemplate.findFirst({
      where: { code: appliedRule.outcome.templateCode },
      include: { items: true }
    });

    // Step 4: Get candidate products
    const candidateProducts = template.items.map(item => item.productId);

    // Step 5: Rank candidates
    const ranked = await this.rankCandidates(candidateProducts, appliedRule.outcome);

    // Step 6: Record decision
    const run = await this.prisma.recommendationRun.create({
      data: {
        tenantId,
        capability: 'RECOMMEND_SOLUTION',
        input,
        appliedRuleId: appliedRule.id,
        appliedRuleVersion: appliedRule.version,
        confidence: 95,
        candidates: {
          create: ranked.map((c, i) => ({
            productId: c.id,
            rank: i + 1,
            score: c.score,
            scoreBreakdown: c.breakdown
          }))
        }
      },
      include: { candidates: true }
    });

    // Step 7: Return formatted response
    return {
      recommendationId: run.id,
      appliedRule: { id: appliedRule.id, name: appliedRule.name, version: appliedRule.version },
      candidates: ranked,
      confidence: 95,
      explanation: appliedRule.explanation
    };
  }

  private conditionsMatch(conditions: Json, input: any): boolean {
    if (conditions.minDepthFt && input.boreDepthFt < conditions.minDepthFt) return false;
    if (conditions.maxDepthFt && input.boreDepthFt > conditions.maxDepthFt) return false;
    if (conditions.phase && input.phase !== conditions.phase) return false;
    return true;
  }

  private async rankCandidates(
    productIds: string[],
    weights: any,
    tenantId: string
  ) {
    // DETERMINISTIC ranking: never random, always repeatable
    const candidates = await Promise.all(
      productIds.map(async (productId) => {
        const product = await this.prisma.product.findUnique({
          where: { id: productId },
          include: { inventory: true }
        });

        // Stock score: 0-35 based on available inventory
        const availableStock = product.inventory?.onHand || 0;
        const stockScore = Math.min(35, availableStock * 5);

        // Price score: 0-25 (lower price = higher score)
        const priceScore = Math.max(0, 25 - (product.sellingPrice / 1000));

        // Attribute match score: 0-25 (specs match requirement)
        const attributeMatchScore = 15; // TODO: implement full attribute matching

        // Preference score: 0-15 based on shop's past preference
        const preferenceRecord = await this.prisma.tenantPreference?.findFirst({
          where: { tenantId, productId }
        });
        const preferenceScore = preferenceRecord?.weight || 0;

        const totalScore = stockScore + priceScore + attributeMatchScore + preferenceScore;

        return {
          productId,
          score: Math.min(100, totalScore),
          breakdown: {
            stock: stockScore,
            price: priceScore,
            attributes: attributeMatchScore,
            preference: preferenceScore
          }
        };
      })
    );

    // Sort by score descending (highest first)
    return candidates.sort((a, b) => b.score - a.score);
  }
}
```

---

## Phase 5: API Endpoint

```typescript
@Controller('api/v1/decisions')
@UseGuards(JwtAuthGuard)
export class DecisionController {
  constructor(private decisionService: DecisionService) {}

  @Post('recommend-solution')
  async recommend(@CurrentUser() user: any, @Body() dto: any) {
    return this.decisionService.recommendSolution(user.tenantId, dto);
  }
}
```

**Request:**
```json
{
  "category": "SUBMERSIBLE_MOTOR",
  "boreDepthFt": 330,
  "phase": "SINGLE",
  "budget": 50000
}
```

**Response (Success):**
```json
{
  "recommendationId": "rec_abc123",
  "confidence": 95,
  "appliedRule": {
    "ruleId": "rule_bore_300_350",
    "name": "Bore Well 300-350ft Single Phase",
    "version": 1,
    "explanation": "Matched your bore depth and phase"
  },
  "candidates": [
    {
      "rank": 1,
      "productId": "prod_motor_3hp_a",
      "productName": "Motor 3HP - Brand A",
      "score": 92,
      "scoreBreakdown": {
        "stock": 35,
        "price": 25,
        "attributes": 15,
        "preference": 17
      }
    }
  ],
  "solution": {
    "required": [
      { "productId": "...", "name": "Motor 3HP", "qty": 1 }
    ],
    "recommended": [
      { "productId": "...", "name": "Starter", "qty": 1 }
    ]
  }
}
```

**Response (No Match - Asks for Missing Input):**
```json
{
  "code": "DECISION_NO_MATCH",
  "message": "I need bore depth and phase to recommend a motor. Please provide:",
  "missingFields": ["boreDepthFt", "phase"],
  "suggestion": "Tell me your bore depth in feet and whether it's single or three-phase.",
  "recommendationId": "rec_xyz"
}
```

---

## Phase 6: Copilot Integration

```typescript
async chat(
  tenantId: string,
  userId: string,
  message: string,
  sessionId?: string
) {
  // Detect recommendation intent
  if (this.isRecommendationQuery(message)) {
    // Extract customer needs from message
    const query = this.extractQuery(message);
    // query = { boreDepthFt: 330, phase: "SINGLE", budget: 50000 }

    // Call decision engine
    const recommendation = await this.decisionService.recommendSolution(
      tenantId,
      query
    );

    // Format human-friendly response
    const assistantMessage = `
      Based on your bore depth of ${query.boreDepthFt}ft with ${query.phase} phase,
      I recommend a 3HP motor (Motor A) which is in stock and preferred for your shop.

      This matched our rule: "Bore Well 300-350ft Single Phase → 3HP"
      
      The solution includes:
      - Motor 3HP (required)
      - Starter (required)
      - Safety Rope (recommended)
    `;

    // Record decision with audit trail
    await this.persistTurn(sessionId, userId, tenantId, {
      userMessage: message,
      assistantMessage,
      recommendationRunId: recommendation.recommendationId,
      appliedRuleId: recommendation.appliedRule.ruleId
    });

    return {
      message: assistantMessage,
      recommendationId: recommendation.recommendationId,
      confidence: recommendation.confidence
    };
  }

  // ... other chat logic ...
}

private isRecommendationQuery(message: string): boolean {
  const keywords = ['recommend', 'suggest', 'what motor', 'what pump', 'what should i sell'];
  return keywords.some(kw => message.toLowerCase().includes(kw));
}

private extractQuery(message: string): any {
  // Simple parser (can be enhanced)
  const depth = this.extractNumber(message, /(\d+)\s*(ft|feet|')/i);
  const phase = message.toLowerCase().includes('single') ? 'SINGLE' : 'THREE';
  return { boreDepthFt: depth, phase };
}
```

---

## Scoring Breakdown Reference

**Deterministic Scoring Formula:**
```
totalScore = stockScore + priceScore + attributeMatchScore + preferenceScore
```

**Component Ranges** (all deterministic, never random):
- **Stock Score**: 0-35 points (based on available inventory count)
  - 0 units = 0 pts
  - 5+ units = 35 pts
  - Formula: `min(35, onHandCount * 5)`

- **Price Score**: 0-25 points (lower price = higher score)
  - Price > ₹10,000 = 0 pts
  - Price ₹1,000 = 25 pts
  - Formula: `max(0, 25 - (price / 1000))`

- **Attribute Match Score**: 0-25 points (specs match requirement)
  - Exact match = 25 pts
  - Within 10% = 20 pts
  - Within 20% = 15 pts
  - Out of range = 0 pts

- **Preference Score**: 0-15 points (shop's past preference)
  - Shop's top brand = +15 pts
  - Neutral brand = 0 pts
  - Shop rejected before = -5 pts (if stored)

**Total Score Range**: 0-100
- 90+ = Excellent match (recommend)
- 70-89 = Good match (recommend)
- 50-69 = Acceptable match (show as option)
- <50 = Poor match (ask user to refine query)

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| "No matching rule" | Input missing critical fields | Return DECISION_NO_MATCH with missingFields array |
| "Template not found" | Rule references non-existent template | Verify template code in rule outcome |
| "Product not found" | Template item references deleted product | Soft-delete products, not hard-delete |
| "Type error on conditions" | Conditions JSON is malformed | Validate JSON structure |
| "Score < 50" | Rule matched but low stock/price | Check inventory levels and pricing |

---

## Testing Checklist (Phase 5)

```bash
# 1. Seed data
pnpm prisma db seed

# 2. Check attributes
SELECT COUNT(*) FROM AttributeDefinition;  -- Should be 3+

# 3. Check compatibility
SELECT COUNT(*) FROM ProductCompatibility;  -- Should be 3+

# 4. Check solution template
SELECT * FROM SolutionTemplate WHERE code = 'BOREWELL_STANDARD_3HP';

# 5. Check decision rule
SELECT * FROM DecisionRule WHERE capability = 'RECOMMEND_SOLUTION' AND status = 'ACTIVE';

# 6. Test API
curl -X POST http://localhost:3000/api/v1/decisions/recommend-solution \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "SUBMERSIBLE_MOTOR",
    "boreDepthFt": 330,
    "phase": "SINGLE"
  }'

# 7. Check recommendation was recorded
SELECT COUNT(*) FROM RecommendationRun;  -- Should be 1
SELECT * FROM RecommendationCandidate WHERE recommendationRunId = '...';

# 8. Type-check
pnpm -C apps/api exec tsc --noEmit
```

---

## Remember

✅ **Do this:**
- One clear endpoint per phase
- Deterministic logic (same input → same output)
- Audit trail for every decision
- Seed data for testing

❌ **Don't do this:**
- LangGraph yet
- Admin UI yet
- Model fine-tuning yet
- Preference learning yet
- Caching yet
- Multiple step workflows yet

**Build Version 1. Ship. Learn. Then build Version 2.**
