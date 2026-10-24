-- CreateTable
CREATE TABLE "LevelTestAttempt" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "questionIds" TEXT[],
    "correctByLevel" JSONB NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadId" TEXT,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "LevelTestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LevelTestAttempt_chatId_createdAt_idx" ON "LevelTestAttempt"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "LevelTestAttempt_leadId_idx" ON "LevelTestAttempt"("leadId");

-- CreateIndex
CREATE INDEX "LevelTestAttempt_companyId_idx" ON "LevelTestAttempt"("companyId");

-- AddForeignKey
ALTER TABLE "LevelTestAttempt" ADD CONSTRAINT "LevelTestAttempt_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelTestAttempt" ADD CONSTRAINT "LevelTestAttempt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
