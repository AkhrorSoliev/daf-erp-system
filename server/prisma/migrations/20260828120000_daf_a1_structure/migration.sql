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
-- uchun (A1, 1) darhol ikki marta chiqadi. `order` pastda qayta
-- raqamlangach, indeks qayta tiklanadi.
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

-- Tartib mavjud NISBIY ketma-ketlikni saqlab, har darajada 1..n uzluksiz
-- qilib qayta raqamlanadi (`row_number() OVER (PARTITION BY level ORDER
-- BY order, id)`) — yakuniy tartibni seed yozadi, lekin seed yugurmasa
-- ham baza mazmunli qolishi kerak. `order = id` buni buzardi: id butun
-- jadval bo'yicha ketma-ket, `level` bo'yicha esa emas, shuning uchun
-- boshqaruvchi qo'ygan nisbiy tartib id'larning tasodifiy ketma-ketligiga
-- almashib ketardi.
--
-- Yagona UPDATE — yuqorida o'chirilgan indeks bu yerda hali tiklanmagan,
-- shuning uchun oraliq to'qnashuvdan qo'rqishning hojati yo'q (avvalgi
-- variantdagi ikki bosqichli manfiy-qiymat siljitishi hech narsani
-- himoya qilmasdi, chunki himoya qiladigan indeksning o'zi yo'q edi).
UPDATE "DafUnit" AS u
SET "order" = ranked.rn
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "level" ORDER BY "order", "id") AS rn
  FROM "DafUnit"
) AS ranked
WHERE u."id" = ranked."id";

CREATE UNIQUE INDEX "DafUnit_level_order_key" ON "DafUnit"("level", "order");

-- DafLesson: eski dars qatorlari YANGI MODELDA MA'NOSIZ. Bu yerda
-- avvalroq `tier`ga eski `order` ko'chirilgan edi — lekin bo'limda 26
-- tagacha dars bo'lgani uchun `tier` hujjatlashtirilgan 1–5 oralig'idan
-- chiqib ketardi, va 3-task seed `tier`ni haqiqiy 1–5 ga qayta yozganda
-- `@@unique([unitId, tier])` bo'yicha to'qnashuv (P2002) berardi.
--
-- `kind` (VOCAB/GRAMMAR) butunlay bekor qilingani uchun bu ajratim
-- ma'nosini yo'qotdi, 3-task esa har bo'limda ANIQ 5 ta darsni
-- `a1-units.json`dan QAYTA quradi — eski 26 darslik bo'lim aynan
-- yo'q qilinayotgan narsa. `DafLessonProgress` hali bo'sh (jadval
-- shu migratsiyada yaratilyapti), `DafAttempt` esa darsga emas, mashq
-- va so'zga bog'langan — ya'ni eski dars qatorlarini saqlashning
-- hech qanday foydasi yo'q.
--
-- Shuning uchun qatorlarning o'zi olib tashlanadi. So'z (`DafLexeme`)
-- va mashqlar (`DafExercise`) — HAQIQIY lug'at, yo'qotib bo'lmaydi —
-- avval darsdan uziladi (FK NULL), keyin seed ularni qayta bog'laydi.
--
-- `DafLexeme.lessonId` endi ixtiyoriy: so'z endi BO'LIMga tegishli,
-- darsga emas. FK ham shunga mos ravishda `ON DELETE SET NULL`ga
-- almashtiriladi (`DafExercise.lessonId`da allaqachon shunday) — aks
-- holda ixtiyoriy ustunda ham eski `RESTRICT` qolib, kelajakda darsni
-- o'chirish so'zni ushlab qolib, xatoga sabab bo'lardi.
ALTER TABLE "DafLexeme" ALTER COLUMN "lessonId" DROP NOT NULL;
ALTER TABLE "DafLexeme" DROP CONSTRAINT "DafLexeme_lessonId_fkey";
ALTER TABLE "DafLexeme" ADD CONSTRAINT "DafLexeme_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "DafLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "DafLexeme" SET "lessonId" = NULL;
UPDATE "DafExercise" SET "lessonId" = NULL;
DELETE FROM "DafLesson";

ALTER TABLE "DafLesson" DROP COLUMN "kind";
-- Jadval shu nuqtada BO'SH: `DEFAULT` ham, ikki bosqichli siljitish ham
-- kerak emas — to'g'ridan-to'g'ri NOT NULL qo'yiladi.
ALTER TABLE "DafLesson" ADD COLUMN "tier" INTEGER NOT NULL;
DROP INDEX "DafLesson_unitId_order_key";
DROP TYPE "DafLessonKind";

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
