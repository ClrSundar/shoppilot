-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlatformAdminRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT_ADMIN');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "status" "TenantStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Tenant" ADD COLUMN "rejectedReason" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "approvedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "PlatformAdminRole" NOT NULL DEFAULT 'SUPPORT_ADMIN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");
