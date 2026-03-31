-- CreateEnum
CREATE TYPE "EntityAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'RESTORE');

-- CreateTable
CREATE TABLE "EntityHistory" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "EntityAction" NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "changedById" INTEGER,
    "companyId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntityHistory_entityType_entityId_idx" ON "EntityHistory"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EntityHistory_changedById_idx" ON "EntityHistory"("changedById");

-- CreateIndex
CREATE INDEX "EntityHistory_companyId_idx" ON "EntityHistory"("companyId");

-- CreateIndex
CREATE INDEX "EntityHistory_createdAt_idx" ON "EntityHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "EntityHistory" ADD CONSTRAINT "EntityHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
