-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DELETED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_REMINDER';

-- AlterTable: Comment — add dueDate and priority
ALTER TABLE "Comment" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "Comment" ADD COLUMN "priority" "TaskPriority";

-- AlterTable: CommentAssignee — add lastRemindedAt
ALTER TABLE "CommentAssignee" ADD COLUMN "lastRemindedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Comment_isTask_dueDate_idx" ON "Comment"("isTask", "dueDate");
