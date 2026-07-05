# The ShopPilot Architecture Bible

**Version:** 0.1 (Living Document)  
**Last Updated:** 2026-07-06  
**Status:** Framework Phase

> ⚠️ **IMPORTANT**: This document describes our *target* architecture. Not all sections are immediate.
> 
> **Phase 1-3 (Next 6 weeks)**: Implement core models + decision engine API only.
> **Phase 4-7 (After validation)**: Add orchestration, tooling, MCP.
> 
> See **Implementation Roadmap** section for what we actually build first.

---

## Vision

### What is ShopPilot?

ShopPilot is **the operating system for retail knowledge**.

Today, shop owners and salespeople operate with knowledge scattered across:
- Their memory
- Notebooks and WhatsApp chats
- Fragmented spreadsheets
- Unwritten "tribal" experience

This creates inefficiency, inconsistency, and lost institutional knowledge when people leave.

### Our Mission

**Capture. Organize. Make searchable. Make explainable. Make reusable.**

Every feature must answer: *"Does this help a shop preserve or apply its knowledge?"*

### Product Philosophy

1. **Knowledge First**: We build systems to capture and organize retail expertise, not just transactions.
2. **Explainability Before Optimization**: Users must understand *why* the system recommends something.
3. **Incremental, Not Predictive**: We help shops formalize what they already know before predicting what they don't.
4. **Industry Agnostic**: Core concepts should work for motors, furniture, CCTV, and beyond. Domain-specific knowledge is plugged in, not baked in.
5. **Version 1 Over Version Perfect**: Ship with one real shop. Learn. Iterate.

---

## Domain Model

### Core Entities

```
Tenant (Multi-tenant SaaS boundary)
├── User (roles: OWNER, SALESMAN, MANAGER, OPERATOR, PLATFORM_ADMIN)
├── Product Catalog
│   ├── Category
│   ├── Product
│   ├── AttributeDefinition (generic: HP, HEAD, PHASE, MATERIAL, etc.)
│   ├── ProductAttributeValue
│   ├── Brand
│   └── InventoryStock (per warehouse, with ledger)
├── Customer Database
│   ├── Customer (name, phone, metadata)
│   ├── CustomerPreference (likes, dislikes, history)
│   └── CustomerWhatsAppConversation (audit trail)
├── Decision Knowledge
│   ├── SolutionTemplate (capture "what we usually sell")
│   ├── ProductCompatibility (relationships: required, recommended, alternative, incompatible)
│   ├── DecisionRule (versioned, auditable: "if depth 300-350 → 3HP")
│   └── CustomerSegment (patterns: bore depth, industry, budget)
├── Quotation Engine
│   ├── Quote (header with approval flow)
│   ├── QuoteItem (product snapshot, not live references)
│   ├── QuoteApprovalState (DRAFT → SENT → APPROVED → INVOICED → DISPATCHED)
│   └── QuoteAudit (who changed what, when, why)
├── Agent Management
│   ├── Agent (sales agent)
│   └── AgentCommission (versioned rates, quota tracking)
├── AI Orchestration
│   ├── CopilotSession (chat sessions only)
│   ├── CopilotMessage (immutable conversation record)
│   ├── RecommendationRun (what the AI decided and why)
│   ├── RecommendationCandidate (ranked products with scores)
│   └── RecommendationFeedback (how the shop responded)
└── Platform Configuration
    ├── FeatureFlag (subscription tiers)
    ├── AuditLog (critical actions: quotes, payments, inventory adjustments)
    └── TenantSettings (preferences, rules, approval workflows)
```

### Key Boundaries

1. **Knowledge** (immutable, versioned, auditable)
   - Rules, templates, compatibility relationships
   - Each change creates a version record
   - Source of truth for decisions

2. **Transactions** (mutable, snapshot-based)
   - Quotes capture product state at creation time
   - Inventory adjustments are immutable ledger entries
   - Never rewrite history; create adjustments

3. **Preference** (mutable, user-owned)
   - Customer likes/dislikes
   - Agent overrides
   - Approval workflows

4. **Conversation** (ephemeral, not trusted for decisions)
   - Chat messages are for context
   - Decisions come from the Decision Engine
   - Chat records what happened, not why

---

## Decision Engine

### Philosophy

The Decision Engine is the **brain** of ShopPilot. It must be:

