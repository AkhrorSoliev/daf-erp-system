-- CreateEnum
CREATE TYPE "DafSentenceOrigin" AS ENUM ('GENERATED', 'SOURCE');

-- AlterEnum
-- Enum O'RNIGA QO'YILADI, o'chirilmaydi: eski qiymatlar yangisiga
-- ko'chiriladi, shuning uchun mavjud bo'limlar yo'qolmaydi. Prisma'ning
-- o'zi chiqargan variant enumni "o'chir va qayta yarat" qilib, ustunni
-- to'g'ridan-to'g'ri eski matn nomi bilan yangi tipga cast qilardi — bu
-- ishlamaydi, chunki 'A1_1' kabi qiymatlar yangi tipda umuman yo'q.
--
-- `@@unique([level, order])` indeksi OLDINDAN o'chiriladi: `ALTER COLUMN
-- ... TYPE` jadvalni qayta yozadi va shu zahoti indeksni ESKI `order`
-- qiymatlari bilan tekshiradi — A1_1/A1_2 ikkalasi ham A1'ga tushgani
-- uchun (A1, 1) darhol ikki marta chiqadi. `order` pastda `id`ga
-- tenglashtirilgach, indeks qayta tiklanadi.
DROP INDEX "DafUnit_level_order_key";

CREATE TYPE "DafLevel_new" AS ENUM ('A1', 'A2', 'B1');

ALTER TABLE "DafUnit" ALTER COLUMN "level" TYPE "DafLevel_new"
  USING (CASE
    WHEN "level"::text IN ('A1_1','A1_2') THEN 'A1'
    WHEN "level"::text IN ('A2_1','A2_2') THEN 'A2'
    ELSE 'B1' END)::"DafLevel_new";

-- `DafGrammar.level` ixtiyoriy — NULL qiymat mavjud (mavzuga bog'lanmagan
-- grammatika qoidalari). CASE'da mos kelmagan holat ELSE'ga tushib
-- ularni xato ravishda 'B1'ga aylantirmasligi uchun NULL alohida saqlanadi.
ALTER TABLE "DafGrammar" ALTER COLUMN "level" TYPE "DafLevel_new"
  USING (CASE
    WHEN "level" IS NULL THEN NULL
    WHEN "level"::text IN ('A1_1','A1_2') THEN 'A1'
    WHEN "level"::text IN ('A2_1','A2_2') THEN 'A2'
    ELSE 'B1' END)::"DafLevel_new";

DROP TYPE "DafLevel";
ALTER TYPE "DafLevel_new" RENAME TO "DafLevel";

-- Tartib vaqtincha `id`ga tenglashtiriladi, yakuniy tartibni seed
-- yozadi. Ikki bosqichda: to'g'ridan-to'g'ri `order = id` ba'zi
-- qatorlar uchun boshqa qatorning HALI YANGILANMAGAN eski qiymati
-- bilan to'qnashishi mumkin edi (bir xil UPDATE ichida), shuning
-- uchun avval hech qachon mavjud bo'lmagan manfiy qiymatga o'tkaziladi.
UPDATE "DafUnit" SET "order" = -"id";
UPDATE "DafUnit" SET "order" = "id";

CREATE UNIQUE INDEX "DafUnit_level_order_key" ON "DafUnit"("level", "order");

-- `kind` -> `tier`. Eski qiymat yo'qoladi, chunki VOCAB/GRAMMAR
-- ajratimi butunlay bekor qilindi; darslar seed tomonidan qayta
-- quriladi. Vaqtinchalik qiymat sifatida eski `order` ishlatiladi —
-- u allaqachon (unitId, order) bo'yicha yagona edi, shuning uchun
-- pastdagi yangi (unitId, tier) unique indeksi ham darhol qanoat
-- qiladi (bitta `DEFAULT 1` esa bir bo'limdagi barcha darslarni bir
-- xil qiymatga tenglashtirib, xuddi shu indeksni P2002 bilan yiqitardi).
ALTER TABLE "DafLesson" DROP COLUMN "kind";
ALTER TABLE "DafLesson" ADD COLUMN "tier" INTEGER;
UPDATE "DafLesson" SET "tier" = "order";
ALTER TABLE "DafLesson" ALTER COLUMN "tier" SET NOT NULL;
DROP INDEX IF EXISTS "DafLesson_unitId_order_key";
DROP TYPE IF EXISTS "DafLessonKind";

-- AlterTable
ALTER TABLE "DafLexeme" ADD COLUMN     "picturable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DafSentence" (
    "id" SERIAL NOT NULL,
    "unitId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "de" TEXT NOT NULL,
    "uz" TEXT NOT NULL,
    "audioKey" TEXT,
    "wordCount" INTEGER NOT NULL,
    "origin" "DafSentenceOrigin" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafSentence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DafLexemeState" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "lexemeId" INTEGER NOT NULL,
    "strength" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "DafLexemeState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DafLessonProgress" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "lessonId" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "DafLessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DafSentence_unitId_idx" ON "DafSentence"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "DafSentence_unitId_order_key" ON "DafSentence"("unitId", "order");

-- CreateIndex
CREATE INDEX "DafLexemeState_studentId_dueAt_idx" ON "DafLexemeState"("studentId", "dueAt");

-- CreateIndex
CREATE INDEX "DafLexemeState_companyId_idx" ON "DafLexemeState"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DafLexemeState_studentId_lexemeId_key" ON "DafLexemeState"("studentId", "lexemeId");

-- CreateIndex
CREATE INDEX "DafLessonProgress_studentId_idx" ON "DafLessonProgress"("studentId");

-- CreateIndex
CREATE INDEX "DafLessonProgress_companyId_idx" ON "DafLessonProgress"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DafLessonProgress_studentId_lessonId_key" ON "DafLessonProgress"("studentId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "DafLesson_unitId_tier_key" ON "DafLesson"("unitId", "tier");

-- AddForeignKey
ALTER TABLE "DafSentence" ADD CONSTRAINT "DafSentence_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DafUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafLexemeState" ADD CONSTRAINT "DafLexemeState_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafLexemeState" ADD CONSTRAINT "DafLexemeState_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "DafLexeme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafLessonProgress" ADD CONSTRAINT "DafLessonProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafLessonProgress" ADD CONSTRAINT "DafLessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "DafLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
