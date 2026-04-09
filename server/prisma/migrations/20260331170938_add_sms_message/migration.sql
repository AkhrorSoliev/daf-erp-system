-- CreateEnum
CREATE TYPE "SmsMessageType" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "SmsMessageStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "type" "SmsMessageType" NOT NULL,
    "status" "SmsMessageStatus" NOT NULL,
    "senderUserId" INTEGER,
    "telegramMessageId" INTEGER,
    "errorMessage" TEXT,
    "companyId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsMessage_studentId_createdAt_idx" ON "SmsMessage"("studentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SmsMessage_companyId_createdAt_idx" ON "SmsMessage"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SmsMessage_status_idx" ON "SmsMessage"("status");

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
