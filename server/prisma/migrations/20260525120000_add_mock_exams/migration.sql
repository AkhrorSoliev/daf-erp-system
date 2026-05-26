-- CreateEnum
CREATE TYPE "MockExamStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'GRADING', 'ANNOUNCED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "MockExamSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "createdById" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "deletionBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockExamSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockExam" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "MockExamStatus" NOT NULL DEFAULT 'DRAFT',
    "sectionId" TEXT NOT NULL,
    "examDate" TIMESTAMP(3),
    "registrationDeadline" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "passingScore" DOUBLE PRECISION,
    "formFields" JSONB NOT NULL DEFAULT '[]',
    "botStartPayload" TEXT NOT NULL,
    "announcedAt" TIMESTAMP(3),
    "announcedById" INTEGER,
    "announceMessageTemplate" TEXT,
    "createdById" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "deletionBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockExamSubject" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockExamSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockExamParticipant" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "telegramFirstName" TEXT,
    "telegramLastName" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "formData" JSONB NOT NULL DEFAULT '{}',
    "studentId" INTEGER,
    "convertedAt" TIMESTAMP(3),
    "convertedById" INTEGER,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalScore" DOUBLE PRECISION,
    "percentage" DOUBLE PRECISION,
    "passed" BOOLEAN,
    "feedback" TEXT,
    "rank" INTEGER,
    "gradedAt" TIMESTAMP(3),
    "gradedById" INTEGER,
    "resultSentAt" TIMESTAMP(3),
    "resultMessageId" TEXT,
    "resultSendError" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "deletionBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockExamParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockExamSubjectScore" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockExamSubjectScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MockExamSection_deletedAt_idx" ON "MockExamSection"("deletedAt");

-- CreateIndex
CREATE INDEX "MockExamSection_order_idx" ON "MockExamSection"("order");

-- CreateIndex
CREATE UNIQUE INDEX "MockExam_botStartPayload_key" ON "MockExam"("botStartPayload");

-- CreateIndex
CREATE INDEX "MockExam_sectionId_status_idx" ON "MockExam"("sectionId", "status");

-- CreateIndex
CREATE INDEX "MockExam_deletedAt_idx" ON "MockExam"("deletedAt");

-- CreateIndex
CREATE INDEX "MockExam_registrationDeadline_idx" ON "MockExam"("registrationDeadline");

-- CreateIndex
CREATE INDEX "MockExam_status_idx" ON "MockExam"("status");

-- CreateIndex
CREATE INDEX "MockExamSubject_examId_idx" ON "MockExamSubject"("examId");

-- CreateIndex
CREATE INDEX "MockExamParticipant_examId_deletedAt_idx" ON "MockExamParticipant"("examId", "deletedAt");

-- CreateIndex
CREATE INDEX "MockExamParticipant_studentId_idx" ON "MockExamParticipant"("studentId");

-- CreateIndex
CREATE INDEX "MockExamParticipant_phone_idx" ON "MockExamParticipant"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "MockExamParticipant_examId_telegramChatId_key" ON "MockExamParticipant"("examId", "telegramChatId");

-- CreateIndex
CREATE INDEX "MockExamSubjectScore_subjectId_idx" ON "MockExamSubjectScore"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "MockExamSubjectScore_participantId_subjectId_key" ON "MockExamSubjectScore"("participantId", "subjectId");

-- AddForeignKey
ALTER TABLE "MockExamSection" ADD CONSTRAINT "MockExamSection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExamSection" ADD CONSTRAINT "MockExamSection_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExam" ADD CONSTRAINT "MockExam_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "MockExamSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExam" ADD CONSTRAINT "MockExam_announcedById_fkey" FOREIGN KEY ("announcedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExam" ADD CONSTRAINT "MockExam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExam" ADD CONSTRAINT "MockExam_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExamSubject" ADD CONSTRAINT "MockExamSubject_examId_fkey" FOREIGN KEY ("examId") REFERENCES "MockExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExamParticipant" ADD CONSTRAINT "MockExamParticipant_examId_fkey" FOREIGN KEY ("examId") REFERENCES "MockExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExamParticipant" ADD CONSTRAINT "MockExamParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExamSubjectScore" ADD CONSTRAINT "MockExamSubjectScore_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "MockExamParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExamSubjectScore" ADD CONSTRAINT "MockExamSubjectScore_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "MockExamSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
