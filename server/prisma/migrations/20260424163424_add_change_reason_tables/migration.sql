-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "transferReasonId" TEXT;

-- AlterTable
ALTER TABLE "GroupTeacherHistory" ADD COLUMN     "changeReasonId" TEXT;

-- CreateTable
CREATE TABLE "GroupTeacherChangeReason" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "deletionBatchId" TEXT,

    CONSTRAINT "GroupTeacherChangeReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentTransferReason" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "deletionBatchId" TEXT,

    CONSTRAINT "EnrollmentTransferReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupTeacherChangeReason_deletedAt_idx" ON "GroupTeacherChangeReason"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupTeacherChangeReason_companyId_name_key" ON "GroupTeacherChangeReason"("companyId", "name");

-- CreateIndex
CREATE INDEX "EnrollmentTransferReason_deletedAt_idx" ON "EnrollmentTransferReason"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentTransferReason_companyId_name_key" ON "EnrollmentTransferReason"("companyId", "name");

-- CreateIndex
CREATE INDEX "Enrollment_transferReasonId_idx" ON "Enrollment"("transferReasonId");

-- CreateIndex
CREATE INDEX "GroupTeacherHistory_changeReasonId_idx" ON "GroupTeacherHistory"("changeReasonId");

-- AddForeignKey
ALTER TABLE "GroupTeacherHistory" ADD CONSTRAINT "GroupTeacherHistory_changeReasonId_fkey" FOREIGN KEY ("changeReasonId") REFERENCES "GroupTeacherChangeReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_transferReasonId_fkey" FOREIGN KEY ("transferReasonId") REFERENCES "EnrollmentTransferReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTeacherChangeReason" ADD CONSTRAINT "GroupTeacherChangeReason_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTeacherChangeReason" ADD CONSTRAINT "GroupTeacherChangeReason_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentTransferReason" ADD CONSTRAINT "EnrollmentTransferReason_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentTransferReason" ADD CONSTRAINT "EnrollmentTransferReason_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
