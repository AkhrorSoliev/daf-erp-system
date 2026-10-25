ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHAT_MESSAGE';

CREATE TABLE IF NOT EXISTS "ChatNotifyState" (
  "conversationId" TEXT NOT NULL,
  "studentId" INTEGER NOT NULL,
  "notifiedAt" TIMESTAMP(3),
  "pendingSince" TIMESTAMP(3),
  CONSTRAINT "ChatNotifyState_pkey" PRIMARY KEY ("conversationId", "studentId")
);
CREATE INDEX IF NOT EXISTS "ChatNotifyState_pendingSince_idx" ON "ChatNotifyState"("pendingSince");
