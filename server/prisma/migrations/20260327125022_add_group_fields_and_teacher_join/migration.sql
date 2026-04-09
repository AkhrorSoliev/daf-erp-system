/*
  Warnings:

  - You are about to drop the column `teacherId` on the `Group` table. All the data in the column will be lost.

*/
-- CreateTable (before dropping teacherId so we can migrate data)
CREATE TABLE "GroupTeacher" (
    "groupId" TEXT NOT NULL,
    "teacherId" INTEGER NOT NULL,

    CONSTRAINT "GroupTeacher_pkey" PRIMARY KEY ("groupId","teacherId")
);

-- Migrate existing teacherId data to GroupTeacher join table
INSERT INTO "GroupTeacher" ("groupId", "teacherId")
SELECT "id", "teacherId" FROM "Group" WHERE "teacherId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- DropForeignKey
ALTER TABLE "Group" DROP CONSTRAINT "Group_teacherId_fkey";

-- AlterTable
ALTER TABLE "Group" DROP COLUMN "teacherId",
ADD COLUMN     "comment" TEXT,
ADD COLUMN     "companyId" INTEGER,
ADD COLUMN     "days" TEXT,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "exactDays" TEXT[],
ADD COLUMN     "groupNumber" INTEGER,
ADD COLUMN     "lessonEndTime" TEXT,
ADD COLUMN     "lessonStartTime" TEXT,
ADD COLUMN     "status" INTEGER NOT NULL DEFAULT 2;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTeacher" ADD CONSTRAINT "GroupTeacher_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTeacher" ADD CONSTRAINT "GroupTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