- **Deterministic**: Same input → same output (modulo ranking weights)
- **Auditable**: Every decision records what rule fired, what candidates existed, why one ranked first
- **Explainable**: Shop owner can ask "why did you recommend this?" and get a clear answer
- **Learnable**: Feedback from shop accumulates into better rules

### Architecture

```
Query (What does the customer need?)
    ↓
DecisionRule.filter() (Find applicable rules)
    ↓
SolutionTemplate.expand() (Get required + recommended items)
    ↓
ProductCompatibility.resolve() (Find compatible products)
    ↓
Inventory.rank() (Rank by stock, price, preference)
    ↓
RecommendationRun.record() (Store decision with confidence score)
    ↓
Quotation.draft() (Convert to quote)
    ↓
RecommendationFeedback.track() (Shop approves, modifies, or rejects)
```

### Example: Recommend a Submersible Motor

**Input:**
```json
{
  "customerSegment": "bore_well",
  "boreDepthFt": 330,
  "phase": "single",
  "budget": 50000
}
```

**Decision Engine Flow:**
1. Query matching rules → `DecisionRule[phase=SINGLE, depthFt: 300-350]` → outcome: 3HP, head≥350ft
2. Expand template → required: starter, cable; recommended: safety_rope
3. Resolve compatibility → find 3HP motors that are `REQUIRED_WITH → starter` and `RECOMMENDED_WITH → safety_rope`
4. Rank candidates:
   - Motor A: In stock, ₹45K, this shop's preferred brand (weight: 35/100)
   - Motor B: 5 units available, ₹42K, new brand (weight: 25/100)
5. Record `RecommendationRun`:
   - Capability: `RECOMMEND_SOLUTION`
   - Candidates: [Motor A (rank 1, score 92), Motor B (rank 2, score 78)]
   - Confidence: 95% (rule matched, inventory available)
6. Draft quote with Motor A + starter + rope
7. Track feedback: shop approves → update preference weights

**Output:**
```json
{
  "recommendationId": "rec_xyz",
  "confidence": 0.95,
  "solution": {
    "required": [{ productId: "motor_3hp", qty: 1 }],
    "recommended": [{ productId: "starter", qty: 1 }, { productId: "rope", qty: 2 }]
  },
  "explanation": "Matched rule: SINGLE_PHASE_BOREWELL_300_350FT → 3HP. Motor A preferred for your shop."
}
```

---

## Knowledge Model

### DecisionRule

Where shopkeepers teach the system.

```sql
CREATE TABLE DecisionRule (
  id UUID PRIMARY KEY,
  tenantId UUID NOT NULL,
  capability VARCHAR(50),  -- RECOMMEND_SOLUTION, CHECK_INVENTORY, ESTIMATE_DELIVERY
  name VARCHAR(255),
  description TEXT,
  conditions JSONB,        -- { category, depthFt, phase, budget, etc. }
  outcome JSONB,           -- { requiredAttributes, solutionTemplateCode, rankingWeights }
  priority INTEGER,
  version INTEGER,
  status ENUM('DRAFT', 'ACTIVE', 'RETIRED'),
  explanation TEXT,        -- "Why this rule? What problem does it solve?"
  createdById UUID,
  approvedById UUID,
  approvedAt TIMESTAMP,
  effectiveFrom TIMESTAMP,
  effectiveTo TIMESTAMP,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP,
  
  UNIQUE (tenantId, capability, name, version),
  FOREIGN KEY (tenantId) REFERENCES Tenant(id),
  FOREIGN KEY (createdById) REFERENCES User(id)
);
```

### ProductCompatibility

Capture "what goes together."

```sql
CREATE TABLE ProductCompatibility (
  id UUID PRIMARY KEY,
  tenantId UUID NOT NULL,
  sourceProductId UUID NOT NULL,
  targetProductId UUID NOT NULL,
  relationType ENUM('REQUIRED_WITH', 'RECOMMENDED_WITH', 'ALTERNATIVE_TO', 'INCOMPATIBLE_WITH'),
  reason TEXT,
  priority INTEGER,       -- 1=critical, 2=important, 3=nice-to-have
  active BOOLEAN,
  createdAt TIMESTAMP,
  
  UNIQUE (tenantId, sourceProductId, targetProductId, relationType),
  FOREIGN KEY (tenantId) REFERENCES Tenant(id),
  FOREIGN KEY (sourceProductId) REFERENCES Product(id),
  FOREIGN KEY (targetProductId) REFERENCES Product(id)
);
```

