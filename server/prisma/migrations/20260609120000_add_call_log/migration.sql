-- CreateEnum
CREATE TYPE "CallReason" AS ENUM ('ABSENCE', 'DEBT', 'REMOVAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('ANSWERED', 'NO_ANSWER', 'PROMISED', 'LEFT');

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "reason" "CallReason" NOT NULL,
    "outcome" "CallOutcome" NOT NULL,
    "note" TEXT,
    "calledById" INTEGER NOT NULL,
    "branchId" INTEGER,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallLog_studentId_idx" ON "CallLog"("studentId");

-- CreateIndex
CREATE INDEX "CallLog_companyId_createdAt_idx" ON "CallLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CallLog_branchId_idx" ON "CallLog"("branchId");

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_calledById_fkey" FOREIGN KEY ("calledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
