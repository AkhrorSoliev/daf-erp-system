-- CreateTable
CREATE TABLE "DepartureReason" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "deletionBatchId" TEXT,

    CONSTRAINT "DepartureReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepartureReason_deletedAt_idx" ON "DepartureReason"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DepartureReason_companyId_name_key" ON "DepartureReason"("companyId", "name");

-- AddForeignKey
ALTER TABLE "DepartureReason" ADD CONSTRAINT "DepartureReason_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartureReason" ADD CONSTRAINT "DepartureReason_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