Example:
- `Motor_3HP` → `REQUIRED_WITH` → `Starter`
- `Motor_3HP` → `RECOMMENDED_WITH` → `SafetyRope`
- `Motor_3HP` → `ALTERNATIVE_TO` → `Motor_2HP`
- `Motor_3HP` → `INCOMPATIBLE_WITH` → `Three-PhaseStarter`

### SolutionTemplate

Capture "what we usually sell together."

```sql
CREATE TABLE SolutionTemplate (
  id UUID PRIMARY KEY,
  tenantId UUID,          -- NULL = platform standard
  code VARCHAR(50),
  name VARCHAR(255),
  categoryId UUID,
  purpose TEXT,           -- "Typical bore well installation"
  description TEXT,
  active BOOLEAN,
  createdAt TIMESTAMP,
  
  UNIQUE (tenantId, code),
  FOREIGN KEY (tenantId) REFERENCES Tenant(id),
  FOREIGN KEY (categoryId) REFERENCES Category(id)
);

CREATE TABLE SolutionTemplateItem (
  id UUID PRIMARY KEY,
  solutionTemplateId UUID NOT NULL,
  productCategoryId UUID,
  productId UUID,
  requirementType ENUM('REQUIRED', 'RECOMMENDED', 'OPTIONAL'),
  defaultQuantity DECIMAL(10,2),
  reason TEXT,
  priority INTEGER,
  
  FOREIGN KEY (solutionTemplateId) REFERENCES SolutionTemplate(id),
  FOREIGN KEY (productCategoryId) REFERENCES Category(id),
  FOREIGN KEY (productId) REFERENCES Product(id)
);
```

Example: `BOREWELL_STANDARD_3HP` template includes:
- REQUIRED: Motor_3HP (qty 1)
- REQUIRED: Starter (qty 1)
- RECOMMENDED: SafetyRope (qty 2)
- RECOMMENDED: Pressure_Gauge (qty 1)
- OPTIONAL: Foot_Valve (qty 1)

---

## AI Architecture

### Copilot Module (User-Facing Chat)

**Responsibility:** Conversation, clarification, context.

**Does NOT:**
- Make recommendations directly
- Query Prisma tables
- Decide products

**Does:**
- Listen to customer requirements
- Ask clarifying questions
- Call `DecisionModule` for recommendations
- Format explanations for users
- Store chat history

### Decision Module (The Brain)

**Responsibility:** All business logic for recommendations.

**Exports:**
- `recommendSolution(tenantId, query)` → `RecommendationRun`
- `explainDecision(recommendationId)` → human-readable explanation
- `applyFeedback(recommendationId, feedback)` → update preference weights

**Owns:**
- DecisionRule evaluation
- ProductCompatibility queries
- Inventory ranking
- Confidence scoring

### Tool Registry Module (Orchestration)

**Responsibility:** Expose Decision Engine to LangGraph.

```typescript
const tools = [
  {
    name: "recommend_solution",
    description: "Recommend products based on customer needs",
    schema: { ... },
    handler: (query) => decisionModule.recommendSolution(query)
  },
  {
    name: "check_inventory",
    description: "Check stock for a product",
    handler: (productId) => inventoryModule.checkStock(productId)
  },
  {
    name: "create_draft_quote",
    description: "Create a draft quote from a solution",
    handler: (solutionId) => quotesModule.draftFromSolution(solutionId)
  },
  // More tools...
];
```

### LangGraph Orchestration

**Responsibility:** Multi-step reasoning, tool calling, state management.

```
User Query
    ↓
Copilot receives message
    ↓
LangGraph workflow:
  1. Classify intent (recommendation? inventory check? quote status?)
  2. Extract entities (customer, product category, depth, phase)
  3. Call appropriate tools
  4. Process results
  5. Generate explanation
    ↓
Copilot formats response
    ↓
User sees explanation + recommendation
```

### MCP Layer (Future External Integration)

When external systems need access:
- Expose `recommend_solution` as MCP tool
- Expose `check_inventory` as MCP tool
- Expose `get_quote` as MCP tool
- Let external ChatGPT, Claude, etc. call ShopPilot operations

**Does not happen in V1.**

---

## Database Standards

### Naming Conventions

- **Tables**: PascalCase (`Product`, `QuoteItem`, `InventoryStock`)
- **Columns**: camelCase (`productId`, `tenantId`, `createdAt`)
- **Booleans**: `is*` prefix (`isActive`, `isDeleted`)
- **Timestamps**: `createdAt`, `updatedAt`, `deletedAt` (soft deletes)
- **Foreign Keys**: `{tableName}Id` (`customerId`, `tenantId`)

