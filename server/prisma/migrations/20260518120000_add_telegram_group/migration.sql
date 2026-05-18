-- Telegram admin/management bot group registry.
--
-- Each row links a Telegram group chat to a Company so the admin bot can
-- broadcast events, daily reports, and feature announcements to that chat.
--
-- Lifecycle:
--   1. Bot is added to a Telegram group → bot.on('my_chat_member') inserts a
--      row with status=PENDING, companyId=NULL, addedByTelegramUserId=who_added.
--   2. A CEO/BD in the admin panel reviews the pending list and approves the
--      row → status=APPROVED, companyId/branchId/approvedById/approvedAt set.
--   3. Slash commands in the group only work for APPROVED rows. PENDING and
--      REJECTED groups receive a brief "not approved yet" message.
--
-- chatId is BIGINT because Telegram group chat IDs are large negative integers
-- (e.g. -1001234567890) that overflow INT4.
--
-- branchId is optional — a NULL branchId means the group sees company-wide data.
--
-- lastDailyReportAt is the cron idempotency marker — the 09:00 Tashkent daily
-- job skips groups whose lastDailyReportAt already falls on today's Tashkent date.

CREATE TYPE "TelegramGroupStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "TelegramGroup" (
    "id" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TelegramGroupStatus" NOT NULL DEFAULT 'PENDING',
    "addedByTelegramUserId" BIGINT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" INTEGER,
    "branchId" INTEGER,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastDailyReportAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TelegramGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramGroup_chatId_key" ON "TelegramGroup"("chatId");
CREATE INDEX "TelegramGroup_companyId_idx" ON "TelegramGroup"("companyId");
CREATE INDEX "TelegramGroup_status_idx" ON "TelegramGroup"("status");
CREATE INDEX "TelegramGroup_deletedAt_idx" ON "TelegramGroup"("deletedAt");

ALTER TABLE "TelegramGroup"
    ADD CONSTRAINT "TelegramGroup_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramGroup"
    ADD CONSTRAINT "TelegramGroup_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramGroup"
    ADD CONSTRAINT "TelegramGroup_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
