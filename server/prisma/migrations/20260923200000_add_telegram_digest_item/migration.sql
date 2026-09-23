-- CreateEnum
CREATE TYPE "TelegramDigestRecipientKind" AS ENUM ('STUDENT', 'USER', 'GROUP');

-- CreateEnum
CREATE TYPE "TelegramDigestCategory" AS ENUM ('PAYMENT_RECEIVED', 'PAYMENT_REVERSED', 'STUDENT_ENROLLED', 'STUDENT_REMOVED', 'DEBT_CHARGE', 'TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_DELETED', 'TASK_STATUS_CHANGED', 'PAYMENT_CORRECTED', 'SALARY_CARRIED_OVER', 'ATTENDANCE_COMPLETED', 'GROUP_NEW_STUDENT', 'GROUP_NEW_GROUP', 'GROUP_PAYMENT', 'GROUP_STATUS_CHANGE');

-- CreateTable
CREATE TABLE "TelegramDigestItem" (
    "id" TEXT NOT NULL,
    "recipientKind" "TelegramDigestRecipientKind" NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "category" "TelegramDigestCategory" NOT NULL,
    "relatedEntityId" TEXT,
    "payload" JSONB NOT NULL,
    "deliveredGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramDigestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramDigestItem_recipientKind_recipientId_idx" ON "TelegramDigestItem"("recipientKind", "recipientId");

-- CreateIndex
CREATE INDEX "TelegramDigestItem_companyId_idx" ON "TelegramDigestItem"("companyId");

-- CreateIndex
CREATE INDEX "TelegramDigestItem_createdAt_idx" ON "TelegramDigestItem"("createdAt");
