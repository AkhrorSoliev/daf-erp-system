-- AlterTable
ALTER TABLE "CallLog" ADD COLUMN "followUpAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CallLog_companyId_followUpAt_idx" ON "CallLog"("companyId", "followUpAt");
