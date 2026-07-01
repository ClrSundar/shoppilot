-- CreateEnum
CREATE TYPE "public"."CommissionType" AS ENUM ('PERCENTAGE');

-- CreateTable
CREATE TABLE "public"."Agent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "referenceCode" TEXT,
    "defaultCommissionType" "public"."CommissionType" NOT NULL DEFAULT 'PERCENTAGE',
    "defaultCommissionPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "public"."Quote"
ADD COLUMN "agentId" TEXT,
ADD COLUMN "agentCommissionType" "public"."CommissionType" NOT NULL DEFAULT 'PERCENTAGE',
ADD COLUMN "agentCommissionPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "agentCommissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Agent_tenantId_idx" ON "public"."Agent"("tenantId");

-- CreateIndex
CREATE INDEX "Agent_name_idx" ON "public"."Agent"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_tenantId_referenceCode_key" ON "public"."Agent"("tenantId", "referenceCode");

-- CreateIndex
CREATE INDEX "Quote_agentId_idx" ON "public"."Quote"("agentId");

-- AddForeignKey
ALTER TABLE "public"."Agent" ADD CONSTRAINT "Agent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Quote" ADD CONSTRAINT "Quote_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "public"."Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
