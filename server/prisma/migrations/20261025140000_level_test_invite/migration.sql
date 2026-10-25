-- CreateEnum
CREATE TYPE "LevelTestInviteStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "LevelTestInvite" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "status" "LevelTestInviteStatus" NOT NULL DEFAULT 'FAILED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "LevelTestInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LevelTestInvite_chatId_key" ON "LevelTestInvite"("chatId");
