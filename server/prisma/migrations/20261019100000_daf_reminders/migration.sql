-- S4: Telegram evening reminder and Monday summary (ADR-0117). Nothing is
-- backfilled: no settings row means reminders on; the log starts empty.
CREATE TYPE "DafReminderKind" AS ENUM ('EVENING', 'WEEKLY');

CREATE TYPE "DafReminderStatus" AS ENUM ('SENT', 'FAILED');

ALTER TABLE "DafStudentSetting" ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "DafReminderLog" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "kind" "DafReminderKind" NOT NULL,
    "sentOn" DATE NOT NULL,
    "status" "DafReminderStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DafReminderLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DafReminderLog_studentId_kind_sentOn_key" ON "DafReminderLog"("studentId", "kind", "sentOn");
CREATE INDEX "DafReminderLog_companyId_sentOn_idx" ON "DafReminderLog"("companyId", "sentOn");

ALTER TABLE "DafReminderLog" ADD CONSTRAINT "DafReminderLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
