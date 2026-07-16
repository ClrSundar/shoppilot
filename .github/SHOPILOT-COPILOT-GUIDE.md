# ShopPilot Copilot Development Guide

This guide defines how AI assistants should be used while developing ShopPilot.

ShopPilot is a multi-tenant business platform being developed incrementally.

The AI must respect the existing architecture and must not invent new architecture unnecessarily.

---

# 1. Core ShopPilot Architecture Rules

Before working on any feature, remember:

## Decision Engine

DecisionService owns recommendation decisions.

Copilot must not:

- Re-rank products
- Invent recommendations
- Invent accessories
- Override DecisionService
- Apply independent recommendation heuristics

Copilot may:

- Format DecisionService output
- Explain recommendations
- Explain warnings
- Explain NO_MATCH results
- Prepare user-facing actions based on domain output

## Pricing

PricingModule/PricingService owns:

- Base pricing
- Customer type pricing
- Discount rules
- Manual discounts
- Quote discounts
- Landing price protection
- Price override approvals
- Pricing snapshots

Do not duplicate pricing logic in:

- Copilot
- Quotes
- Frontend
- Controllers

## Commissions

CommissionsModule/CommissionsService owns:

- Commission rules
- Commission accruals
- Commission earning lifecycle
- Commission reversals
- Commission settlements

Do not calculate commissions inside PricingService.

Do not calculate commissions inside Quote pricing logic.

## Quotes

Quotes are commercial records.

Preserve:

- Price snapshots
- Discount snapshots
- Recommendation traceability
- Historical commercial values

Do not silently recalculate historical commercial records.

## Tenant Isolation

All tenant-owned data must remain tenant-scoped.

Never trust a client-provided tenantId as the source of tenant identity.

## Business Home

The Dashboard is evolving into Business Home.

The owner question is:

> What needs my attention this morning?

Prioritize:

- Money to collect
- Sales requiring action
- Stock risk
- Immediate business actions

Do not turn Business Home into a generic ERP module index.

## AI Architecture

Do not introduce the following unless explicitly requested:

- RAG
- Vector databases
- Knowledge bases
- LangGraph
- MCP
- AI orchestration platforms

AI should not replace normal business domain ownership.

---

# 2. Standard AI Workflow

For non-trivial features, follow:

Explorer → Architect → Implementer → Verifier

Do not skip the architecture stage for features that affect business rules, database models, or multiple domains.

---

# 3. I Want to Add a New Feature

## Step 1 — Explorer

Use:

`@shopilot-explorer`

Prompt:

> Map the current architecture for [FEATURE].
>
> Do not modify files.
>
> Identify the existing domain owner, current flow, relevant files, rules that must be preserved, likely change surface, and risks.

Wait for the Explorer response.

## Step 2 — Architect

Use:

`@shopilot-architect`

Prompt:

> Using the exploration above, create the implementation plan for [FEATURE].
>
> Respect the existing ShopPilot architecture and domain boundaries.
>
> Do not modify files.

Wait for the architecture plan.

## Step 3 — Review the Plan

Before implementation, check:

- Is the domain owner correct?
- Is the change surface small?
- Is the feature being placed in an existing module?
- Are historical records protected?
- Is tenant isolation preserved?
- Are non-goals clear?

If the plan is wrong, ask the Architect to revise it.

## Step 4 — Implement

Use:

`@shopilot-implementer`

Prompt:

> Implement only the approved architecture plan above.
>
> Do not redesign the feature.
>
> Do not scan unrelated modules.
>
> Do not perform unrelated refactoring.
>
> Run targeted validation after implementation.

## Step 5 — Verify

Use:

`@shopilot-verifier`

Prompt:

> Independently verify the implementation against the approved architecture plan.
>
> Check domain boundaries, tenant isolation, data integrity, lifecycle correctness, and targeted validation.
>
> Do not modify files.

---

# 4. I Found a Bug

Do not immediately ask Copilot to fix the bug.

Use:

`@shopilot-explorer`

Prompt:

> Investigate this bug:
>
> [BUG DESCRIPTION]
>
> Do not modify files.
>
> Trace the actual execution path and identify the root cause.

Then use:

`@shopilot-architect`

Prompt:

> Based on the root cause above, propose the smallest safe fix.
>
> Do not modify files.

Then use:

`@shopilot-implementer`

Prompt:

> Implement only the approved bug fix.
>
> Add or update a regression test where appropriate.
>
> Do not refactor unrelated code.

