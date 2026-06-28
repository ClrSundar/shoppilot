-- DropConstraint
ALTER TABLE "public"."User" DROP CONSTRAINT "User_email_key";

-- CreateIndex (compound unique for tenant-scoped emails)
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "public"."User"("tenantId", "email");
