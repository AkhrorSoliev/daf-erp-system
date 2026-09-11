-- AlterTable
ALTER TABLE "DafDialog" ADD COLUMN     "audioKey" TEXT;

-- CreateTable
CREATE TABLE "DafHoerFrage" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "dialogId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "frageDe" TEXT NOT NULL,
    "frageUz" TEXT NOT NULL,
    "richtig" TEXT NOT NULL,
    "falsch" TEXT[],

    CONSTRAINT "DafHoerFrage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DafHoerFrage_code_key" ON "DafHoerFrage"("code");

-- CreateIndex
CREATE INDEX "DafHoerFrage_dialogId_idx" ON "DafHoerFrage"("dialogId");

-- CreateIndex
CREATE UNIQUE INDEX "DafHoerFrage_dialogId_order_key" ON "DafHoerFrage"("dialogId", "order");

-- AddForeignKey
ALTER TABLE "DafHoerFrage" ADD CONSTRAINT "DafHoerFrage_dialogId_fkey" FOREIGN KEY ("dialogId") REFERENCES "DafDialog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
