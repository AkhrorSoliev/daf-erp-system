-- Avtomatik pauza: sozlama va ogohlantirish jurnali.
--
-- Yangi enum qiymatlari shu migratsiyada HECH QAYERDA ishlatilmaydi —
-- Postgres bitta tranzaksiyada enum qiymatini qo'shib darhol ishlatishga
-- ruxsat bermaydi, va aynan shu naqsh `prisma migrate dev` ni bu repoda
-- buzib turibdi (20260427183245 P3006).
ALTER TYPE "NotificationType" ADD VALUE 'ABSENCE_WARNING';
ALTER TYPE "NotificationType" ADD VALUE 'ENROLLMENT_AUTO_PAUSED';

-- CreateTable
CREATE TABLE "AbsencePauseSetting" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "warnThreshold" INTEGER NOT NULL DEFAULT 2,
    "pauseThreshold" INTEGER NOT NULL DEFAULT 3,
    "dailyCap" INTEGER NOT NULL DEFAULT 10,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbsencePauseSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbsenceWarningLog" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "groupId" TEXT NOT NULL,
    "absenceDate" DATE NOT NULL,
    "streak" INTEGER NOT NULL,
    "sentToStudent" BOOLEAN NOT NULL DEFAULT false,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbsenceWarningLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AbsencePauseSetting_companyId_key" ON "AbsencePauseSetting"("companyId");

-- CreateIndex
CREATE INDEX "AbsenceWarningLog_companyId_createdAt_idx" ON "AbsenceWarningLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AbsenceWarningLog_studentId_idx" ON "AbsenceWarningLog"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AbsenceWarningLog_enrollmentId_absenceDate_key" ON "AbsenceWarningLog"("enrollmentId", "absenceDate");
