-- CreateEnum
CREATE TYPE "public"."CompatibilityRelationType" AS ENUM ('REQUIRED_WITH', 'RECOMMENDED_WITH', 'ALTERNATIVE_TO', 'INCOMPATIBLE_WITH');

-- CreateEnum
CREATE TYPE "public"."RequirementType" AS ENUM ('REQUIRED', 'RECOMMENDED', 'OPTIONAL');

-- CreateTable
CREATE TABLE "public"."ProductCompatibility" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "sourceProductId" TEXT NOT NULL,
    "targetProductId" TEXT NOT NULL,
    "relationType" "public"."CompatibilityRelationType" NOT NULL,
    "reason" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCompatibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SolutionTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "purpose" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolutionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SolutionTemplateItem" (
    "id" TEXT NOT NULL,
    "solutionTemplateId" TEXT NOT NULL,
    "productCategoryId" TEXT,
    "productId" TEXT,
    "requirementType" "public"."RequirementType" NOT NULL,
    "defaultQuantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "reason" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolutionTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCompatibility_sourceProductId_idx" ON "public"."ProductCompatibility"("sourceProductId");

-- CreateIndex
CREATE INDEX "ProductCompatibility_targetProductId_idx" ON "public"."ProductCompatibility"("targetProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCompatibility_tenantId_sourceProductId_targetProduct_key" ON "public"."ProductCompatibility"("tenantId", "sourceProductId", "targetProductId", "relationType");

-- CreateIndex
CREATE INDEX "SolutionTemplate_tenantId_idx" ON "public"."SolutionTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SolutionTemplate_tenantId_code_key" ON "public"."SolutionTemplate"("tenantId", "code");

-- CreateIndex
CREATE INDEX "SolutionTemplateItem_solutionTemplateId_idx" ON "public"."SolutionTemplateItem"("solutionTemplateId");

-- CreateIndex
CREATE INDEX "SolutionTemplateItem_productId_idx" ON "public"."SolutionTemplateItem"("productId");

-- AddForeignKey
ALTER TABLE "public"."ProductCompatibility" ADD CONSTRAINT "ProductCompatibility_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductCompatibility" ADD CONSTRAINT "ProductCompatibility_targetProductId_fkey" FOREIGN KEY ("targetProductId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SolutionTemplateItem" ADD CONSTRAINT "SolutionTemplateItem_solutionTemplateId_fkey" FOREIGN KEY ("solutionTemplateId") REFERENCES "public"."SolutionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
