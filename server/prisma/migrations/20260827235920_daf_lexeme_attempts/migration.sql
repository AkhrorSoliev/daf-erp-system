-- Urinish endi YO grammatika mashqiga, YO lug'at so'ziga tegishli.
-- Lug'at mashqlari bazada saqlanmaydi: ular lug'atdan har safar qayta
-- tug'iladi, chunki lug'at o'zgarganda savol ham o'zgarishi kerak.

-- DropForeignKey
ALTER TABLE "DafAttempt" DROP CONSTRAINT "DafAttempt_exerciseId_fkey";

-- AlterTable
ALTER TABLE "DafAttempt" ADD COLUMN     "lexemeId" INTEGER,
ALTER COLUMN "exerciseId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "DafAttempt_lexemeId_idx" ON "DafAttempt"("lexemeId");

-- AddForeignKey
ALTER TABLE "DafAttempt" ADD CONSTRAINT "DafAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "DafExercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafAttempt" ADD CONSTRAINT "DafAttempt_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "DafLexeme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

