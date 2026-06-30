-- AlterEnum
ALTER TYPE "public"."InventoryMovementType" ADD VALUE 'DISPATCH';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."QuoteStatus" ADD VALUE 'INVOICED';
ALTER TYPE "public"."QuoteStatus" ADD VALUE 'DISPATCHED';

-- DropForeignKey
ALTER TABLE "public"."WhatsAppConversation" DROP CONSTRAINT "WhatsAppConversation_tenantId_fkey";

-- AddForeignKey
ALTER TABLE "public"."WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
