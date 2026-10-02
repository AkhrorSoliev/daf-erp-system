-- Lessons nobody marked before they ended (spec 2026-09-29, ADR-0054).

CREATE TYPE "UnmarkedLessonStatus" AS ENUM ('PENDING', 'HELD', 'NOT_HELD', 'RESCHEDULED');

-- The teacher's "this lesson earned nothing" line in the 20:00 digest.
ALTER TYPE "TelegramDigestCategory" ADD VALUE IF NOT EXISTS 'LESSON_PAY_FORFEITED';

-- A system task has no author; the UI shows «Tizim».
ALTER TABLE "Comment" ALTER COLUMN "authorId" DROP NOT NULL;

CREATE TABLE "UnmarkedLesson" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "groupId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "lessonStartTime" TEXT NOT NULL,
    "lessonEndTime" TEXT NOT NULL,
    "status" "UnmarkedLessonStatus" NOT NULL DEFAULT 'PENDING',
    "teacherPayExempt" BOOLEAN NOT NULL DEFAULT false,
    "exemptReason" TEXT,
    "claimedById" INTEGER,
    "decidedById" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "cancellationId" TEXT,
    "rescheduleId" TEXT,
    "taskCommentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnmarkedLesson_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnmarkedLesson_taskCommentId_key" ON "UnmarkedLesson"("taskCommentId");
CREATE UNIQUE INDEX "UnmarkedLesson_groupId_date_key" ON "UnmarkedLesson"("groupId", "date");
CREATE INDEX "UnmarkedLesson_companyId_status_idx" ON "UnmarkedLesson"("companyId", "status");
CREATE INDEX "UnmarkedLesson_branchId_status_idx" ON "UnmarkedLesson"("branchId", "status");

ALTER TABLE "UnmarkedLesson" ADD CONSTRAINT "UnmarkedLesson_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnmarkedLesson" ADD CONSTRAINT "UnmarkedLesson_taskCommentId_fkey" FOREIGN KEY ("taskCommentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
