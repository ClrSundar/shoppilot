-- CreateEnum
CREATE TYPE "public"."DecisionRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."RecommendationRunStatus" AS ENUM ('PENDING', 'MATCHED', 'NO_MATCH', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."RecommendationAction" AS ENUM ('ACCEPTED', 'REJECTED', 'PARTIALLY_ACCEPTED', 'IGNORED');

-- CreateTable
CREATE TABLE "public"."DecisionRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."DecisionRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "conditions" JSONB NOT NULL,
    "solutionTemplateId" TEXT,
    "overrideProducts" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecommendationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "customerId" TEXT,
    "copilotSessionId" TEXT,
    "decisionRuleId" TEXT,
    "status" "public"."RecommendationRunStatus" NOT NULL DEFAULT 'PENDING',
    "queryInputs" JSONB NOT NULL,
    "totalCandidates" INTEGER NOT NULL DEFAULT 0,
    "topScore" DECIMAL(5,2),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecommendationCandidate" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "totalScore" DECIMAL(5,2) NOT NULL,
    "scoreStock" DECIMAL(5,2) NOT NULL,
    "scorePriceMatch" DECIMAL(5,2) NOT NULL,
    "scoreAttributeMatch" DECIMAL(5,2) NOT NULL,
    "scorePreference" DECIMAL(5,2) NOT NULL,
    "selectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecommendationFeedback" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "action" "public"."RecommendationAction" NOT NULL,
    "acceptedProductIds" JSONB NOT NULL DEFAULT '[]',
    "rejectedProductIds" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DecisionRule_tenantId_idx" ON "public"."DecisionRule"("tenantId");

-- CreateIndex
CREATE INDEX "DecisionRule_status_idx" ON "public"."DecisionRule"("status");

-- CreateIndex
CREATE INDEX "DecisionRule_active_idx" ON "public"."DecisionRule"("active");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionRule_tenantId_code_version_key" ON "public"."DecisionRule"("tenantId", "code", "version");

-- CreateIndex
CREATE INDEX "RecommendationRun_tenantId_idx" ON "public"."RecommendationRun"("tenantId");

-- CreateIndex
CREATE INDEX "RecommendationRun_tenantId_status_idx" ON "public"."RecommendationRun"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RecommendationRun_tenantId_createdAt_idx" ON "public"."RecommendationRun"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationRun_userId_idx" ON "public"."RecommendationRun"("userId");

-- CreateIndex
CREATE INDEX "RecommendationRun_customerId_idx" ON "public"."RecommendationRun"("customerId");

-- CreateIndex
CREATE INDEX "RecommendationRun_copilotSessionId_idx" ON "public"."RecommendationRun"("copilotSessionId");

-- CreateIndex
CREATE INDEX "RecommendationRun_decisionRuleId_idx" ON "public"."RecommendationRun"("decisionRuleId");

-- CreateIndex
CREATE INDEX "RecommendationCandidate_runId_idx" ON "public"."RecommendationCandidate"("runId");

-- CreateIndex
CREATE INDEX "RecommendationCandidate_productId_idx" ON "public"."RecommendationCandidate"("productId");

-- CreateIndex
CREATE INDEX "RecommendationCandidate_runId_rank_idx" ON "public"."RecommendationCandidate"("runId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationCandidate_runId_productId_key" ON "public"."RecommendationCandidate"("runId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationFeedback_runId_key" ON "public"."RecommendationFeedback"("runId");

-- CreateIndex
CREATE INDEX "RecommendationFeedback_runId_idx" ON "public"."RecommendationFeedback"("runId");

-- CreateIndex
CREATE INDEX "RecommendationFeedback_userId_idx" ON "public"."RecommendationFeedback"("userId");

-- AddForeignKey
ALTER TABLE "public"."RecommendationRun" ADD CONSTRAINT "RecommendationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecommendationRun" ADD CONSTRAINT "RecommendationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecommendationRun" ADD CONSTRAINT "RecommendationRun_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecommendationRun" ADD CONSTRAINT "RecommendationRun_copilotSessionId_fkey" FOREIGN KEY ("copilotSessionId") REFERENCES "public"."CopilotSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecommendationRun" ADD CONSTRAINT "RecommendationRun_decisionRuleId_fkey" FOREIGN KEY ("decisionRuleId") REFERENCES "public"."DecisionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecommendationCandidate" ADD CONSTRAINT "RecommendationCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "public"."RecommendationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecommendationCandidate" ADD CONSTRAINT "RecommendationCandidate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecommendationFeedback" ADD CONSTRAINT "RecommendationFeedback_runId_fkey" FOREIGN KEY ("runId") REFERENCES "public"."RecommendationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecommendationFeedback" ADD CONSTRAINT "RecommendationFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
