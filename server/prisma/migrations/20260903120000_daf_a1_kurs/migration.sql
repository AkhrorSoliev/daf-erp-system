-- CreateEnum
CREATE TYPE "DafLessonKind" AS ENUM ('SECTION_A', 'SECTION_B', 'BRIDGE', 'UNIT_TEST');

-- DropIndex
DROP INDEX "DafLesson_unitId_tier_key";

-- AlterTable
ALTER TABLE "DafUnit" ADD COLUMN     "code" TEXT,
ADD COLUMN     "retiredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DafLesson" ADD COLUMN     "kind" "DafLessonKind",
ADD COLUMN     "sectionId" INTEGER,
ALTER COLUMN "tier" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DafSection" (
    "id" SERIAL NOT NULL,
    "unitId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "titleDe" TEXT NOT NULL,
    "titleUz" TEXT NOT NULL,
    "grammar" TEXT NOT NULL,
    "grammarUz" TEXT NOT NULL,
    "wordBudget" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DafSection_code_key" ON "DafSection"("code");

-- CreateIndex
CREATE INDEX "DafSection_unitId_idx" ON "DafSection"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "DafSection_unitId_order_key" ON "DafSection"("unitId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DafUnit_code_key" ON "DafUnit"("code");

-- AddForeignKey
ALTER TABLE "DafLesson" ADD CONSTRAINT "DafLesson_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "DafSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafSection" ADD CONSTRAINT "DafSection_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DafUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Eski DiB bo'limlari nafaqaga chiqadi. O'chirilmaydi: ularning lug'ati,
-- tarjimasi va audiosi yangi kurs uchun zaxira. Tartib raqami manfiyga
-- o'tkaziladi, chunki yangi 12 unit 1..12 ni egallaydi.
UPDATE "DafUnit"
   SET "retiredAt" = NOW(),
       "order" = -"id"
 WHERE "level" = 'A1' AND "retiredAt" IS NULL;
