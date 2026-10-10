-- Topshiriqlar 2-bosqich, Telegram (ADR-0078; spec 2026-10-07 §6, §9.3).
-- TaskOutbox also holds Telegram notices waiting for 08:00 or a retry (NOTICE +
-- payload); one person may have several of one task, so the unique key becomes
-- a plain index. TaskTelegramMessage maps a bot message to its task for replies.
-- The time rows (REMINDER, OVERDUE) stay one per person: a partial unique index
-- keeps that, and `createMany({ skipDuplicates })` relies on it. Prisma cannot
-- express a partial index, so it is written by hand below; it names only the
-- OLD enum values, because the new 'NOTICE' cannot be used in the transaction
-- that adds it.
-- The new value 'NOTICE' is not used in this migration, so `ALTER TYPE … ADD
-- VALUE` inside the migration's transaction is safe (PostgreSQL 12+; same as
-- 20261007120000). Hand-checked; produced with a schema-to-schema diff, the
-- dev database is behind main.

-- CreateEnum
CREATE TYPE "TaskTelegramPurpose" AS ENUM ('NOTICE', 'RETURN_PROMPT', 'PHOTO_PROMPT');

-- AlterEnum
ALTER TYPE "TaskOutboxKind" ADD VALUE 'NOTICE';

-- DropIndex
DROP INDEX "TaskOutbox_taskId_userId_channel_kind_key";

-- AlterTable
ALTER TABLE "TaskOutbox" ADD COLUMN     "payload" JSONB;

-- CreateTable
CREATE TABLE "TaskTelegramMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "purpose" "TaskTelegramPurpose" NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskTelegramMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskTelegramMessage_taskId_idx" ON "TaskTelegramMessage"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTelegramMessage_chatId_messageId_key" ON "TaskTelegramMessage"("chatId", "messageId");

-- CreateIndex
CREATE INDEX "TaskOutbox_taskId_userId_idx" ON "TaskOutbox"("taskId", "userId");

-- CreateIndex (hand-written: a partial unique index, not in schema.prisma)
CREATE UNIQUE INDEX "TaskOutbox_time_row_key" ON "TaskOutbox"("taskId", "userId", "channel", "kind") WHERE "kind" IN ('REMINDER', 'OVERDUE');

-- AddForeignKey
ALTER TABLE "TaskTelegramMessage" ADD CONSTRAINT "TaskTelegramMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
