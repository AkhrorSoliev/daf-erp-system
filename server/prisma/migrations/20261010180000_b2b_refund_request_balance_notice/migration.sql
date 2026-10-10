-- B2b (ADR-0077): a refund is a request until the money is handed over, and a
-- balance notice starts the clock for moving unclaimed money to the centre.
-- Every new column is nullable: the existing refunds stay as they are.

-- CreateEnum
CREATE TYPE "BalanceNoticeChannel" AS ENUM ('BOT', 'CALL');

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "requestedById" INTEGER,
ADD COLUMN IF NOT EXISTS "handedOverAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "handedOverById" INTEGER,
ADD COLUMN IF NOT EXISTS "cashAccountId" TEXT,
ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "cancelledById" INTEGER,
ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

-- CreateTable
CREATE TABLE "BalanceNotice" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "channel" "BalanceNoticeChannel" NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "smsMessageId" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BalanceNotice_studentId_createdAt_idx" ON "BalanceNotice"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "BalanceNotice_companyId_idx" ON "BalanceNotice"("companyId");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_handedOverById_fkey" FOREIGN KEY ("handedOverById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceNotice" ADD CONSTRAINT "BalanceNotice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceNotice" ADD CONSTRAINT "BalanceNotice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
