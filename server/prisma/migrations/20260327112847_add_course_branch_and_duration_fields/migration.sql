/*
  Warnings:

  - You are about to drop the column `duration` on the `Course` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Course" DROP COLUMN "duration",
ADD COLUMN     "branchId" INTEGER,
ADD COLUMN     "courseDuration" INTEGER,
ADD COLUMN     "lessonDuration" INTEGER;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
