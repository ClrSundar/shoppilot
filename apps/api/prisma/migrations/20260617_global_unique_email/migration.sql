-- DropIndex
DROP INDEX "User_tenantId_email_key";

-- AlterTable
ALTER TABLE "User" ADD CONSTRAINT "User_email_key" UNIQUE ("email");
