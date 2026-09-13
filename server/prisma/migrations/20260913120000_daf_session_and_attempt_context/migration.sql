-- CreateEnum
CREATE TYPE "DafGradingStatus" AS ENUM ('GRADED', 'PENDING', 'UNGRADED');

-- CreateEnum
CREATE TYPE "DafSessionKind" AS ENUM ('LESSON', 'REVIEW');

-- AlterTable
ALTER TABLE "DafAttempt" ADD COLUMN     "attemptNo" INTEGER,
ADD COLUMN     "format" TEXT,
ADD COLUMN     "gradingStatus" "DafGradingStatus" NOT NULL DEFAULT 'GRADED',
ADD COLUMN     "itemId" INTEGER,
ADD COLUMN     "itemType" TEXT,
ADD COLUMN     "lessonId" INTEGER,
ADD COLUMN     "questionIndex" INTEGER,
ADD COLUMN     "score" DOUBLE PRECISION,
ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "DafSession" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "groupId" TEXT,
    "kind" "DafSessionKind" NOT NULL,
    "lessonId" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "questionCount" INTEGER,
    "firstTryCorrect" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DafSession_studentId_startedAt_idx" ON "DafSession"("studentId", "startedAt");

-- CreateIndex
CREATE INDEX "DafSession_groupId_startedAt_idx" ON "DafSession"("groupId", "startedAt");

-- CreateIndex
CREATE INDEX "DafSession_companyId_startedAt_idx" ON "DafSession"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "DafAttempt_sessionId_idx" ON "DafAttempt"("sessionId");

-- CreateIndex
CREATE INDEX "DafAttempt_studentId_sessionId_idx" ON "DafAttempt"("studentId", "sessionId");
