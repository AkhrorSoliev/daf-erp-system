-- Standalone task module (spec 2026-10-07 §3, §9.2).

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('MANUAL', 'LESSON_QUESTION', 'CALLBACK', 'BROKEN_PROMISE', 'UNCALLED_LEAD');

-- CreateEnum
CREATE TYPE "TaskParticipantRole" AS ENUM ('ASSIGNEE', 'WATCHER');

-- CreateEnum
CREATE TYPE "TaskEventType" AS ENUM ('CREATED', 'COMMENT', 'VOICE', 'FILE', 'STATUS', 'RETURN', 'STEP', 'ASSIGNEE', 'CANCELLED', 'AUTO_CLOSED', 'REASSIGNED');

-- CreateEnum
CREATE TYPE "TaskEventVia" AS ENUM ('WEB', 'TELEGRAM', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TaskOutboxChannel" AS ENUM ('INAPP', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "TaskOutboxKind" AS ENUM ('REMINDER', 'OVERDUE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_REVIEW';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_OVERDUE';

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "migratedTaskId" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "UnmarkedLesson" ADD COLUMN     "taskId" TEXT;

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "kind" "TaskKind" NOT NULL DEFAULT 'MANUAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'NEW',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMP(3),
    "authorId" INTEGER,
    "entityType" TEXT,
    "entityId" TEXT,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
    "batchId" TEXT,
    "sourceKey" TEXT,
    "claimedById" INTEGER,
    "returnedCount" INTEGER NOT NULL DEFAULT 0,
    "lastReturnedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "reviewRequestedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskParticipant" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "TaskParticipantRole" NOT NULL DEFAULT 'ASSIGNEE',
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStep" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "doneAt" TIMESTAMP(3),
    "doneById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" "TaskEventType" NOT NULL,
    "actorId" INTEGER,
    "text" TEXT,
    "meta" JSONB,
    "via" "TaskEventVia" NOT NULL DEFAULT 'WEB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOutbox" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "channel" "TaskOutboxChannel" NOT NULL,
    "kind" "TaskOutboxKind" NOT NULL,
    "sendAfter" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_companyId_status_dueAt_idx" ON "Task"("companyId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_branchId_status_idx" ON "Task"("branchId", "status");

-- CreateIndex
CREATE INDEX "Task_authorId_status_idx" ON "Task"("authorId", "status");

-- CreateIndex
CREATE INDEX "Task_batchId_idx" ON "Task"("batchId");

-- CreateIndex
CREATE INDEX "Task_entityType_entityId_idx" ON "Task"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Task_sourceKey_idx" ON "Task"("sourceKey");

-- CreateIndex
CREATE INDEX "TaskParticipant_userId_role_idx" ON "TaskParticipant"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "TaskParticipant_taskId_userId_key" ON "TaskParticipant"("taskId", "userId");

-- CreateIndex
CREATE INDEX "TaskStep_taskId_position_idx" ON "TaskStep"("taskId", "position");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_createdAt_idx" ON "TaskEvent"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskOutbox_sendAfter_sentAt_idx" ON "TaskOutbox"("sendAfter", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOutbox_taskId_userId_channel_kind_key" ON "TaskOutbox"("taskId", "userId", "channel", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "UnmarkedLesson_taskId_key" ON "UnmarkedLesson"("taskId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStep" ADD CONSTRAINT "TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOutbox" ADD CONSTRAINT "TaskOutbox_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnmarkedLesson" ADD CONSTRAINT "UnmarkedLesson_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One open task per source (spec §7): a re-run of any auto rule cannot duplicate.
CREATE UNIQUE INDEX "task_open_source_unique" ON "Task"("sourceKey")
  WHERE "sourceKey" IS NOT NULL AND "status" IN ('NEW', 'IN_PROGRESS', 'IN_REVIEW');
