-- AlterTable
ALTER TABLE "public"."Quote" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "recommendationRunId" TEXT;

-- CreateIndex
CREATE INDEX "Quote_recommendationRunId_idx" ON "public"."Quote"("recommendationRunId");

-- AddForeignKey
ALTER TABLE "public"."Quote" ADD CONSTRAINT "Quote_recommendationRunId_fkey" FOREIGN KEY ("recommendationRunId") REFERENCES "public"."RecommendationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
