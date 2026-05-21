-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sectionId" TEXT,
ADD COLUMN     "sourceId" TEXT;

-- CreateTable
CREATE TABLE "LeadColumn" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "systemKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "deletionBatchId" TEXT,

    CONSTRAINT "LeadColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "columnId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "deletionBatchId" TEXT,

    CONSTRAINT "LeadSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "deletionBatchId" TEXT,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadColumn_deletedAt_idx" ON "LeadColumn"("deletedAt");

-- CreateIndex
CREATE INDEX "LeadColumn_order_idx" ON "LeadColumn"("order");

-- CreateIndex
CREATE INDEX "LeadSection_deletedAt_idx" ON "LeadSection"("deletedAt");

-- CreateIndex
CREATE INDEX "LeadSection_columnId_idx" ON "LeadSection"("columnId");

-- CreateIndex
CREATE INDEX "LeadSource_deletedAt_idx" ON "LeadSource"("deletedAt");

-- CreateIndex
CREATE INDEX "Lead_sectionId_idx" ON "Lead"("sectionId");

-- CreateIndex
CREATE INDEX "Lead_sourceId_idx" ON "Lead"("sourceId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "LeadSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadColumn" ADD CONSTRAINT "LeadColumn_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSection" ADD CONSTRAINT "LeadSection_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "LeadColumn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSection" ADD CONSTRAINT "LeadSection_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