### Multi-Tenancy

Every table that stores business data must have:
- `tenantId UUID NOT NULL`
- Row-level security policy (Postgres RLS when possible)
- Unique constraints include `(tenantId, ...)`

Example:
```sql
-- Correct
UNIQUE (tenantId, sku)

-- Wrong
UNIQUE (sku)  -- Could collide across tenants
```

### Snapshots for Historical Accuracy

Quotes must remain correct even if products change:
- Store `skuSnapshot`, `priceSnapshot`, `taxRateSnapshot`
- Store `productAttributesSnapshot JSONB`
- Never update quote items; create corrections

### Audit Trail

Financially significant entities must track:
- `createdById`, `createdAt`
- `updatedById`, `updatedAt`
- `approvedById`, `approvedAt` (if approval required)
- Store versioned history or immutable ledger

### JSON Fields

Use `JSONB` for:
- `metadata` (temporary bridge before proper normalization)
- `conditions`, `outcome` (on DecisionRule)
- `scoreBreakdown` (on RecommendationCandidate)
- Snapshots: `attributesSnapshot`

Never use JSON for:
- Relationships that need querying
- Data that should be normalized

---

## API Standards

### Endpoints Structure

```
/api/v1/{resource}/{id}/{action}

GET    /quotes/:id/pdf          → Download PDF
POST   /decisions/recommend      → Call decision engine
GET    /inventory/:productId    → Check stock
POST   /copilot/chat             → Send message
GET    /copilot/sessions/:id    → Get conversation history
POST   /recommendations/:id/feedback → Shop provides feedback
```

### Response Format

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": {
    "timestamp": "2026-07-06T10:00:00Z",
    "requestId": "req_xyz"
  }
}
```

Error Response:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "DECISION_NO_MATCH",
    "message": "No decision rule matches this query",
    "details": { "category": "FURNITURE", "budget": 5000 }
  }
}
```

### Decision Engine API Response

Every recommendation includes audit trail:
```json
{
  "recommendationId": "rec_abc123",
  "capability": "RECOMMEND_SOLUTION",
  "confidence": 0.95,
  "solution": { ... },
  "candidates": [
    {
      "productId": "prod_1",
      "rank": 1,
      "score": 92,
      "scoreBreakdown": {
        "stock": 35,
        "preference": 30,
        "price": 25,
        "performance": 2
      }
    }
  ],
  "appliedRule": {
    "ruleId": "rule_bore_well_300_350",
    "name": "Single-Phase Bore Well 300-350ft",
    "version": 2,
    "explanation": "..."
  },
  "timestamp": "2026-07-06T10:00:00Z"
}
```

---

## UI Standards

### Copilot Chat Interface

- Show message history
- Display recommendations with confidence score
- Show "Why this?" explainer
- Allow "Modify this" or "Show alternatives"
- Store edits as feedback

### Quote Builder

- Allow manual edits to recommended solution
- Show removed items with reason
- Show added items with validation
- Calculate live totals
- Require approval before sending

### Recommendation Transparency

- Every recommendation page shows:
  - Applied rule and version
  - Candidate products ranked with scores
  - Why each score component (stock, preference, price)
  - Feedback history: accepted/modified/rejected

---

## Security

### Multi-Tenancy

- All queries filter by `tenantId`
- No cross-tenant data leakage
- Row-level security (Postgres RLS recommended)

### User Roles

- `PLATFORM_ADMIN`: Can manage all tenants, view audit logs
- `TENANT_OWNER`: Full access to tenant data, manage subscriptions
- `MANAGER`: Approve quotes, view reports, manage agents
- `SALESMAN`: Create quotes, chat with Copilot, view inventory
- `OPERATOR`: View-only, inventory adjustments

### API Security

- JWT tokens include `tenantId`
- All endpoints verify token + resource ownership
- Audit log all writes: who, what, when, why
- PDF downloads log request + IP

---

## Deployment

### Local Development

- Docker Compose with PostgreSQL 15, Redis
- NestJS hot-reload
- Next.js dev server with fast refresh
- Prisma migrations auto-run

### Staging

- Deploy to AWS ECS or similar
- PostgreSQL RDS with automated backups
- Redis ElastiCache
- S3 for PDF storage
- CloudWatch for logs

### Production

