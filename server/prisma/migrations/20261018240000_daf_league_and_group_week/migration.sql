-- S3: weekly league and the group table (ADR-0116). Nothing is backfilled:
-- no tier row means Bronza.
CREATE TABLE "DafStudentLeague" (
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafStudentLeague_pkey" PRIMARY KEY ("studentId")
);

CREATE TABLE "DafLeagueRoom" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "weekStart" DATE NOT NULL,
    "tier" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "DafLeagueRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DafLeagueEntry" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "weekStart" DATE NOT NULL,
    "tier" INTEGER NOT NULL,
    "place" INTEGER,
    "points" INTEGER,
    "promoted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DafLeagueEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DafGroupWeek" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "weekStart" DATE NOT NULL,
    "groupId" TEXT NOT NULL,
    "place" INTEGER NOT NULL,
    "average" DOUBLE PRECISION NOT NULL,
    "members" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "DafGroupWeek_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DafLeagueRoom_companyId_weekStart_tier_number_key" ON "DafLeagueRoom"("companyId", "weekStart", "tier", "number");
CREATE INDEX "DafLeagueRoom_companyId_settledAt_idx" ON "DafLeagueRoom"("companyId", "settledAt");
CREATE UNIQUE INDEX "DafLeagueEntry_weekStart_studentId_key" ON "DafLeagueEntry"("weekStart", "studentId");
CREATE INDEX "DafLeagueEntry_roomId_idx" ON "DafLeagueEntry"("roomId");
CREATE INDEX "DafLeagueEntry_studentId_idx" ON "DafLeagueEntry"("studentId");
CREATE UNIQUE INDEX "DafGroupWeek_weekStart_groupId_key" ON "DafGroupWeek"("weekStart", "groupId");

ALTER TABLE "DafStudentLeague" ADD CONSTRAINT "DafStudentLeague_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DafLeagueEntry" ADD CONSTRAINT "DafLeagueEntry_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "DafLeagueRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DafLeagueEntry" ADD CONSTRAINT "DafLeagueEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DafGroupWeek" ADD CONSTRAINT "DafGroupWeek_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
