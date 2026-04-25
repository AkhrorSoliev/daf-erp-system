-- CreateEnum
CREATE TYPE "GroupTeacherChangeType" AS ENUM ('ADDED', 'REMOVED', 'REPLACED');

-- CreateTable
CREATE TABLE "GroupTeacherHistory" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "previousTeacherIds" INTEGER[],
    "newTeacherIds" INTEGER[],
    "changeType" "GroupTeacherChangeType" NOT NULL,
    "changeReason" TEXT,
    "triggeredByDismissal" BOOLEAN NOT NULL DEFAULT false,
    "changedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupTeacherHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupTeacherHistory_groupId_createdAt_idx" ON "GroupTeacherHistory"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupTeacherHistory_createdAt_idx" ON "GroupTeacherHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "GroupTeacherHistory" ADD CONSTRAINT "GroupTeacherHistory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTeacherHistory" ADD CONSTRAINT "GroupTeacherHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
