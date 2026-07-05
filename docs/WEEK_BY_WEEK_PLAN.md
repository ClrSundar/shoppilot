# ShopPilot Decision Engine: Week-by-Week Execution Plan

**6-Week Sprint to Decision Engine + Copilot Integration**

---

## WEEK 1-2: Product Attributes

**Goal:** Make products data-rich (HP, Head, Phase, Material, etc.)

### What to Build
- [ ] `AttributeDefinition` model (codes like HP, HEAD, PHASE)
- [ ] `ProductAttributeValue` model (links products to attributes)
- [ ] Add `metadata`, `barcode`, `description`, `gstRate` to Product
- [ ] Prisma migration
- [ ] Seed motor attributes: 3HP motor has [HP: 3, HEAD: 350, PHASE: SINGLE]

### API Endpoints
None yet. Seed data only.

### Validation
```bash
pnpm prisma db seed
# Verify: Product 3HP has attributes
SELECT * FROM ProductAttributeValue WHERE productId = '...' 
```

### Success Criteria
- ✅ Motor products have consistent attributes
- ✅ No breaking changes to existing Product model
- ✅ Type-check passes

### What NOT to Do
❌ UI for attribute management
❌ Attribute versioning
❌ Attribute constraints/validation rules

---

## WEEK 2-3: Compatibility & Solutions

**Goal:** Define "what goes together" and "what we usually sell"

### What to Build
- [ ] `ProductCompatibility` model (Motor_3HP → REQUIRED_WITH → Starter)
- [ ] `SolutionTemplate` + `SolutionTemplateItem` (package BOREWELL_STANDARD_3HP)
- [ ] Prisma migration
- [ ] Seed compatibility relationships
- [ ] Seed solution templates

### API Endpoints
None yet. Seed data only.

### Validation
```bash
pnpm prisma db seed
# Verify: Motor 3HP → REQUIRED_WITH → Starter
SELECT * FROM ProductCompatibility WHERE sourceProductId = '...'

# Verify: Solution template has items
SELECT * FROM SolutionTemplateItem WHERE solutionTemplateId = '...'
```

### Success Criteria
- ✅ Starter is REQUIRED_WITH Motor_3HP
- ✅ Rope is RECOMMENDED_WITH Motor_3HP
- ✅ Solution template BOREWELL_STANDARD_3HP exists with items
- ✅ No breaking changes
- ✅ Type-check passes

### What NOT to Do
❌ UI for compatibility management
❌ Smart suggestion algorithms
❌ Inventory depletion impact

---

## WEEK 3-4: Decision Audit Trail

**Goal:** Record WHAT the engine decides and WHY

