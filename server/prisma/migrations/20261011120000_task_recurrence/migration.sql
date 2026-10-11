-- ADR-0084: recurring tasks. A deleted rule leaves its tasks (recurrenceId -> NULL).

-- CreateEnum
CREATE TYPE "TaskRecurrenceFreq" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "recurrenceId" TEXT;

-- CreateTable
CREATE TABLE "TaskRecurrence" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "authorId" INTEGER NOT NULL,
    "freq" "TaskRecurrenceFreq" NOT NULL,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "dayOfMonth" INTEGER,
    "dueTime" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "assigneeIds" INTEGER[],
    "watcherIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "entityType" TEXT,
    "entityId" TEXT,
    "separateCopies" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextRunDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskRecurrence_active_nextRunDate_idx" ON "TaskRecurrence"("active", "nextRunDate");

-- CreateIndex
CREATE INDEX "TaskRecurrence_companyId_authorId_idx" ON "TaskRecurrence"("companyId", "authorId");

-- CreateIndex
CREATE INDEX "Task_recurrenceId_status_idx" ON "Task"("recurrenceId", "status");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "TaskRecurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
