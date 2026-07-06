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
  SolutionItems,
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
        primaryRecommendation: null,
        alternatives: [],
        solutionItems: { required: [], recommended: [], optional: [] },
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
    _userId: string,
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
        primaryRecommendation: null,
        alternatives: [],
        solutionItems: { required: [], recommended: [], optional: [] },
        candidates: [],
        missingFields,
        reasonCode:
          missingFields.length > 0 ? 'MISSING_REQUIRED_FIELDS' : 'NO_RULE_FOR_INPUT',
        suggestedAction:
          missingFields.length > 0
            ? `Please provide required fields: ${missingFields.join(', ')}.`
            : this.buildNoRuleSuggestedAction(dto.queryInputs),
      };
    }

    const appliedRule: AppliedRule = {
      id: matchedRule.id,
      code: matchedRule.code,
      name: matchedRule.name,
      version: matchedRule.version,
      scope: matchedRule.tenantId ? 'tenant' : 'platform',
    };

    // 2. Expand template and identify the primary category to rank.
    const templateItems = await this.loadTemplateItems(matchedRule.solutionTemplateId);
    const primaryCategoryId = await this.getPrimaryCategoryId(templateItems);

    if (!primaryCategoryId) {
      return {
        recommendationRunId: runId,
        status: 'NO_MATCH',
        appliedRule,
        explanation: `Rule "${matchedRule.code}" matched but no primary product category was found in template.`,
        primaryRecommendation: null,
        alternatives: [],
        solutionItems: { required: [], recommended: [], optional: [] },
        candidates: [],
        missingFields: [],
        reasonCode: 'NO_RULE_FOR_INPUT',
        suggestedAction:
          'Fix template setup: ensure REQUIRED item has a valid primary product category.',
      };
    }

    // 3. Build primary target profile from first REQUIRED primary item.
    const primaryProfile = await this.getPrimaryProfile(
      tenantId,
      templateItems,
      primaryCategoryId,
    );

    // 4. Load all products in the primary category and keep only primary-like alternatives.
    const primaryCandidates = await this.loadPrimaryCandidates(
      tenantId,
      primaryCategoryId,
      primaryProfile,
    );

    if (primaryCandidates.length === 0) {
      return {
        recommendationRunId: runId,
        status: 'NO_MATCH',
        appliedRule,
        explanation:
          'Rule matched but no eligible primary products were found in stock catalog for this tenant.',
        primaryRecommendation: null,
        alternatives: [],
        solutionItems: { required: [], recommended: [], optional: [] },
        candidates: [],
        missingFields: [],
        reasonCode: 'NO_RULE_FOR_INPUT',
        suggestedAction:
          'Add active products in the primary category that match the rule profile (HP/phase).',
      };
    }

    // 5. Rank primary products deterministically.
    const ranked = await this.rankProducts(
      primaryCandidates,
      dto.queryInputs,
      primaryProfile,
    );

    // 6. Persist primary candidates only.
    await this.persistCandidates(runId, ranked);

    // 7. Build grouped solution items separately from primary ranking.
    const solutionItems = await this.buildSolutionItems(
      tenantId,
      ranked[0]?.productId ?? null,
      templateItems,
      primaryCategoryId,
    );

    const selectablePrimary = ranked.find((candidate) => candidate.stockQty > 0) ?? null;

    const primaryRecommendation = selectablePrimary
      ? {
          productId: selectablePrimary.productId,
          productName: selectablePrimary.productName,
          sku: selectablePrimary.sku,
          score: selectablePrimary.scoreBreakdown.total,
          scoreBreakdown: selectablePrimary.scoreBreakdown,
          selectedReason: selectablePrimary.selectedReason,
        }
      : null;

    const alternatives = ranked
      .filter((c) => c.productId !== primaryRecommendation?.productId)
      .map((c) => c.productName);
    const warnings = this.buildWarnings(dto.queryInputs, ranked);

    return {
      recommendationRunId: runId,
      status: 'MATCHED',
      appliedRule,
      explanation: `Rule "${matchedRule.name}" (${appliedRule.scope}) matched. Ranked ${ranked.length} primary product candidate(s), and expanded accessories separately.`,
      primaryRecommendation,
      alternatives,
      solutionItems,
      candidates: ranked,
      warnings,
    };
  }

  // =========================================================================
  // RULE MATCHING
  // =========================================================================

  private async findMatchingRule(
    tenantId: string,
    queryInputs: Record<string, string | number | boolean>,
  ) {
    const tenantRules = await this.prisma.decisionRule.findMany({
      where: {
        status: DecisionRuleStatus.ACTIVE,
        active: true,
        tenantId,
      },
      orderBy: [
        { priority: 'asc' },
        { version: 'desc' },
      ],
    });

    const platformRules = await this.prisma.decisionRule.findMany({
      where: {
        status: DecisionRuleStatus.ACTIVE,
        active: true,
        tenantId: null,
      },
      orderBy: [{ priority: 'asc' }, { version: 'desc' }],
    });

    // Tenant-specific ACTIVE rules override platform ACTIVE rules.
    const rules = [...tenantRules, ...platformRules];

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
    const commonFields = ['boreDepthFt', 'phase'];
    return commonFields.filter((f) => queryInputs[f] === undefined);
  }

  private buildNoRuleSuggestedAction(
    queryInputs: Record<string, string | number | boolean>,
  ): string {
    const depth = queryInputs.boreDepthFt ?? queryInputs.depth;
    const phase = queryInputs.phase;

    if (depth !== undefined && phase !== undefined) {
      return `Create a rule for ${String(phase).toUpperCase()} phase borewell around ${depth} ft.`;
    }

    return 'Create an ACTIVE decision rule that covers this input profile.';
  }

  private buildWarnings(
    queryInputs: Record<string, string | number | boolean>,
    candidates: CandidateResult[],
  ): string[] | undefined {
    const budgetRaw = queryInputs.budget;
    if (budgetRaw === undefined || budgetRaw === null) return undefined;

    const budget = Number(budgetRaw);
    if (!Number.isFinite(budget) || budget <= 0) return undefined;

    const top = candidates[0];
    if (!top) return undefined;

    const warnings: string[] = [
      'Budget comparison is based on the motor price. Final total includes selected accessories.',
    ];

    if (top.sellingPrice > budget) {
      warnings.unshift(
        `Recommended products exceed the provided budget of Rs ${budget.toLocaleString('en-IN')}.`,
      );
    }

    return warnings;
  }

  // =========================================================================
  // TEMPLATE AND PRIMARY EXTRACTION
  // =========================================================================

  private async loadTemplateItems(
    solutionTemplateId: string | null,
  ) {
    if (!solutionTemplateId) return [];

    return this.prisma.solutionTemplateItem.findMany({
      where: { solutionTemplateId },
      orderBy: [{ requirementType: 'asc' }, { priority: 'asc' }],
    });
  }

  private async getPrimaryCategoryId(
    items: Awaited<ReturnType<typeof this.loadTemplateItems>>,
  ): Promise<string | null> {
    const requiredProductIds = items
      .filter((i) => i.requirementType === RequirementType.REQUIRED && i.productId)
      .map((i) => i.productId as string);

    if (requiredProductIds.length === 0) return null;

    const primaryProduct = await this.prisma.product.findFirst({
      where: { id: { in: requiredProductIds } },
      select: { categoryId: true },
    });

    return primaryProduct?.categoryId ?? null;
  }

  private async getPrimaryProfile(
    tenantId: string,
    items: Awaited<ReturnType<typeof this.loadTemplateItems>>,
    primaryCategoryId: string,
  ): Promise<Record<string, string | number>> {
    const requiredProductIds = items
      .filter((i) => i.requirementType === RequirementType.REQUIRED && i.productId)
      .map((i) => i.productId as string);

    const primarySeed = await this.prisma.product.findFirst({
      where: {
        tenantId,
        categoryId: primaryCategoryId,
        id: { in: requiredProductIds },
      },
      include: {
        attributeValues: {
          include: { attributeDefinition: true },
        },
      },
    });

    if (!primarySeed) return {};

    const profile: Record<string, string | number> = {};
    for (const av of primarySeed.attributeValues) {
      const code = av.attributeDefinition.code;
      if (av.valueNumber !== null) profile[code] = Number(av.valueNumber);
      else if (av.valueText !== null) profile[code] = av.valueText;
      else if (av.valueBoolean !== null) profile[code] = av.valueBoolean ? 1 : 0;
    }

    return profile;
  }

  // =========================================================================
  // PRIMARY CANDIDATE LOADING
  // =========================================================================

  private async loadPrimaryCandidates(
    tenantId: string,
    primaryCategoryId: string,
    primaryProfile: Record<string, string | number>,
  ) {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        categoryId: primaryCategoryId,
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

    const expectedHp = primaryProfile.HP;
    const expectedPhase = primaryProfile.PHASE;

    // Keep alternatives in same primary category and same primary profile bucket.
    return products.filter((p) => {
      const map = this.getAttributeMap(p.attributeValues);
      const hpOk =
        expectedHp === undefined ||
        (map.HP !== undefined && Number(map.HP) === Number(expectedHp));
      const phaseOk =
        expectedPhase === undefined ||
        (map.PHASE !== undefined &&
          String(map.PHASE).toUpperCase() === String(expectedPhase).toUpperCase());

      return hpOk && phaseOk;
    });
  }

  private getAttributeMap(
    attributeValues: Array<{
      valueText: string | null;
      valueNumber: Prisma.Decimal | null;
      valueBoolean: boolean | null;
      attributeDefinition: { code: string };
    }>,
  ): Record<string, string | number | boolean> {
    const map: Record<string, string | number | boolean> = {};
    for (const av of attributeValues) {
      if (av.valueNumber !== null) map[av.attributeDefinition.code] = Number(av.valueNumber);
      else if (av.valueText !== null) map[av.attributeDefinition.code] = av.valueText;
      else if (av.valueBoolean !== null) map[av.attributeDefinition.code] = av.valueBoolean;
    }
    return map;
  }

  // =========================================================================
  // SOLUTION ITEMS
  // =========================================================================

  private async buildSolutionItems(
    tenantId: string,
    primaryProductId: string | null,
    templateItems: Awaited<ReturnType<typeof this.loadTemplateItems>>,
    primaryCategoryId: string,
  ): Promise<SolutionItems> {
    const required = new Set<string>();
    const recommended = new Set<string>();
    const optional = new Set<string>();

    const productIds = templateItems
      .filter((item) => item.productId)
      .map((item) => item.productId as string);

    const templateProducts = await this.prisma.product.findMany({
      where: {
        tenantId,
        id: { in: productIds },
      },
      select: {
        id: true,
        name: true,
        categoryId: true,
      },
    });

    const productMap = new Map(templateProducts.map((p) => [p.id, p]));

    for (const item of templateItems) {
      if (!item.productId) continue;
      const product = productMap.get(item.productId);
      if (!product) continue;

      // Exclude primary products from accessory list.
      if (product.categoryId === primaryCategoryId) continue;

      if (item.requirementType === RequirementType.REQUIRED) {
        required.add(product.name);
      } else if (item.requirementType === RequirementType.RECOMMENDED) {
        recommended.add(product.name);
      } else {
        optional.add(product.name);
      }
    }

    // Add compatibility-based extras from chosen primary recommendation.
    if (primaryProductId) {
      const links = await this.prisma.productCompatibility.findMany({
        where: {
          tenantId,
          sourceProductId: primaryProductId,
          active: true,
        },
        include: {
          target: true,
        },
      });

      for (const link of links) {
        if (link.target.categoryId === primaryCategoryId) continue;

        if (link.relationType === 'REQUIRED_WITH') {
          required.add(link.target.name);
        } else if (link.relationType === 'RECOMMENDED_WITH') {
          recommended.add(link.target.name);
        }
      }
    }

    return {
      required: Array.from(required),
      recommended: Array.from(recommended),
      optional: Array.from(optional),
    };
  }

  // =========================================================================
  // DETERMINISTIC RANKING
  // =========================================================================

  private rankProducts(
    products: Awaited<ReturnType<typeof this.loadPrimaryCandidates>>,
    queryInputs: Record<string, string | number | boolean>,
    primaryProfile: Record<string, string | number>,
  ): CandidateResult[] {
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
        attributeMatch: this.scoreAttributeMatch(
          this.getAttributeMap(product.attributeValues),
          queryInputs,
          primaryProfile,
        ),
        stock: this.scoreStock(stockQty),
        price: this.scorePrice(Number(product.sellingPrice), medianPrice, queryInputs),
        compatibility: this.scoreCompatibility(product.sourceCompatibilities),
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
      const aInStock = a.stockQty > 0 ? 1 : 0;
      const bInStock = b.stockQty > 0 ? 1 : 0;
      if (bInStock !== aInStock) {
        return bInStock - aInStock;
      }
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
    productAttributes: Record<string, string | number | boolean>,
    queryInputs: Record<string, string | number | boolean>,
    primaryProfile: Record<string, string | number>,
  ): number {
    let score = 0;

    // HP alignment to rule's primary profile (strong signal)
    if (
      primaryProfile.HP !== undefined &&
      productAttributes.HP !== undefined &&
      Number(primaryProfile.HP) === Number(productAttributes.HP)
    ) {
      score += 16;
    }

    // PHASE exact match against query
    const queryPhase = queryInputs.phase;
    if (
      queryPhase !== undefined &&
      productAttributes.PHASE !== undefined &&
      String(productAttributes.PHASE).toUpperCase() === String(queryPhase).toUpperCase()
    ) {
      score += 12;
    }

    // HEAD proximity against bore depth query
    const boreDepthFt = Number(queryInputs.boreDepthFt ?? queryInputs.depth ?? NaN);
    const head = productAttributes.HEAD !== undefined ? Number(productAttributes.HEAD) : NaN;
    if (!Number.isNaN(boreDepthFt) && !Number.isNaN(head)) {
      const diff = Math.abs(head - boreDepthFt);
      if (diff <= 20) score += 12;
      else if (diff <= 40) score += 10;
      else if (diff <= 60) score += 7;
      else if (diff <= 100) score += 4;
    }

    return Math.min(score, WEIGHT_ATTRIBUTE);
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
  ): number {
    if (sourceCompatibilities.length === 0) return 0;

    const requiredLinks = sourceCompatibilities.filter(
      (c) => c.relationType === 'REQUIRED_WITH',
    ).length;
    const recommendedLinks = sourceCompatibilities.filter(
      (c) => c.relationType === 'RECOMMENDED_WITH',
    ).length;

    const score = requiredLinks * 6 + recommendedLinks * 4;
    return Math.min(score, WEIGHT_COMPATIBILITY);
  }

  private buildSelectedReason(
    breakdown: ScoreBreakdown,
    _stockQty: number,
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
