-- AlterTable: DaF-student discounted price + offered CEFR levels on a mock exam
ALTER TABLE "MockExam" ADD COLUMN     "offeredLevels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "studentPrice" INTEGER;

-- AlterTable: per-participant chosen level + locked-in fee (after DaF discount)
ALTER TABLE "MockExamParticipant" ADD COLUMN     "feeAmount" INTEGER,
ADD COLUMN     "level" TEXT;
