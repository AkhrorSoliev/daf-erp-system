-- Dars qavati: bo'lim ichida bitta o'tirishga mo'ljallangan hajm.
--
-- `DafLexeme.lessonId` NOT NULL, jadvalda esa allaqachon qatorlar bor va
-- SQL ichida ularni to'g'ri darsga biriktiradigan manba yo'q. Shuning
-- uchun lug'at katalogi tozalanadi: u `dib.json` dan QAYTA QURILADIGAN
-- ma'lumot (`npm run daf:seed`), tarixi yo'q va unga hech narsa ishora
-- qilmaydi. `DafExercise` ga esa faqat ixtiyoriy ustun qo'shiladi —
-- unga urinishlar ishora qiladi va u tegilmaydi.
DELETE FROM "DafLexeme";

-- CreateEnum
CREATE TYPE "DafLessonKind" AS ENUM ('VOCAB', 'GRAMMAR');

-- AlterTable
ALTER TABLE "DafLexeme" DROP COLUMN "sectionTitleDe",
DROP COLUMN "sectionTitleUz",
ADD COLUMN     "lessonId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "DafExercise" ADD COLUMN     "lessonId" INTEGER;

-- CreateTable
CREATE TABLE "DafLesson" (
    "id" SERIAL NOT NULL,
    "sourceId" TEXT NOT NULL,
    "unitId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "DafLessonKind" NOT NULL,
    "titleDe" TEXT NOT NULL,
    "titleUz" TEXT,
    "translationSource" "DafTranslationSource",
    "grammarId" INTEGER,

    CONSTRAINT "DafLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DafLesson_sourceId_key" ON "DafLesson"("sourceId");

-- CreateIndex
CREATE INDEX "DafLesson_unitId_idx" ON "DafLesson"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "DafLesson_unitId_order_key" ON "DafLesson"("unitId", "order");

-- CreateIndex
CREATE INDEX "DafLexeme_lessonId_idx" ON "DafLexeme"("lessonId");

-- CreateIndex
CREATE INDEX "DafExercise_lessonId_idx" ON "DafExercise"("lessonId");

-- AddForeignKey
ALTER TABLE "DafLesson" ADD CONSTRAINT "DafLesson_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DafUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafLesson" ADD CONSTRAINT "DafLesson_grammarId_fkey" FOREIGN KEY ("grammarId") REFERENCES "DafGrammar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafLexeme" ADD CONSTRAINT "DafLexeme_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "DafLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafExercise" ADD CONSTRAINT "DafExercise_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "DafLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

