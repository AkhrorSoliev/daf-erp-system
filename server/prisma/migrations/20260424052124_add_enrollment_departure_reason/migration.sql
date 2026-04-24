-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "departureReasonId" TEXT;

-- CreateIndex
CREATE INDEX "Enrollment_departureReasonId_idx" ON "Enrollment"("departureReasonId");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_departureReasonId_fkey" FOREIGN KEY ("departureReasonId") REFERENCES "DepartureReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;
