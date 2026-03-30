-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'GRADUATED', 'EXPELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('FORMING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'TRIAL', 'CONVERTED', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'FROZEN', 'COMPLETED', 'DROPPED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "HolidayStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "statusChangeReason" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedById" INTEGER;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "status" "CourseStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "statusChangeReason" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedById" INTEGER;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "statusChangeReason" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedById" INTEGER,
ADD COLUMN     "transferredToId" TEXT;

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "statusChangeReason" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedById" INTEGER,
ADD COLUMN     "statusEnum" "GroupStatus" NOT NULL DEFAULT 'FORMING';

-- AlterTable
ALTER TABLE "Holiday" ADD COLUMN     "status" "HolidayStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "statusChangeReason" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedById" INTEGER;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "statusChangeReason" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedById" INTEGER,
ADD COLUMN     "statusEnum" "LeadStatus" NOT NULL DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "status" "RoomStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "statusChangeReason" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedById" INTEGER;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "statusChangeReason" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedById" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "statusChangeReason" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedById" INTEGER;

-- CreateTable
CREATE TABLE "StatusHistory" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "changedById" INTEGER,
    "companyId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusHistory_entityType_entityId_idx" ON "StatusHistory"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "StatusHistory_createdAt_idx" ON "StatusHistory"("createdAt");

-- CreateIndex
CREATE INDEX "StatusHistory_companyId_idx" ON "StatusHistory"("companyId");

-- CreateIndex
CREATE INDEX "Branch_status_idx" ON "Branch"("status");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE INDEX "Enrollment_status_idx" ON "Enrollment"("status");

-- CreateIndex
CREATE INDEX "Group_statusEnum_idx" ON "Group"("statusEnum");

-- CreateIndex
CREATE INDEX "Holiday_status_idx" ON "Holiday"("status");

-- CreateIndex
CREATE INDEX "Lead_statusEnum_idx" ON "Lead"("statusEnum");

-- CreateIndex
CREATE INDEX "Room_status_idx" ON "Room"("status");

-- CreateIndex
CREATE INDEX "Student_status_idx" ON "Student"("status");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- AddForeignKey
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: User isActive -> status
UPDATE "User" SET "status" = 'ACTIVE' WHERE "isActive" = true AND "deletedAt" IS NULL;
UPDATE "User" SET "status" = 'INACTIVE' WHERE "isActive" = false AND "deletedAt" IS NULL;
UPDATE "User" SET "status" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;

-- Backfill: Student isActive -> status
UPDATE "Student" SET "status" = 'ACTIVE' WHERE "isActive" = true AND "deletedAt" IS NULL;
UPDATE "Student" SET "status" = 'INACTIVE' WHERE "isActive" = false AND "deletedAt" IS NULL;
UPDATE "Student" SET "status" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;

-- Backfill: Group Int status -> statusEnum
UPDATE "Group" SET "statusEnum" = 'ACTIVE' WHERE "status" = 1 AND "deletedAt" IS NULL;
UPDATE "Group" SET "statusEnum" = 'FORMING' WHERE "status" = 2 AND "deletedAt" IS NULL;
UPDATE "Group" SET "statusEnum" = 'PAUSED' WHERE "status" = 3 AND "deletedAt" IS NULL;
UPDATE "Group" SET "statusEnum" = 'CANCELLED' WHERE "status" = 4 AND "deletedAt" IS NULL;
UPDATE "Group" SET "statusEnum" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;

-- Backfill: Course isActive -> status
UPDATE "Course" SET "status" = 'ACTIVE' WHERE "isActive" = true AND "deletedAt" IS NULL;
UPDATE "Course" SET "status" = 'INACTIVE' WHERE "isActive" = false AND "deletedAt" IS NULL;
UPDATE "Course" SET "status" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;

-- Backfill: Branch isActive -> status
UPDATE "Branch" SET "status" = 'ACTIVE' WHERE "isActive" = true AND "deletedAt" IS NULL;
UPDATE "Branch" SET "status" = 'INACTIVE' WHERE "isActive" = false AND "deletedAt" IS NULL;
UPDATE "Branch" SET "status" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;

-- Backfill: Lead string status -> statusEnum
UPDATE "Lead" SET "statusEnum" = 'NEW' WHERE "status" = 'new' AND "deletedAt" IS NULL;
UPDATE "Lead" SET "statusEnum" = 'CONTACTED' WHERE "status" = 'contacted' AND "deletedAt" IS NULL;
UPDATE "Lead" SET "statusEnum" = 'TRIAL' WHERE "status" = 'trial' AND "deletedAt" IS NULL;
UPDATE "Lead" SET "statusEnum" = 'CONVERTED' WHERE "status" = 'converted' AND "deletedAt" IS NULL;
UPDATE "Lead" SET "statusEnum" = 'LOST' WHERE "status" = 'lost' AND "deletedAt" IS NULL;
UPDATE "Lead" SET "statusEnum" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;

-- Backfill: Room archived -> ARCHIVED
UPDATE "Room" SET "status" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;

-- Backfill: Enrollment archived -> DROPPED
UPDATE "Enrollment" SET "status" = 'DROPPED' WHERE "deletedAt" IS NOT NULL;

-- Backfill: Holiday archived -> CANCELLED
UPDATE "Holiday" SET "status" = 'CANCELLED' WHERE "deletedAt" IS NOT NULL;
