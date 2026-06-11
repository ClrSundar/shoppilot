-- CreateEnum
CREATE TYPE "public"."BusinessType" AS ENUM ('ELECTRICAL', 'PLUMBING', 'MOTOR', 'GENERAL');

-- AlterTable
ALTER TABLE "public"."Tenant" ADD COLUMN     "businessType" "public"."BusinessType" NOT NULL DEFAULT 'GENERAL';
