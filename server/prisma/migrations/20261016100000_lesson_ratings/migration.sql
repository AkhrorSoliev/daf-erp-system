-- Dars baholari (spec 2026-10-13): o'quvchi darsdan keyin Telegram'da 1–5 baho qo'yadi.
DO $$
BEGIN
  CREATE TYPE "LessonRatingStatus" AS ENUM ('SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "LessonRating" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER NOT NULL,
  "groupId" TEXT NOT NULL,
  "studentId" INTEGER NOT NULL,
  "date" DATE NOT NULL,
  "teacherIds" INTEGER[],
  "chatId" TEXT NOT NULL,
  "messageId" INTEGER,
  "promptMessageId" INTEGER,
  "status" "LessonRatingStatus" NOT NULL DEFAULT 'SENT',
  "score" INTEGER,
  "comment" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ratedAt" TIMESTAMP(3),
  "commentedAt" TIMESTAMP(3),
  "failReason" TEXT,
  CONSTRAINT "LessonRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LessonRating_groupId_studentId_date_key"
  ON "LessonRating"("groupId", "studentId", "date");
CREATE INDEX IF NOT EXISTS "LessonRating_companyId_date_idx"
  ON "LessonRating"("companyId", "date");
CREATE INDEX IF NOT EXISTS "LessonRating_chatId_promptMessageId_idx"
  ON "LessonRating"("chatId", "promptMessageId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonRating_groupId_fkey') THEN
    ALTER TABLE "LessonRating"
      ADD CONSTRAINT "LessonRating_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonRating_studentId_fkey') THEN
    ALTER TABLE "LessonRating"
      ADD CONSTRAINT "LessonRating_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
