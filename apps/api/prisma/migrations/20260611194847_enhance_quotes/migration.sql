-- AlterTable
ALTER TABLE "public"."Quote" ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "validUntil" TIMESTAMP(3);
