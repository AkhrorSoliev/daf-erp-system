-- Lead owner (ADR-0093): a staff member claims a lead; without an action in
-- time the lead returns to the common pool. Idempotent, like the other
-- hand-written migrations here.
DO $$
BEGIN
  CREATE TYPE "LeadOwnershipKind" AS ENUM ('CLAIM', 'ASSIGN', 'RELEASE', 'EXPIRE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "ownerId" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "ownedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "ownerActedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Lead_ownerId_idx" ON "Lead"("ownerId");

DO $$
BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "LeadOwnershipLog" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "kind" "LeadOwnershipKind" NOT NULL,
  "fromUserId" INTEGER,
  "toUserId" INTEGER,
  "actorId" INTEGER,
  "reason" TEXT,
  "branchId" INTEGER,
  "companyId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadOwnershipLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadOwnershipLog_leadId_idx" ON "LeadOwnershipLog"("leadId");
CREATE INDEX IF NOT EXISTS "LeadOwnershipLog_companyId_kind_createdAt_idx"
  ON "LeadOwnershipLog"("companyId", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadOwnershipLog_fromUserId_idx" ON "LeadOwnershipLog"("fromUserId");

DO $$
BEGIN
  ALTER TABLE "LeadOwnershipLog" ADD CONSTRAINT "LeadOwnershipLog_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
