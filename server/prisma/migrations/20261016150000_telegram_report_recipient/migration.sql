-- Shaxsiy Telegram hisobot oluvchilari (ADR-0095).
DO $$
BEGIN
  CREATE TYPE "TelegramReportLayout" AS ENUM ('BY_SECTION', 'TABLE', 'BY_BRANCH', 'TOTAL_ONLY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "TelegramReportSection" AS ENUM ('TODAY_MONEY', 'STUDENTS', 'LESSONS', 'ACTIVE_STUDENTS', 'DEBT', 'MONTH', 'SALARY', 'ALERTS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TelegramReportRecipient" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "sendTime" TEXT NOT NULL DEFAULT '21:00',
  "layout" "TelegramReportLayout" NOT NULL DEFAULT 'BY_SECTION',
  "allBranches" BOOLEAN NOT NULL DEFAULT false,
  "branchIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  "sections" "TelegramReportSection"[] DEFAULT ARRAY[]::"TelegramReportSection"[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSentDate" DATE,
  "createdById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramReportRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TelegramReportRecipient_companyId_userId_key"
  ON "TelegramReportRecipient"("companyId", "userId");
CREATE INDEX IF NOT EXISTS "TelegramReportRecipient_isActive_sendTime_idx"
  ON "TelegramReportRecipient"("isActive", "sendTime");
