# ShopPilot AI Development Workflow

## Agent Workflow

ShopPilot development follows this sequence:

Explorer → Architect → Implementer → Verifier

Do not skip stages for non-trivial features.

## 1. Explorer

Use `shopilot-explorer`.

Prompt:

> @shopilot-explorer map the current architecture for [feature]. Do not modify files.

The Explorer is responsible for:

- Finding the relevant domain
- Tracing the existing flow
- Identifying affected files
- Identifying existing rules
- Identifying risks

The Explorer must not design or implement the solution.

## 2. Architect

Use `shopilot-architect`.

Prompt:

> @shopilot-architect using the exploration above, create the implementation plan. Do not modify files.

The Architect is responsible for:

- Choosing the correct domain owner
- Defining the implementation flow
- Identifying the minimum change surface
- Defining non-goals
- Defining acceptance criteria

The Architect must not modify files.

## 3. Implementer

Use `shopilot-implementer`.

Prompt:

> @shopilot-implementer implement only the approved architecture plan.

The Implementer must:

- Follow the approved architecture
- Avoid broad repository exploration
- Avoid unrelated refactoring
- Modify only the approved change surface
- Run targeted validation

The Implementer must not redesign the feature while coding.

## 4. Verifier

Use `shopilot-verifier`.

Prompt:

> @shopilot-verifier independently verify the implementation. Do not modify files.

The Verifier must:

- Review the implementation
- Check architecture boundaries
- Check tenant isolation
- Check data integrity
- Check lifecycle correctness
- Run relevant validation

The Verifier must not modify files.

## Core Rule

Do not ask the Implementer to rediscover the repository.

The Explorer and Architect establish the context.

The Implementer executes the approved plan.

The Verifier independently checks the result.

## Why This Workflow Exists

ShopPilot is now large enough that repeated full-repository exploration wastes AI context and increases the risk of inconsistent architectural decisions.

The workflow deliberately separates:

- Exploration
- Architecture
- Implementation
- Verification