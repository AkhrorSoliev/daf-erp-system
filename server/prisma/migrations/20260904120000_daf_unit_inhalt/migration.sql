-- AlterTable
ALTER TABLE "DafLexeme" ADD COLUMN     "anzeige" TEXT,
ADD COLUMN     "artikel" TEXT,
ADD COLUMN     "plural" TEXT,
ADD COLUMN     "sectionId" INTEGER,
ADD COLUMN     "tts" TEXT;

-- AlterTable
ALTER TABLE "DafGrammar" ADD COLUMN     "erklaerungUz" TEXT,
ADD COLUMN     "sectionId" INTEGER;

-- AlterTable
ALTER TABLE "DafSentence" ADD COLUMN     "sectionId" INTEGER,
ADD COLUMN     "tts" TEXT;

-- CreateTable
CREATE TABLE "DafGrammarBeispiel" (
    "id" SERIAL NOT NULL,
    "grammarId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "de" TEXT NOT NULL,
    "tts" TEXT,
    "uz" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DafGrammarBeispiel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DafDialog" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "unitId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "titelDe" TEXT NOT NULL,
    "titelUz" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafDialog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DafDialogLine" (
    "id" SERIAL NOT NULL,
    "dialogId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "sprecher" TEXT NOT NULL,
    "de" TEXT NOT NULL,
    "tts" TEXT,
    "uz" TEXT NOT NULL,
    "audioKey" TEXT,

    CONSTRAINT "DafDialogLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DafPhrase" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "unitId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "funktion" TEXT NOT NULL,
    "funktionUz" TEXT NOT NULL,
    "de" TEXT NOT NULL,
    "tts" TEXT,
    "uz" TEXT NOT NULL,
    "audioKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafPhrase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DafGrammarBeispiel_grammarId_idx" ON "DafGrammarBeispiel"("grammarId");

-- CreateIndex
CREATE UNIQUE INDEX "DafGrammarBeispiel_grammarId_order_key" ON "DafGrammarBeispiel"("grammarId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DafDialog_code_key" ON "DafDialog"("code");

-- CreateIndex
CREATE INDEX "DafDialog_sectionId_idx" ON "DafDialog"("sectionId");

-- CreateIndex
CREATE INDEX "DafDialogLine_dialogId_idx" ON "DafDialogLine"("dialogId");

-- CreateIndex
CREATE UNIQUE INDEX "DafDialogLine_dialogId_order_key" ON "DafDialogLine"("dialogId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DafPhrase_code_key" ON "DafPhrase"("code");

-- CreateIndex
CREATE INDEX "DafPhrase_sectionId_idx" ON "DafPhrase"("sectionId");

-- AddForeignKey
ALTER TABLE "DafLexeme" ADD CONSTRAINT "DafLexeme_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "DafSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafGrammar" ADD CONSTRAINT "DafGrammar_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "DafSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafGrammarBeispiel" ADD CONSTRAINT "DafGrammarBeispiel_grammarId_fkey" FOREIGN KEY ("grammarId") REFERENCES "DafGrammar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafDialog" ADD CONSTRAINT "DafDialog_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DafUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafDialog" ADD CONSTRAINT "DafDialog_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "DafSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafDialogLine" ADD CONSTRAINT "DafDialogLine_dialogId_fkey" FOREIGN KEY ("dialogId") REFERENCES "DafDialog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafPhrase" ADD CONSTRAINT "DafPhrase_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DafUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafPhrase" ADD CONSTRAINT "DafPhrase_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "DafSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafSentence" ADD CONSTRAINT "DafSentence_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "DafSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

