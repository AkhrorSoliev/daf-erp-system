-- CreateTable
CREATE TABLE "RoomCapacitySnapshot" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "changedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomCapacitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupScheduleSnapshot" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "exactDays" TEXT[],
    "lessonStartTime" TEXT,
    "lessonEndTime" TEXT,
    "courseId" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "changedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupScheduleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePriceSnapshot" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "changedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoursePriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentStateLog" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL,
    "transitionAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "changedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentStateLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomCapacitySnapshot_roomId_validFrom_idx" ON "RoomCapacitySnapshot"("roomId", "validFrom");

-- CreateIndex
CREATE INDEX "RoomCapacitySnapshot_validFrom_validTo_idx" ON "RoomCapacitySnapshot"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "GroupScheduleSnapshot_groupId_validFrom_idx" ON "GroupScheduleSnapshot"("groupId", "validFrom");

-- CreateIndex
CREATE INDEX "GroupScheduleSnapshot_validFrom_validTo_idx" ON "GroupScheduleSnapshot"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "CoursePriceSnapshot_courseId_validFrom_idx" ON "CoursePriceSnapshot"("courseId", "validFrom");

-- CreateIndex
CREATE INDEX "CoursePriceSnapshot_validFrom_validTo_idx" ON "CoursePriceSnapshot"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "EnrollmentStateLog_enrollmentId_transitionAt_idx" ON "EnrollmentStateLog"("enrollmentId", "transitionAt");

-- CreateIndex
CREATE INDEX "EnrollmentStateLog_transitionAt_idx" ON "EnrollmentStateLog"("transitionAt");

-- AddForeignKey
ALTER TABLE "RoomCapacitySnapshot" ADD CONSTRAINT "RoomCapacitySnapshot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomCapacitySnapshot" ADD CONSTRAINT "RoomCapacitySnapshot_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupScheduleSnapshot" ADD CONSTRAINT "GroupScheduleSnapshot_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupScheduleSnapshot" ADD CONSTRAINT "GroupScheduleSnapshot_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePriceSnapshot" ADD CONSTRAINT "CoursePriceSnapshot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePriceSnapshot" ADD CONSTRAINT "CoursePriceSnapshot_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentStateLog" ADD CONSTRAINT "EnrollmentStateLog_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentStateLog" ADD CONSTRAINT "EnrollmentStateLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
