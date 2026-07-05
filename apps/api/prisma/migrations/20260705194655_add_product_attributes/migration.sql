-- CreateEnum
CREATE TYPE "public"."AttributeDataType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT');

-- DropForeignKey
ALTER TABLE "public"."CopilotMessage" DROP CONSTRAINT "CopilotMessage_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "public"."CopilotMessage" DROP CONSTRAINT "CopilotMessage_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."CopilotSession" DROP CONSTRAINT "CopilotSession_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "public"."CopilotSession" DROP CONSTRAINT "CopilotSession_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."WhatsAppMessage" DROP CONSTRAINT "WhatsAppMessage_tenantId_fkey";

-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "gstRate" DECIMAL(5,2),
ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "public"."AttributeDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dataType" "public"."AttributeDataType" NOT NULL,
    "unit" TEXT,
    "allowedValues" JSONB,
    "description" TEXT,
    "appliesToCategoryId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductAttributeValue" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(65,30),
    "valueBoolean" BOOLEAN,
    "valueJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttributeDefinition_tenantId_idx" ON "public"."AttributeDefinition"("tenantId");

-- CreateIndex
CREATE INDEX "AttributeDefinition_code_idx" ON "public"."AttributeDefinition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeDefinition_tenantId_code_key" ON "public"."AttributeDefinition"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_productId_idx" ON "public"."ProductAttributeValue"("productId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_attributeDefinitionId_idx" ON "public"."ProductAttributeValue"("attributeDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttributeValue_productId_attributeDefinitionId_key" ON "public"."ProductAttributeValue"("productId", "attributeDefinitionId");

-- AddForeignKey
ALTER TABLE "public"."ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "public"."AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CopilotSession" ADD CONSTRAINT "CopilotSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CopilotSession" ADD CONSTRAINT "CopilotSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CopilotMessage" ADD CONSTRAINT "CopilotMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CopilotMessage" ADD CONSTRAINT "CopilotMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
