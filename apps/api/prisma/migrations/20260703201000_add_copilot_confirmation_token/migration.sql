-- Create table for one-time draft confirmation tokens and idempotency tracking
CREATE TABLE "CopilotDraftConfirmation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionDbId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "draftPayload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "idempotencyKey" TEXT,
  "quoteId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CopilotDraftConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CopilotDraftConfirmation_token_key" ON "CopilotDraftConfirmation"("token");
CREATE UNIQUE INDEX "CopilotDraftConfirmation_tenantId_userId_idempotencyKey_key" ON "CopilotDraftConfirmation"("tenantId", "userId", "idempotencyKey");
CREATE INDEX "CopilotDraftConfirmation_tenantId_userId_expiresAt_idx" ON "CopilotDraftConfirmation"("tenantId", "userId", "expiresAt");
CREATE INDEX "CopilotDraftConfirmation_sessionDbId_createdAt_idx" ON "CopilotDraftConfirmation"("sessionDbId", "createdAt");

ALTER TABLE "CopilotDraftConfirmation"
  ADD CONSTRAINT "CopilotDraftConfirmation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CopilotDraftConfirmation"
  ADD CONSTRAINT "CopilotDraftConfirmation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CopilotDraftConfirmation"
  ADD CONSTRAINT "CopilotDraftConfirmation_sessionDbId_fkey"
  FOREIGN KEY ("sessionDbId") REFERENCES "CopilotSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CopilotDraftConfirmation"
  ADD CONSTRAINT "CopilotDraftConfirmation_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
