-- CreateTable
CREATE TABLE "TelegramChannelGateEvent" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "blockedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "rejoinCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChannelGateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramChannelGateEvent_companyId_blockedAt_idx" ON "TelegramChannelGateEvent"("companyId", "blockedAt");

-- CreateIndex
CREATE INDEX "TelegramChannelGateEvent_companyId_joinedAt_idx" ON "TelegramChannelGateEvent"("companyId", "joinedAt");

-- CreateIndex
CREATE INDEX "TelegramChannelGateEvent_companyId_leftAt_idx" ON "TelegramChannelGateEvent"("companyId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChannelGateEvent_companyId_telegramUserId_key" ON "TelegramChannelGateEvent"("companyId", "telegramUserId");