Then use:

`@shopilot-verifier`

Prompt:

> Verify the bug fix and confirm the original failure path is covered.
>
> Do not modify files.

---

# 5. I Want to Refactor Something

First ask:

`@shopilot-explorer`

> Map the current implementation of [AREA].
>
> Identify duplication, domain ownership, and current dependencies.
>
> Do not modify files.

Then ask:

`@shopilot-architect`

> I want to refactor [AREA].
>
> Based on the exploration above, determine whether a refactor is actually justified.
>
> Propose the smallest safe refactor.
>
> Preserve existing behaviour.
>
> Do not modify files.

Important:

A refactor must not be used as an excuse to redesign unrelated parts of ShopPilot.

---

# 6. I Need a Database Change

Use:

`@shopilot-explorer`

> Map all current usages of [MODEL / FIELD].
>
> Identify API, frontend, lifecycle, historical data, and migration impact.
>
> Do not modify files.

Then:

`@shopilot-architect`

> Design the database change for [CHANGE].
>
> Include migration impact, existing data impact, backfill requirements, and rollback risks.
>
> Do not modify files.

Then:

`@shopilot-implementer`

> Implement the approved database architecture.
>
> Generate the migration if applicable.
>
> Do not claim the migration was applied unless the database command succeeds.
>
> Validate Prisma schema and application compilation.

Important:

Never assume:

> "Schema updated = migration applied."

---

# 7. I Want to Change Pricing or Discounts

Always use the architecture workflow.

Before implementation, explicitly ask:

> Does this belong to PricingService or another domain?

Pricing owns:

- Customer type discounts
- Discount rules
- Manual discounts
- Quote discounts
- Landing price protection
- Price overrides

Check:

- Historical quote snapshots
- Discount snapshots
- Landing price protection
- Approval requirements
- Tenant scope

Do not implement pricing logic in Copilot or the frontend.

---

# 8. I Want to Change Commissions

Always use the architecture workflow.

Explicitly verify:

- Commission basis
- Accrual lifecycle
- Payment lifecycle
- Return reversal
- Settlement lifecycle
- Idempotency

Commission logic belongs to CommissionsModule.

Do not duplicate commission calculation in PricingService.

---

# 9. I Want to Change Copilot

Before changing Copilot, ask:

> Is this a presentation problem or a business decision problem?

If it is a business decision:

→ Put the logic in the appropriate domain.

If it is explanation or formatting:

→ Copilot may own it.

Copilot must not become a second Decision Engine.

For recommendation flows:

DecisionService → Copilot → User

Never:

DecisionService → Copilot ranking → User

---

# 10. I Want to Change Business Home

Business Home should answer:

> What needs my attention this morning?

Before adding a widget, ask:

1. What owner decision does this support?
2. What action can the owner take?
3. Which existing domain owns the data?
4. Can the widget link directly to the action?

Prefer:

- Money to Collect
- Quotes Needing Action
- Stock Alerts
- Business Actions

Avoid:

- Generic module count cards
- Decorative AI widgets
- Dashboard clutter
- Widgets without actions

---

# 11. I Am Not Sure What to Build Next

Do not immediately ask Copilot to code.

Ask:

`@shopilot-explorer`

> Based on the current ShopPilot codebase, identify the three highest-value missing business capabilities that can be implemented without introducing a new AI architecture.
>
> Do not modify files.
>
> Rank them by business value and implementation effort.

Then ask:

`@shopilot-architect`

> Compare these options for ShopPilot.
>
> Recommend one next feature based on business value, existing architecture, and implementation risk.
>
> Do not modify files.

---

# 12. AI Behaviour Rules

The AI must not:

- Scan the entire repository unnecessarily
- Re-read unrelated modules
- Invent business requirements
- Invent product behaviour
- Introduce new architecture for a small feature
- Refactor unrelated code
- Claim validation passed without running it
- Claim migrations were applied without successful execution
- Claim a feature is production-ready based only on compilation

The AI should:

- Prefer existing domain ownership
- Prefer small changes
- Preserve historical data
- Preserve tenant isolation
- Explain architectural decisions
- Identify risks before implementation
- Validate targeted behaviour
- Keep the implementation traceable

---

# 13. Final Rule

The AI is a development partner.

It is not the product owner.

It must not silently decide what ShopPilot should become.

When a business decision is unclear:

> Stop.
>
> Explain the options.
>
> Identify the architectural impact.
>
> Ask for a decision.