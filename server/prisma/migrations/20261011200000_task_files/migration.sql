-- ADR-0086: task files in the private bucket; a deleted file keeps its row (deletedAt, purgedAt).

-- CreateEnum
CREATE TYPE "TaskFileKind" AS ENUM ('IMAGE', 'DOCUMENT', 'VOICE');

-- AlterEnum
ALTER TYPE "TaskEventType" ADD VALUE 'FILE_DELETED';

-- AlterTable
ALTER TABLE "TaskEvent" ADD COLUMN     "fileId" TEXT;

-- CreateTable
CREATE TABLE "TaskFile" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "kind" "TaskFileKind" NOT NULL,
    "durationSec" INTEGER,
    "uploadedById" INTEGER,
    "via" "TaskEventVia" NOT NULL DEFAULT 'WEB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "TaskFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskFile_key_key" ON "TaskFile"("key");

-- CreateIndex
CREATE INDEX "TaskFile_taskId_createdAt_idx" ON "TaskFile"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskFile_deletedAt_purgedAt_idx" ON "TaskFile"("deletedAt", "purgedAt");

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "TaskFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFile" ADD CONSTRAINT "TaskFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFile" ADD CONSTRAINT "TaskFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
