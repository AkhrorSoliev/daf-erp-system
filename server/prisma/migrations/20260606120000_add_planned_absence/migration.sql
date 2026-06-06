-- CreateEnum
CREATE TYPE "PlannedAbsenceKind" AS ENUM ('SABABLI', 'SABABSIZ');

-- CreateTable
CREATE TABLE "PlannedAbsence" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "kind" "PlannedAbsenceKind" NOT NULL,
    "note" TEXT,
    "createdById" INTEGER,
    "consumedAt" TIMESTAMP(3),
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlannedAbsence_groupId_date_idx" ON "PlannedAbsence"("groupId", "date");

-- CreateIndex
CREATE INDEX "PlannedAbsence_companyId_date_idx" ON "PlannedAbsence"("companyId", "date");

-- CreateIndex
CREATE INDEX "PlannedAbsence_studentId_idx" ON "PlannedAbsence"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedAbsence_groupId_studentId_date_key" ON "PlannedAbsence"("groupId", "studentId", "date");

-- AddForeignKey
ALTER TABLE "PlannedAbsence" ADD CONSTRAINT "PlannedAbsence_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedAbsence" ADD CONSTRAINT "PlannedAbsence_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedAbsence" ADD CONSTRAINT "PlannedAbsence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedAbsence" ADD CONSTRAINT "PlannedAbsence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
