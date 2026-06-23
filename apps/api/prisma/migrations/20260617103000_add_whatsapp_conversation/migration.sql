-- CreateEnum
CREATE TYPE "WhatsAppIntent" AS ENUM ('NONE', 'ADD_CUSTOMER', 'ADD_CATEGORY', 'ADD_PRODUCT', 'CREATE_QUOTE');

-- CreateTable
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "lastIntent" "WhatsAppIntent" NOT NULL DEFAULT 'NONE',
    "state" JSONB,
    "lastMessage" TEXT,
    "lastResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppConversation_tenantId_senderPhone_idx" ON "WhatsAppConversation"("tenantId", "senderPhone");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConversation_tenantId_senderPhone_key" ON "WhatsAppConversation"("tenantId", "senderPhone");

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