- Multi-region PostgreSQL (primary + replica)
- Redis cluster
- S3 with versioning for PDFs
- CDN for static assets
- Audit logs to separate database
- Monthly data retention policy

---

## Implementation Roadmap

**Our actual build path, validated with one real shop:**

### Phase 1: Architecture Blueprint ✅ DONE
- Decision Engine philosophy documented
- Domain model defined
- Database standards established

### Phase 2: Product Attributes (Weeks 1-2)
- `AttributeDefinition` model: HP, Head, Phase, Material, etc.
- `ProductAttributeValue` model: link products to attributes
- **No UI yet. Seed data only.**

### Phase 3: Compatibility & Solutions (Weeks 2-3)
- `ProductCompatibility` model: required, recommended, alternative, incompatible
- `SolutionTemplate` + `SolutionTemplateItem`: "what we usually sell"
- **No UI yet. API test only.**

### Phase 4: Decision Audit Trail (Weeks 3-4)
- `RecommendationRun` model: decision record with rule fired
- `RecommendationCandidate` model: ranked product scores
- `RecommendationFeedback` model: how shop responded
- `DecisionRule` model: versioned, approvable rules

### Phase 5: Decision Engine API (Weeks 4-5)
- `DecisionModule` with plain NestJS services
- `POST /decisions/recommend-solution` endpoint
- **No LangGraph. No Copilot yet. Pure logic.**
- Validate with one shop's requirements

### Phase 6: Copilot Integration (Weeks 5-6)
- Copilot calls `DecisionModule.recommendSolution()`
- Existing Copilot chat wired to decision engine
- Feedback flows back to recommendation audit

### Phase 7: Orchestration & Tooling (After validation)
- **Only after Phase 6 works with real shop:**
  - LangGraph for multi-step reasoning
  - Tool registry for external access
  - MCP server (Year 2+)

---

## Scaling Strategy (Target Architecture)

### Phase 1-3 (Now): One Shop, One Vertical

- NestJS monolith + Next.js UI
- Single PostgreSQL instance
- Focus on correctness, not scale
- Validate decision engine with real shop

### Phase 4+ (After validation): Multiple Shops, One Vertical

- Multi-tenant foundation (already in place)
- Add customer self-service portal
- Cache decision rules (Redis) if needed
- Industry pack system proven

### Phase 5+ (6+ months): Multiple Industries

- Attribute system fully operational
- Generic decision engine proven across verticals
- Solution templates per industry

### Phase 6+ (12+ months): External Integrations

- MCP server for external AI access
- Webhook events (quote created, product updated)
- Import/export APIs

### Phase 7+ (Year 2+): Platform Economy

- App store for industry-specific rules
- Partner integrations (CRM, accounting, shipping)
- Marketplace for pre-built solutions

---

## Immediate Next Steps (What We Build First)

### Week 1-2: Database Models

