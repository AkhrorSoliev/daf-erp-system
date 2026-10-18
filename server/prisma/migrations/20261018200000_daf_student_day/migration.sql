-- DafStudentDay: derived daily totals of DafAttempt (ADR-0111).
CREATE TABLE "DafStudentDay" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "groupKey" TEXT NOT NULL DEFAULT '',
    "points" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafStudentDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DafStudentDay_studentId_day_groupKey_key" ON "DafStudentDay"("studentId", "day", "groupKey");
CREATE INDEX "DafStudentDay_companyId_day_idx" ON "DafStudentDay"("companyId", "day");
CREATE INDEX "DafStudentDay_groupKey_day_idx" ON "DafStudentDay"("groupKey", "day");

ALTER TABLE "DafStudentDay" ADD CONSTRAINT "DafStudentDay_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill from the attempts that already exist. "createdAt" is a UTC
-- timestamp without time zone; +5 hours is the Tashkent day (no DST).
INSERT INTO "DafStudentDay" ("studentId", "companyId", "day", "groupKey", "points", "attempts", "updatedAt")
SELECT "studentId",
       "companyId",
       ("createdAt" + interval '5 hours')::date,
       COALESCE("groupId", ''),
       COALESCE(SUM("points"), 0)::int,
       COUNT(*)::int,
       now()
FROM "DafAttempt"
GROUP BY 1, 2, 3, 4;
