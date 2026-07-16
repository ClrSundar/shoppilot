-- CreateEnum
CREATE TYPE "public"."AppliedTaxType" AS ENUM ('NONE', 'IGST', 'CGST_SGST', 'MIXED');

-- AlterTable
ALTER TABLE "public"."Customer" ADD COLUMN     "billingStateCode" TEXT;

-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "taxClassificationCode" TEXT,
ADD COLUMN     "taxClassificationLabel" TEXT;

-- AlterTable
ALTER TABLE "public"."ProductReturnItem" ADD COLUMN     "appliedTaxType" "public"."AppliedTaxType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sourceTaxSnapshot" JSONB,
ADD COLUMN     "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."Quote" ADD COLUMN     "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "customerBillingStateCode" TEXT,
ADD COLUMN     "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "placeOfSupplyStateCode" TEXT,
ADD COLUMN     "sellerStateCode" TEXT,
ADD COLUMN     "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."QuoteItem" ADD COLUMN     "appliedTaxType" "public"."AppliedTaxType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gstRateApplied" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxClassificationCode" TEXT,
ADD COLUMN     "taxableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."Tenant" ADD COLUMN     "gstConfig" JSONB;
