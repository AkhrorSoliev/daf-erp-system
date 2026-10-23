-- ADR-0119: a group pause is its own record, so the nightly refund of unheld
-- lessons and the resume date have one place to read. Nothing is backfilled
-- here; `scripts/backfill-group-pauses.ts` does it after review.
CREATE TYPE "GroupPauseSource" AS ENUM ('MANUAL', 'BRANCH');

ALTER TABLE "Group" ADD COLUMN "lastResumedOn" DATE;

CREATE TABLE "GroupPause" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "plannedResumeOn" DATE,
    "resumeOn" DATE,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT,
    "source" "GroupPauseSource" NOT NULL DEFAULT 'MANUAL',
    "startedById" INTEGER,
    "endedById" INTEGER,
    "extendedLessons" INTEGER NOT NULL DEFAULT 0,
    "endDateBefore" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupPause_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GroupPause_groupId_startedAt_idx" ON "GroupPause"("groupId", "startedAt");
CREATE INDEX "GroupPause_companyId_endedAt_idx" ON "GroupPause"("companyId", "endedAt");

-- At most one open pause per group. Prisma cannot express a partial index.
CREATE UNIQUE INDEX "GroupPause_one_open_per_group" ON "GroupPause"("groupId") WHERE "endedAt" IS NULL;

ALTER TABLE "GroupPause" ADD CONSTRAINT "GroupPause_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
