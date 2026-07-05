import { Injectable, Logger } from '@nestjs/common';
import {
  DecisionRuleStatus,
  RecommendationRunStatus,
  RequirementType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { RecommendSolutionDto } from './dto/recommend-solution.dto';
import type {
  RecommendSolutionResponse,
  CandidateResult,
  ScoreBreakdown,
  AppliedRule,
} from './dto/recommend-solution-response.type';

// ---------------------------------------------------------------------------
// Scoring weights (must sum to 100)
// ---------------------------------------------------------------------------
const WEIGHT_ATTRIBUTE = 40;
const WEIGHT_STOCK = 30;
const WEIGHT_PRICE = 20;
const WEIGHT_COMPATIBILITY = 10;

@Injectable()
export class DecisionService {
  private readonly logger = new Logger(DecisionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // PUBLIC ENTRY POINT
  // =========================================================================

  async recommendSolution(
    tenantId: string,
    userId: string,
    dto: RecommendSolutionDto,
  ): Promise<RecommendSolutionResponse> {
    // Create the run record immediately so we always have an audit trail
    const run = await this.prisma.recommendationRun.create({
      data: {
        tenantId,
        userId,
        customerId: dto.customerId ?? null,
        copilotSessionId: dto.copilotSessionId ?? null,
        queryInputs: dto.queryInputs as Prisma.InputJsonValue,
        status: RecommendationRunStatus.PENDING,
      },
    });

    try {
      const result = await this.executeDecision(tenantId, userId, dto, run.id);

      // Update run with final status + top score
      const topScore = result.candidates[0]?.scoreBreakdown.total ?? null;
      await this.prisma.recommendationRun.update({
        where: { id: run.id },
        data: {
          status: result.status as RecommendationRunStatus,
          totalCandidates: result.candidates.length,
          topScore: topScore !== null ? new Prisma.Decimal(topScore) : null,
          decisionRuleId: result.appliedRule?.id ?? null,
          errorMessage: result.errorMessage ?? null,
        },
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Decision run ${run.id} failed: ${message}`, err);

      await this.prisma.recommendationRun.update({
        where: { id: run.id },
        data: {
          status: RecommendationRunStatus.ERROR,
          errorMessage: message,
        },
      });

      return {
        recommendationRunId: run.id,
        status: 'ERROR',
        appliedRule: null,
        explanation: 'An unexpected error occurred while evaluating your request.',
        selectedProducts: [],
        candidates: [],
        errorMessage: message,
      };
    }
  }

  // =========================================================================
  // CORE DECISION LOGIC
  // =========================================================================

  private async executeDecision(
    tenantId: string,
    userId: string,
    dto: RecommendSolutionDto,
    runId: string,
  ): Promise<RecommendSolutionResponse> {
    // 1. Find matching rule using priority:
    //    tenant-specific ACTIVE > platform ACTIVE > priority asc > version desc
    const matchedRule = await this.findMatchingRule(tenantId, dto.queryInputs);

    if (!matchedRule) {
      const missingFields = this.inferMissingFields(dto.queryInputs);
      await this.prisma.recommendationRun.update({
        where: { id: runId },
        data: { status: RecommendationRunStatus.NO_MATCH },
      });

      return {
        recommendationRunId: runId,
        status: 'NO_MATCH',
        appliedRule: null,
        explanation: `No active rule matched the provided inputs.`,
        selectedProducts: [],
        candidates: [],
        missingFields,
      };
    }

    const appliedRule: AppliedRule = {
      id: matchedRule.id,
      code: matchedRule.code,
      name: matchedRule.name,
      version: matchedRule.version,
      scope: matchedRule.tenantId ? 'tenant' : 'platform',
    };

    // 2. Expand the solution template into a product list to evaluate
    const productIds = await this.expandTemplate(
      tenantId,
      matchedRule.solutionTemplateId,
    );

    if (productIds.length === 0) {
      return {
        recommendationRunId: runId,
        status: 'NO_MATCH',
        appliedRule,
        explanation: `Rule "${matchedRule.code}" matched but its solution template has no products.`,
        selectedProducts: [],
        candidates: [],
        missingFields: [],
      };
    }

    // 3. Load products with stock
    const products = await this.loadProductsWithStock(tenantId, productIds);

    // 4. Rank deterministically
    const ranked = await this.rankProducts(
      tenantId,
      products,
      dto.queryInputs,
      productIds,
    );

    // 5. Persist candidates
    await this.persistCandidates(runId, ranked);

    // The "selected" products are REQUIRED items from the template at the top ranks
    const requiredIds = await this.getRequiredProductIds(
      matchedRule.solutionTemplateId,
    );
    const selectedProducts = ranked.filter((c) =>
      requiredIds.includes(c.productId),
    );

    return {
      recommendationRunId: runId,
      status: 'MATCHED',
      appliedRule,
      explanation: `Rule "${matchedRule.name}" (${appliedRule.scope}) matched. ${ranked.length} candidate(s) ranked deterministically.`,
      selectedProducts,
      candidates: ranked,
    };
  }

  // =========================================================================
  // RULE MATCHING
  // =========================================================================

  private async findMatchingRule(
    tenantId: string,
    queryInputs: Record<string, string | number | boolean>,
  ) {
    // Fetch all ACTIVE rules for this tenant + platform rules
    const rules = await this.prisma.decisionRule.findMany({
      where: {
        status: DecisionRuleStatus.ACTIVE,
        active: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
      orderBy: [
        // Tenant-specific first (null tenantId comes last)
        { tenantId: 'asc' },
        // Then by explicit priority (lower number = higher priority)
        { priority: 'asc' },
        // Then by latest version
        { version: 'desc' },
      ],
    });

    // Evaluate each rule's conditions JSON against the query inputs
    for (const rule of rules) {
      if (this.evaluateConditions(rule.conditions, queryInputs)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Evaluate a conditions object against query inputs.
   *
   * Supported condition shapes per field:
   *   - Exact match:       { "phase": "SINGLE" }
   *   - Range:             { "depth": { "min": 300, "max": 350 } }
   *   - Min only:          { "depth": { "min": 300 } }
   *   - Max only:          { "depth": { "max": 500 } }
   *   - Array (any-of):    { "phase": ["SINGLE", "THREE"] }
   */
  private evaluateConditions(
    conditions: unknown,
    queryInputs: Record<string, string | number | boolean>,
  ): boolean {
    if (!conditions || typeof conditions !== 'object') return false;

    const conds = conditions as Record<string, unknown>;

    for (const [field, expected] of Object.entries(conds)) {
      const actual = queryInputs[field];
      if (actual === undefined || actual === null) return false;

      if (
        typeof expected === 'object' &&
        expected !== null &&
        !Array.isArray(expected)
      ) {
        // Range condition
        const range = expected as { min?: number; max?: number };
        const numActual = Number(actual);
        if (isNaN(numActual)) return false;
        if (range.min !== undefined && numActual < range.min) return false;
        if (range.max !== undefined && numActual > range.max) return false;
      } else if (Array.isArray(expected)) {
        // Any-of condition
        if (!expected.includes(actual)) return false;
      } else {
        // Exact match
        if (actual !== expected) return false;
      }
    }

    return true;
  }

  private inferMissingFields(
    queryInputs: Record<string, string | number | boolean>,
  ): string[] {
    // Common expected fields for motor/borewell decision engine
    const commonFields = ['depth', 'phase'];
    return commonFields.filter((f) => queryInputs[f] === undefined);
  }

  // =========================================================================
  // TEMPLATE EXPANSION
  // =========================================================================

  private async expandTemplate(
    tenantId: string,
    solutionTemplateId: string | null,
  ): Promise<string[]> {
    if (!solutionTemplateId) return [];

    const items = await this.prisma.solutionTemplateItem.findMany({
      where: { solutionTemplateId },
      orderBy: [{ requirementType: 'asc' }, { priority: 'asc' }],
    });

    // Collect unique productIds that are directly specified
    const productIds = new Set<string>();
    for (const item of items) {
      if (item.productId) productIds.add(item.productId);
    }

    return Array.from(productIds);
  }

  private async getRequiredProductIds(
    solutionTemplateId: string | null,
  ): Promise<string[]> {
    if (!solutionTemplateId) return [];

    const items = await this.prisma.solutionTemplateItem.findMany({
      where: {
        solutionTemplateId,
        requirementType: RequirementType.REQUIRED,
      },
    });

    return items.filter((i) => i.productId).map((i) => i.productId as string);
  }

  // =========================================================================
  // PRODUCT LOADING
  // =========================================================================

  private async loadProductsWithStock(
    tenantId: string,
    productIds: string[],
  ) {
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        tenantId,
        active: true,
      },
      include: {
        inventoryStocks: {
          where: { tenantId },
          take: 1,
        },
        attributeValues: {
          include: { attributeDefinition: true },
        },
        sourceCompatibilities: {
          where: { tenantId, active: true },
        },
      },
    });

    return products;
  }

  // =========================================================================
  // DETERMINISTIC RANKING
  // =========================================================================

  private async rankProducts(
    tenantId: string,
    products: Awaited<ReturnType<typeof this.loadProductsWithStock>>,
    queryInputs: Record<string, string | number | boolean>,
    templateProductIds: string[],
  ): Promise<CandidateResult[]> {
    // Compute price reference for price scoring (median of template products)
    const prices = products
      .map((p) => Number(p.sellingPrice))
      .filter((p) => p > 0)
      .sort((a, b) => a - b);
    const medianPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;

    const scored: CandidateResult[] = products.map((product) => {
      const stockQty = product.inventoryStocks[0]
        ? Number(product.inventoryStocks[0].onHand)
        : 0;

      const breakdown: ScoreBreakdown = {
        attributeMatch: this.scoreAttributeMatch(product.attributeValues, queryInputs),
        stock: this.scoreStock(stockQty),
        price: this.scorePrice(Number(product.sellingPrice), medianPrice, queryInputs),
        compatibility: this.scoreCompatibility(product.sourceCompatibilities, templateProductIds),
        total: 0,
      };

      breakdown.total =
        breakdown.attributeMatch +
        breakdown.stock +
        breakdown.price +
        breakdown.compatibility;

      return {
        rank: 0, // assigned after sorting
        productId: product.id,
        productName: product.name,
        sku: product.sku ?? '',
        sellingPrice: Number(product.sellingPrice),
        stockQty,
        scoreBreakdown: breakdown,
        selectedReason: this.buildSelectedReason(breakdown, stockQty, queryInputs),
      };
    });

    // Sort: higher total score first; break ties by product name (alphabetical = deterministic)
    scored.sort((a, b) => {
      if (b.scoreBreakdown.total !== a.scoreBreakdown.total) {
        return b.scoreBreakdown.total - a.scoreBreakdown.total;
      }
      return a.productName.localeCompare(b.productName);
    });

    // Assign ranks after stable sort
    scored.forEach((c, i) => {
      c.rank = i + 1;
    });

    return scored;
  }

  // -------------------------------------------------------------------------
  // Individual scoring functions — pure, deterministic
  // -------------------------------------------------------------------------

  /**
   * attributeMatchScore (0–40)
   * Compare attribute values on the product to the query inputs.
   * Each matching attribute earns a proportional share of 40 pts.
   */
  private scoreAttributeMatch(
    attributeValues: Array<{
      valueText: string | null;
      valueNumber: Prisma.Decimal | null;
      valueBoolean: boolean | null;
      attributeDefinition: { code: string };
    }>,
    queryInputs: Record<string, string | number | boolean>,
  ): number {
    const queryKeys = Object.keys(queryInputs);
    if (queryKeys.length === 0) return 0;

    let matched = 0;
    for (const av of attributeValues) {
      const code = av.attributeDefinition.code.toLowerCase();
      const queryVal = queryInputs[code] ?? queryInputs[av.attributeDefinition.code];
      if (queryVal === undefined) continue;

      const productVal =
        av.valueText ?? (av.valueNumber !== null ? Number(av.valueNumber) : null) ?? av.valueBoolean;

      if (productVal !== null && productVal !== undefined) {
        if (typeof queryVal === 'number' && typeof productVal === 'number') {
          // For numeric attributes in query, allow ±10% tolerance
          const ratio = productVal / queryVal;
          if (ratio >= 0.9 && ratio <= 1.1) matched++;
        } else if (String(productVal).toLowerCase() === String(queryVal).toLowerCase()) {
          matched++;
        }
      }
    }

    // Normalise to 0–40
    const matchable = Math.min(queryKeys.length, attributeValues.length);
    if (matchable === 0) return 0;
    return Math.round((matched / matchable) * WEIGHT_ATTRIBUTE);
  }

  /**
   * stockScore (0–30)
   * > 10 in stock: full 30 pts
   * 1–10: proportional
   * 0: 0 pts
   */
  private scoreStock(stockQty: number): number {
    if (stockQty <= 0) return 0;
    if (stockQty >= 10) return WEIGHT_STOCK;
    return Math.round((stockQty / 10) * WEIGHT_STOCK);
  }

  /**
   * priceScore (0–20)
   * Budget match: if queryInputs.budget is provided, how close is the price?
   * If no budget: award full 20 to products priced at or below median.
   */
  private scorePrice(
    productPrice: number,
    medianPrice: number,
    queryInputs: Record<string, string | number | boolean>,
  ): number {
    const budget = queryInputs['budget'] ? Number(queryInputs['budget']) : null;

    if (budget !== null && budget > 0) {
      if (productPrice <= budget) {
        // Within budget: score based on how much headroom there is (closer to budget = better value signal)
        const ratio = productPrice / budget;
        if (ratio <= 1.0) return Math.round((1 - (1 - ratio) * 0.5) * WEIGHT_PRICE);
      }
      // Over budget: 0
      return 0;
    }

    // No budget: products at or below median price get full points
    if (medianPrice === 0) return WEIGHT_PRICE;
    if (productPrice <= medianPrice) return WEIGHT_PRICE;
    // Above median: proportional decay
    const excess = (productPrice - medianPrice) / medianPrice;
    return Math.max(0, Math.round((1 - Math.min(excess, 1)) * WEIGHT_PRICE));
  }

  /**
   * compatibilityScore (0–10)
   * Products that have REQUIRED_WITH or RECOMMENDED_WITH relationships
   * to other products in the template earn points.
   */
  private scoreCompatibility(
    sourceCompatibilities: Array<{ targetProductId: string; relationType: string }>,
    templateProductIds: string[],
  ): number {
    if (sourceCompatibilities.length === 0) return 0;

    const linkedToTemplate = sourceCompatibilities.filter((c) =>
      templateProductIds.includes(c.targetProductId),
    );

    if (linkedToTemplate.length === 0) return 0;

    const requiredLinks = linkedToTemplate.filter(
      (c) => c.relationType === 'REQUIRED_WITH',
    ).length;
    const recommendedLinks = linkedToTemplate.filter(
      (c) => c.relationType === 'RECOMMENDED_WITH',
    ).length;

    const score = requiredLinks * 6 + recommendedLinks * 4;
    return Math.min(score, WEIGHT_COMPATIBILITY);
  }

  private buildSelectedReason(
    breakdown: ScoreBreakdown,
    stockQty: number,
    queryInputs: Record<string, string | number | boolean>,
  ): string {
    const parts: string[] = [];

    if (breakdown.attributeMatch >= WEIGHT_ATTRIBUTE * 0.8) {
      parts.push('strong attribute match');
    } else if (breakdown.attributeMatch > 0) {
      parts.push('partial attribute match');
    }

    if (breakdown.stock === WEIGHT_STOCK) {
      parts.push('good stock availability');
    } else if (breakdown.stock === 0) {
      parts.push('out of stock');
    }

    if (queryInputs['budget'] && breakdown.price === WEIGHT_PRICE) {
      parts.push('within budget');
    } else if (queryInputs['budget'] && breakdown.price === 0) {
      parts.push('exceeds budget');
    }

    if (breakdown.compatibility > 0) {
      parts.push('compatible with other items in solution');
    }

    return parts.length > 0
      ? `Ranked by: ${parts.join(', ')}.`
      : `Total score: ${breakdown.total}.`;
  }

  // =========================================================================
  // PERSIST CANDIDATES
  // =========================================================================

  private async persistCandidates(
    runId: string,
    candidates: CandidateResult[],
  ): Promise<void> {
    if (candidates.length === 0) return;

    await this.prisma.recommendationCandidate.createMany({
      data: candidates.map((c) => ({
        runId,
        productId: c.productId,
        rank: c.rank,
        totalScore: new Prisma.Decimal(c.scoreBreakdown.total),
        scoreStock: new Prisma.Decimal(c.scoreBreakdown.stock),
        scorePriceMatch: new Prisma.Decimal(c.scoreBreakdown.price),
        scoreAttributeMatch: new Prisma.Decimal(c.scoreBreakdown.attributeMatch),
        scorePreference: new Prisma.Decimal(c.scoreBreakdown.compatibility),
        selectedReason: c.selectedReason,
      })),
      skipDuplicates: true,
    });
  }
}