### What to Build
- [ ] `DecisionRule` model (versioned, approvable rules)
- [ ] `RecommendationRun` model (decision record)
- [ ] `RecommendationCandidate` model (ranked products with scores)
- [ ] `RecommendationFeedback` model (shop's response)
- [ ] Prisma migration
- [ ] Seed example rule: "If depth 300-350ft AND phase=SINGLE → 3HP motor"

### API Endpoints
None yet. Seed data only.

### Validation
```bash
pnpm prisma db seed
# Verify: Rule exists
SELECT * FROM DecisionRule WHERE name = 'BORE_WELL_300_350_SINGLE'
```

### Success Criteria
- ✅ Rule is versioned, has status (DRAFT/ACTIVE)
- ✅ Rule has conditions (depth 300-350ft, phase SINGLE)
- ✅ Rule has outcome (HP: 3, solution template code)
- ✅ No breaking changes
- ✅ Type-check passes

### What NOT to Do
❌ Rule UI editor
❌ Rule approval workflow
❌ Rule versioning UI

---

## WEEK 4-5: Decision Engine API

**Goal:** Build one service endpoint that makes decisions

### What to Build
- [ ] `DecisionModule` with `DecisionService`
- [ ] `DecisionController` with `POST /decisions/recommend-solution`
- [ ] DTO: `RecommendSolutionDto` (category, depth, phase, budget)
- [ ] DTO: `RecommendationResponseDto` (recommendation with audit trail)
- [ ] Implement `recommendSolution()` logic:
  1. Find applicable rules
  2. Evaluate conditions against input
  3. Expand solution template
  4. Find compatible products
  5. Rank candidates
  6. Record decision in RecommendationRun
  7. Return response with audit trail

### API Endpoints
```
POST /api/v1/decisions/recommend-solution
{
  "category": "SUBMERSIBLE_MOTOR",
  "customerId": "cust_123",
  "boreDepthFt": 330,
  "phase": "SINGLE",
  "budget": 50000
}

← {
  "recommendationId": "rec_abc",
  "confidence": 95,
  "solution": {
    "required": [{ productId, qty, name }],
    "recommended": [...]
  },
  "candidates": [
    { rank: 1, productId, productName, score: 92, scoreBreakdown: {...} }
  ],
  "appliedRule": { ruleId, name, version },
  "explanation": "Matched rule: BORE_WELL_300_350_SINGLE → 3HP. Motor A preferred..."
}
```

### Validation
```bash
curl -X POST http://localhost:3000/api/v1/decisions/recommend-solution \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "SUBMERSIBLE_MOTOR",
    "boreDepthFt": 330,
    "phase": "SINGLE"
  }'

# Should return recommendation with 3HP motor
```

### Success Criteria
- ✅ Endpoint returns recommendation for valid input
- ✅ Recommendation includes audit trail (applied rule, candidates, scores)
- ✅ Decision is recorded in DB (RecommendationRun created)
- ✅ Confidence score >= 90 for matched rules
- ✅ Type-check passes
- ✅ No Copilot changes yet

### Critical Rules
✅ **Ranking MUST be deterministic** (stock + price + attributes + preference)
✅ **No rule match returns structured error** (not HTTP 400), asks for missing fields
✅ **Every decision is recorded** (even non-matches go to audit trail)

### What NOT to Do
❌ LangGraph integration
❌ LLM calls
❌ Admin UI
❌ Preference learning
❌ Random/placeholder scores

---

## WEEK 5-6: Copilot Integration

**Goal:** Wire Copilot chat to Decision Engine

### What to Build
- [ ] Inject `DecisionService` into `CopilotService`
- [ ] Add `isRecommendationQuery()` intent classifier
  - Detects: "recommend a motor", "what should I sell", "I need a pump"
- [ ] Add `extractQuery()` parser
  - Extracts: depth, phase, budget, customer needs from chat message
- [ ] Wire chat flow:
  - User message → Copilot receives
  - If recommendation intent → extract query
  - Call `DecisionService.recommendSolution()`
  - Format response with explanation
  - Persist turn with `recommendationRunId`
- [ ] Update response DTO to include `recommendationRunId`
- [ ] Handle feedback in chat (user says "no, try another" → create feedback record)

### API Endpoints (Updated)
```
POST /api/v1/copilot/chat
{
  "message": "I have a 330ft bore well, single phase. What motor should I sell?",
  "sessionId": "session_123",
  "previousMessages": [...]
}

← {
  "message": "Based on your bore depth of 330ft with single phase...",
  "recommendationId": "rec_abc",
  "confidence": 95,
  "sessionId": "session_123",
  "confirmationToken": "cpt_xyz"
}
```

### Validation
- ✅ Open Copilot chat in web UI
- ✅ Say "I have a 330ft bore well, single phase motor"
- ✅ Copilot responds with 3HP motor recommendation
- ✅ Response includes "Why this?" explanation
- ✅ Recommendation is logged in DB

### Success Criteria
- ✅ Copilot calls decision engine for recommendations
- ✅ Existing Copilot features still work
- ✅ Chat history includes recommendation metadata
- ✅ No breaking changes to frontend
- ✅ Type-check passes

### What NOT to Do
❌ LangGraph
❌ Multiple steps (still single turn)
❌ Shopping cart from chat (already in Quote Builder)
❌ Model fine-tuning

---

## Daily Standup Template (Monday-Friday)

```
What I completed yesterday:
- [ ] [specific code change]

What I'm working on today:
- [ ] [specific code change]

Blockers:
- [ ] [if any]

By EOD:
- Type-check ✅
- Seed data verified ✅
- No breaking changes to existing features ✅
```

---

## When You Get Stuck

| Problem | Solution |
|---------|----------|
| "How do I rank candidates?" | Deterministic: stockScore + priceScore + attributeMatchScore + preferenceScore (never random) |
| "What if no rule matches?" | Return DECISION_NO_MATCH with missingFields array: `{ code, message, missingFields: ["phase"] }` |
| "How do I format the explanation?" | Use rule's `explanation` field + "Motor A preferred for your shop" |
| "Should I cache rules?" | Not yet. Single PostgreSQL, queries are fast. Phase 4+ if needed |
| "What about LangGraph?" | Week 7. Not yet. Prove decision engine first. |
| "Multiple recommendations?" | Handle in Phase 7. Phase 5 = one recommendation per query. |

---

## Red Flags (Stop & Ask User)

🚩 **If you find yourself building:**
- Admin UI for rule management → Ask: "Should this be in MVP?"
- LangGraph chains → Ask: "Is Phase 5 working with real shop?"
- Preference learning algorithms → Ask: "Do we have data yet?"
- Multi-step chat workflows → Ask: "Is Phase 6 validation done?"
- Model fine-tuning → Stop. Not in Phase 1-6.

---

## Success: End of Week 6

When you're done:

✅ **Database**: 8 new tables (Attribute, Compatibility, Solution, Decision, Recommendation)
✅ **API**: 1 new endpoint (`POST /decisions/recommend-solution`)
✅ **Copilot**: Wired to decision engine
✅ **Audit Trail**: Every recommendation is recorded with why
✅ **Validation**: One real shop makes recommendations, provides feedback
✅ **Code**: Type-check passes, no breaking changes

At this point:
- Decision Engine is **proven**
- Copilot is **integrated**
- Next step: **Gather real shop feedback**
- Then: **Decide on Phase 7 or iterate**

---

## Don't Move to Phase 7 Until:

1. ✅ Phase 5 API works perfectly
2. ✅ Copilot chat produces correct recommendations
3. ✅ One real shop has used it for >= 1 week
4. ✅ Recommendations are accurate to shop's expectations
5. ✅ Rule versioning and approval works
6. ✅ Audit trail is trustworthy

**Build Version 1, not Version Perfect.**
