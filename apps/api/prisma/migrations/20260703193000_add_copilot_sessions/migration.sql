-- CreateEnum
CREATE TYPE "CopilotMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "CopilotSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopilotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionDbId" TEXT NOT NULL,
    "role" "CopilotMessageRole" NOT NULL,
    "text" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CopilotSession_tenantId_userId_sessionId_key" ON "CopilotSession"("tenantId", "userId", "sessionId");

-- CreateIndex
CREATE INDEX "CopilotSession_tenantId_userId_updatedAt_idx" ON "CopilotSession"("tenantId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "CopilotMessage_tenantId_userId_createdAt_idx" ON "CopilotMessage"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "CopilotMessage_sessionDbId_createdAt_idx" ON "CopilotMessage"("sessionDbId", "createdAt");

-- AddForeignKey
ALTER TABLE "CopilotSession" ADD CONSTRAINT "CopilotSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotSession" ADD CONSTRAINT "CopilotSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotMessage" ADD CONSTRAINT "CopilotMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotMessage" ADD CONSTRAINT "CopilotMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotMessage" ADD CONSTRAINT "CopilotMessage_sessionDbId_fkey" FOREIGN KEY ("sessionDbId") REFERENCES "CopilotSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
