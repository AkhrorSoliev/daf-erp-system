-- Bot sign-ups become requests an administrator approves (ADR-0080; spec
-- 2026-10-10-guruhga-qoshilish-tasdigi §4). Hand-written: the dev database is
-- behind main. The new 'JOIN_REQUEST' value is not used in this migration, so
-- `ALTER TYPE … ADD VALUE` inside the transaction is safe (PostgreSQL 12+).
-- 'PENDING' in the partial index belongs to a type CREATED here, which a
-- transaction may use at once.

-- CreateEnum
CREATE TYPE "StudentJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'REPLACED');

-- AlterEnum
ALTER TYPE "TaskKind" ADD VALUE 'JOIN_REQUEST';

-- CreateTable
CREATE TABLE "StudentJoinRequest" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "groupId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "photo" TEXT,
    "status" "StudentJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "taskId" TEXT,
    "decidedById" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "approvedGroupId" TEXT,
    "studentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentJoinRequest_taskId_key" ON "StudentJoinRequest"("taskId");

-- CreateIndex
CREATE INDEX "StudentJoinRequest_status_createdAt_idx" ON "StudentJoinRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StudentJoinRequest_branchId_status_idx" ON "StudentJoinRequest"("branchId", "status");

-- One open request per chat (spec D9). Prisma cannot express a partial index.
CREATE UNIQUE INDEX "StudentJoinRequest_chatId_pending_key" ON "StudentJoinRequest"("chatId") WHERE "status" = 'PENDING';
