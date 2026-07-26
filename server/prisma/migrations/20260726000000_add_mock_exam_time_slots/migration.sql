-- AlterTable: exam time slots (offered on examDate) + participant's chosen time
ALTER TABLE "MockExam" ADD COLUMN     "examTimes" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "MockExamParticipant" ADD COLUMN     "examTime" TEXT;
