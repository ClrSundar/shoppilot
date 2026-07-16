-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FIXED_PRICE');

-- CreateEnum
CREATE TYPE "DiscountScope" AS ENUM ('PRODUCT', 'CATEGORY', 'CUSTOMER', 'CUSTOMER_TYPE', 'QUOTE', 'TENANT');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('GROSS_SALES', 'NET_SALES', 'GROSS_MARGIN', 'PRODUCT_MARGIN', 'PAYMENT_RECEIVED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'EARNED', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'REVERSED');

-- AlterEnum
ALTER TYPE "CommissionType" ADD VALUE IF NOT EXISTS 'FIXED_AMOUNT';
ALTER TYPE "CommissionType" ADD VALUE IF NOT EXISTS 'PER_UNIT';
ALTER TYPE "CommissionType" ADD VALUE IF NOT EXISTS 'SLAB';

-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "minimumMarginPercent" DECIMAL(5,2),
ADD COLUMN "allowBelowLandingPrice" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Customer"
ADD COLUMN "customerTypeId" TEXT;

-- AlterTable
ALTER TABLE "Quote"
ADD COLUMN "subtotalBeforeDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "lineDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "orderDiscountType" "DiscountType",
ADD COLUMN "orderDiscountValue" DECIMAL(12,2),
ADD COLUMN "orderDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "QuoteItem"
ADD COLUMN "baseUnitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "discountType" "DiscountType",
ADD COLUMN "discountPercentage" DECIMAL(5,2),
ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "netUnitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "appliedDiscountRuleId" TEXT,
ADD COLUMN "discountReason" TEXT,
ADD COLUMN "discountApprovedById" TEXT;

-- CreateTable
CREATE TABLE "CustomerType" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "defaultDiscountPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "priceListId" TEXT,
  "creditDays" INTEGER,
  "creditLimit" DECIMAL(12,2),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "scope" "DiscountScope" NOT NULL,
  "type" "DiscountType" NOT NULL,
  "percentage" DECIMAL(5,2),
  "amount" DECIMAL(12,2),
  "fixedPrice" DECIMAL(12,2),
  "productId" TEXT,
  "categoryId" TEXT,
  "customerId" TEXT,
  "customerTypeId" TEXT,
  "minQuantity" DECIMAL(12,2),
  "minOrderValue" DECIMAL(12,2),
  "maxDiscountAmount" DECIMAL(12,2),
  "priority" INTEGER NOT NULL DEFAULT 100,
  "stackable" BOOLEAN NOT NULL DEFAULT false,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscountRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceOverrideApproval" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "quoteItemId" TEXT NOT NULL,
  "requestedPrice" DECIMAL(12,2) NOT NULL,
  "minimumAllowedPrice" DECIMAL(12,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceOverrideApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommissionRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "agentId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "CommissionType" NOT NULL,
  "basis" "CommissionBasis" NOT NULL,
  "percentage" DECIMAL(5,2),
  "fixedAmount" DECIMAL(12,2),
  "perUnitAmount" DECIMAL(12,2),
  "productId" TEXT,
  "categoryId" TEXT,
  "minSalesAmount" DECIMAL(12,2),
  "maxSalesAmount" DECIMAL(12,2),
  "priority" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentCommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommissionAccrual" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "quoteId" TEXT,
  "paymentId" TEXT,
  "productReturnId" TEXT,
  "commissionRuleId" TEXT,
  "basisAmount" DECIMAL(12,2) NOT NULL,
  "commissionRate" DECIMAL(5,2),
  "commissionAmount" DECIMAL(12,2) NOT NULL,
  "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
  "earnedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "calculationSnapshot" JSONB NOT NULL,
  "note" TEXT,
  "reversalOfId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentCommissionAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommissionSettlement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "settlementNumber" TEXT NOT NULL,
  "periodFrom" TIMESTAMP(3) NOT NULL,
  "periodTo" TIMESTAMP(3) NOT NULL,
  "totalEarned" DECIMAL(12,2) NOT NULL,
  "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "paidAmount" DECIMAL(12,2) NOT NULL,
  "paymentMode" "PaymentMethod",
  "paymentReference" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentCommissionSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommissionSettlementItem" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "accrualId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "AgentCommissionSettlementItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerType_tenantId_code_key" ON "CustomerType"("tenantId", "code");
CREATE INDEX "CustomerType_tenantId_idx" ON "CustomerType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRule_tenantId_code_key" ON "DiscountRule"("tenantId", "code");
CREATE INDEX "DiscountRule_tenantId_active_idx" ON "DiscountRule"("tenantId", "active");
CREATE INDEX "DiscountRule_productId_idx" ON "DiscountRule"("productId");
CREATE INDEX "DiscountRule_categoryId_idx" ON "DiscountRule"("categoryId");
CREATE INDEX "DiscountRule_customerId_idx" ON "DiscountRule"("customerId");
CREATE INDEX "DiscountRule_customerTypeId_idx" ON "DiscountRule"("customerTypeId");

-- CreateIndex
CREATE INDEX "PriceOverrideApproval_tenantId_quoteId_idx" ON "PriceOverrideApproval"("tenantId", "quoteId");
CREATE INDEX "PriceOverrideApproval_quoteItemId_idx" ON "PriceOverrideApproval"("quoteItemId");
CREATE INDEX "PriceOverrideApproval_status_idx" ON "PriceOverrideApproval"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCommissionRule_tenantId_code_key" ON "AgentCommissionRule"("tenantId", "code");
CREATE INDEX "AgentCommissionRule_tenantId_active_idx" ON "AgentCommissionRule"("tenantId", "active");
CREATE INDEX "AgentCommissionRule_agentId_idx" ON "AgentCommissionRule"("agentId");
CREATE INDEX "AgentCommissionRule_productId_idx" ON "AgentCommissionRule"("productId");
CREATE INDEX "AgentCommissionRule_categoryId_idx" ON "AgentCommissionRule"("categoryId");

-- CreateIndex
CREATE INDEX "AgentCommissionAccrual_tenantId_agentId_idx" ON "AgentCommissionAccrual"("tenantId", "agentId");
CREATE INDEX "AgentCommissionAccrual_quoteId_idx" ON "AgentCommissionAccrual"("quoteId");
CREATE INDEX "AgentCommissionAccrual_paymentId_idx" ON "AgentCommissionAccrual"("paymentId");
CREATE INDEX "AgentCommissionAccrual_productReturnId_idx" ON "AgentCommissionAccrual"("productReturnId");
CREATE INDEX "AgentCommissionAccrual_status_idx" ON "AgentCommissionAccrual"("status");
CREATE INDEX "AgentCommissionAccrual_commissionRuleId_idx" ON "AgentCommissionAccrual"("commissionRuleId");
CREATE INDEX "AgentCommissionAccrual_reversalOfId_idx" ON "AgentCommissionAccrual"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCommissionSettlement_tenantId_settlementNumber_key" ON "AgentCommissionSettlement"("tenantId", "settlementNumber");
CREATE INDEX "AgentCommissionSettlement_tenantId_agentId_idx" ON "AgentCommissionSettlement"("tenantId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCommissionSettlementItem_settlementId_accrualId_key" ON "AgentCommissionSettlementItem"("settlementId", "accrualId");
CREATE INDEX "AgentCommissionSettlementItem_accrualId_idx" ON "AgentCommissionSettlementItem"("accrualId");

-- CreateIndex
CREATE INDEX "Customer_customerTypeId_idx" ON "Customer"("customerTypeId");
CREATE INDEX "QuoteItem_appliedDiscountRuleId_idx" ON "QuoteItem"("appliedDiscountRuleId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_customerTypeId_fkey" FOREIGN KEY ("customerTypeId") REFERENCES "CustomerType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerType" ADD CONSTRAINT "CustomerType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_customerTypeId_fkey" FOREIGN KEY ("customerTypeId") REFERENCES "CustomerType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_appliedDiscountRuleId_fkey" FOREIGN KEY ("appliedDiscountRuleId") REFERENCES "DiscountRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceOverrideApproval" ADD CONSTRAINT "PriceOverrideApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceOverrideApproval" ADD CONSTRAINT "PriceOverrideApproval_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommissionRule" ADD CONSTRAINT "AgentCommissionRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentCommissionRule" ADD CONSTRAINT "AgentCommissionRule_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentCommissionRule" ADD CONSTRAINT "AgentCommissionRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentCommissionRule" ADD CONSTRAINT "AgentCommissionRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommissionAccrual" ADD CONSTRAINT "AgentCommissionAccrual_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentCommissionAccrual" ADD CONSTRAINT "AgentCommissionAccrual_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentCommissionAccrual" ADD CONSTRAINT "AgentCommissionAccrual_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentCommissionAccrual" ADD CONSTRAINT "AgentCommissionAccrual_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentCommissionAccrual" ADD CONSTRAINT "AgentCommissionAccrual_productReturnId_fkey" FOREIGN KEY ("productReturnId") REFERENCES "ProductReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentCommissionAccrual" ADD CONSTRAINT "AgentCommissionAccrual_commissionRuleId_fkey" FOREIGN KEY ("commissionRuleId") REFERENCES "AgentCommissionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentCommissionAccrual" ADD CONSTRAINT "AgentCommissionAccrual_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "AgentCommissionAccrual"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommissionSettlement" ADD CONSTRAINT "AgentCommissionSettlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentCommissionSettlement" ADD CONSTRAINT "AgentCommissionSettlement_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommissionSettlementItem" ADD CONSTRAINT "AgentCommissionSettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "AgentCommissionSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentCommissionSettlementItem" ADD CONSTRAINT "AgentCommissionSettlementItem_accrualId_fkey" FOREIGN KEY ("accrualId") REFERENCES "AgentCommissionAccrual"("id") ON DELETE CASCADE ON UPDATE CASCADE;
