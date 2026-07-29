/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,quoteId]` on the table `AgentCommissionAccrual` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AgentCommissionAccrual_tenantId_quoteId_key" ON "public"."AgentCommissionAccrual"("tenantId", "quoteId");