Add to `schema.prisma`:
```prisma
model AttributeDefinition {
  id String @id @default(cuid())
  tenantId String
  code String           // HP, HEAD, PHASE, MATERIAL
  name String
  dataType String       // TEXT, NUMBER, BOOLEAN, SELECT
  unit String?
  allowedValues Json?   // For SELECT type
  appliesToCategoryId String?   // Optional: restrict to category
  active Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([tenantId, code])
  @@index([tenantId])
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
  
  @@unique([productId, attributeDefinitionId])
  @@index([productId])
}

model ProductCompatibility {
  id String @id @default(cuid())
  tenantId String
  sourceProductId String
  targetProductId String
  relationType String    // REQUIRED_WITH, RECOMMENDED_WITH, ALTERNATIVE_TO, INCOMPATIBLE_WITH
  reason String?
  priority Int           // 1=critical, 2=important, 3=nice-to-have
  active Boolean @default(true)
  createdAt DateTime @default(now())
  
  @@unique([tenantId, sourceProductId, targetProductId, relationType])
  @@index([tenantId, sourceProductId])
}

model SolutionTemplate {
  id String @id @default(cuid())
  tenantId String?       // NULL = platform standard
  code String
  name String
  categoryId String?
  purpose String?
  description String?
  active Boolean @default(true)
  createdAt DateTime @default(now())
  items SolutionTemplateItem[]
  
  @@unique([tenantId, code])
  @@index([tenantId])
}

model SolutionTemplateItem {
  id String @id @default(cuid())
  solutionTemplateId String
  productCategoryId String?
  productId String?
  requirementType String  // REQUIRED, RECOMMENDED, OPTIONAL
  defaultQuantity Decimal @default(1)
  reason String?
  priority Int
  template SolutionTemplate @relation(fields: [solutionTemplateId], references: [id])
  
  @@index([solutionTemplateId])
}

model DecisionRule {
  id String @id @default(cuid())
  tenantId String
  capability String      // RECOMMEND_SOLUTION, etc.
  name String
  description String?
  conditions Json        // { category, depthFt, phase, budget }
  outcome Json           // { requiredAttributes, solutionTemplateCode, rankingWeights }
  priority Int
  version Int
  status String          // DRAFT, ACTIVE, RETIRED
  explanation String?
  createdById String
  approvedById String?
  approvedAt DateTime?
  effectiveFrom DateTime?
  effectiveTo DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([tenantId, capability, name, version])
  @@index([tenantId, capability, status])
}

model RecommendationRun {
  id String @id @default(cuid())
  tenantId String
  copilotSessionId String?
  customerId String?
  capability String      // RECOMMEND_SOLUTION
  input Json
  result Json?
  confidence Decimal     // 0-100
  status String          // PENDING, COMPLETED, FAILED
  appliedRuleId String?
  appliedRuleVersion Int?
  createdAt DateTime @default(now())
  candidates RecommendationCandidate[]
  feedback RecommendationFeedback[]
  
  @@index([tenantId, customerId])
  @@index([tenantId, createdAt])
}

model RecommendationCandidate {
  id String @id @default(cuid())
  recommendationRunId String
  productId String
  rank Int
  score Decimal
  scoreBreakdown Json    // { stock, preference, price, performance }
  selected Boolean @default(false)
  rejectionReason String?
  run RecommendationRun @relation(fields: [recommendationRunId], references: [id])
  
  @@index([recommendationRunId])
}

model RecommendationFeedback {
  id String @id @default(cuid())
  recommendationRunId String
  actorUserId String?
  action String          // ACCEPTED, MODIFIED, REJECTED, IGNORED
  finalProductId String?
  reasonCode String?
  note String?
  createdAt DateTime @default(now())
  run RecommendationRun @relation(fields: [recommendationRunId], references: [id])
  
  @@index([recommendationRunId])
}
```

### Week 2-3: Create Migrations

```bash
pnpm prisma migrate dev --name add_decision_engine_models
```

### Week 3-4: Build DecisionModule

```bash
nest generate module decision
nest generate service decision/decision
```

Services:
- `DecisionService.recommendSolution(tenantId, query)` → `RecommendationRun`
- Rule matching logic
- Candidate ranking
- Confidence scoring

### Week 4-5: Expose API Endpoint

```
POST /api/v1/decisions/recommend-solution
{
  "category": "SUBMERSIBLE_MOTOR",
  "customerId": "...",
  "boreDepthFt": 330,
  "phase": "SINGLE",
  "budget": 50000
}

← Returns RecommendationRun with audit trail
```

### Week 5-6: Test with One Real Shop

- Create test data: products, attributes, rules, compatibility
- Call recommendation API
- Verify decisions make sense
- Gather feedback

### Week 6: Integrate with Copilot

- Update `CopilotService.chat()` to call `DecisionModule.recommendSolution()`
- Existing chat flow, but recommendations now auditable
- No breaking changes to Copilot UI

---

## Future Roadmap (After Phase 6)

### Before LangGraph: Prove Decision Engine

- [ ] One shop uses it for 1 month
- [ ] Gather feedback on rule creation UI
- [ ] Test multi-industry support

### When Ready: Orchestration & Tooling

- [ ] LangGraph for multi-step workflows
- [ ] Tool registry
- [ ] MCP server (Year 2+)

### When Proven: Platform Features

- [ ] Admin UI for rule management
- [ ] Bulk rule import/export
- [ ] Customer feedback loop
- [ ] Multi-language support
- [ ] Mobile app

---

## Open Questions

1. **Knowledge Governance**: How does a shop approve new rules before they go live? Who has authority?
2. **Multi-Industry**: Can we truly have one attribute/compatibility system, or do we need industry packs?
3. **Feedback Loop**: How quickly do we learn from feedback? Real-time or batch updates?
4. **Regulation**: What audit/compliance requirements exist for SaaS in India retail?
5. **First Shop**: Who is our first customer? What does their perfect tool look like?

---

**Next Update:** After Phase 1 decision engine is built.
