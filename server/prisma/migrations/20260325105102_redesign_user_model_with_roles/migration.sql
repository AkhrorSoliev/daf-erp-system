/*
  Warnings:

  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Employee` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Teacher` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `teacherId` on the `Group` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `companyId` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `User` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `id` on the `User` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_branchId_fkey";

-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_userId_fkey";

-- DropForeignKey
ALTER TABLE "Group" DROP CONSTRAINT "Group_teacherId_fkey";

-- DropForeignKey
ALTER TABLE "Teacher" DROP CONSTRAINT "Teacher_userId_fkey";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "subdomain" TEXT;

-- AlterTable
ALTER TABLE "Group" DROP COLUMN "teacherId",
ADD COLUMN     "teacherId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
DROP COLUMN "role",
ADD COLUMN     "balance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "companyId" INTEGER NOT NULL,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "mainBranch" INTEGER,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "photo" TEXT,
DROP COLUMN "id",
ADD COLUMN     "id" INTEGER NOT NULL,
ALTER COLUMN "login" DROP NOT NULL,
ALTER COLUMN "password" DROP NOT NULL,
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "Employee";

-- DropTable
DROP TABLE "Teacher";

-- DropEnum
DROP TYPE "Role";

-- CreateTable
CREATE TABLE "Role" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "UserBranch" (
    "userId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,

    CONSTRAINT "UserBranch_pkey" PRIMARY KEY ("userId","branchId")
);

-- CreateTable
CREATE TABLE "_StudentGroups" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_StudentGroups_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "_StudentGroups_B_index" ON "_StudentGroups"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StudentGroups" ADD CONSTRAINT "_StudentGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StudentGroups" ADD CONSTRAINT "_StudentGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
