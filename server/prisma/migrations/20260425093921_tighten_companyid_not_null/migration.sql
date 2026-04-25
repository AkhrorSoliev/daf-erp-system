/*
  Warnings:

  - Made the column `companyId` on table `AiConversation` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyId` on table `Attendance` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyId` on table `Branch` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyId` on table `Course` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyId` on table `Group` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyId` on table `Room` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyId` on table `Student` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Branch" DROP CONSTRAINT "Branch_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Course" DROP CONSTRAINT "Course_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Group" DROP CONSTRAINT "Group_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Room" DROP CONSTRAINT "Room_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_companyId_fkey";

-- AlterTable
ALTER TABLE "AiConversation" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Attendance" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Branch" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Course" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Group" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Room" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Student" ALTER COLUMN "companyId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
