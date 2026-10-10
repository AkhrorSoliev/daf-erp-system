-- Contract documents (ADR-0075, spec 2026-10-10-shartnoma-hujjati).

-- CreateEnum
CREATE TYPE "ContractSignMethod" AS ENUM ('PAPER', 'BOT');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "city" TEXT,
ADD COLUMN     "representativeName" TEXT,
ADD COLUMN     "representativePosition" TEXT;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "contractDocumentId" TEXT;

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "contractDate" DATE NOT NULL,
    "fields" JSONB NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedById" INTEGER,
    "signMethod" "ContractSignMethod",
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" INTEGER,
    "cancelReason" TEXT,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractDocument_studentId_idx" ON "ContractDocument"("studentId");

-- CreateIndex
CREATE INDEX "ContractDocument_branchId_idx" ON "ContractDocument"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractDocument_companyId_number_key" ON "ContractDocument"("companyId", "number");

-- CreateIndex
CREATE INDEX "Enrollment_contractDocumentId_idx" ON "Enrollment"("contractDocumentId");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_contractDocumentId_fkey" FOREIGN KEY ("contractDocumentId") REFERENCES "ContractDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
