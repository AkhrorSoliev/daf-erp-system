-- S2: the student's daily goal (a choice) and earned badges (ADR-0115).
CREATE TYPE "DafDailyGoal" AS ENUM ('YENGIL', 'ORTA', 'JIDDIY');

CREATE TABLE "DafStudentSetting" (
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "dailyGoal" "DafDailyGoal" NOT NULL DEFAULT 'ORTA',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafStudentSetting_pkey" PRIMARY KEY ("studentId")
);

CREATE TABLE "DafStudentBadge" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DafStudentBadge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DafStudentBadge_studentId_key_key" ON "DafStudentBadge"("studentId", "key");

ALTER TABLE "DafStudentSetting" ADD CONSTRAINT "DafStudentSetting_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DafStudentBadge" ADD CONSTRAINT "DafStudentBadge_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
