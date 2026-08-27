
-- CreateEnum
CREATE TYPE "DafLevel" AS ENUM ('A1_1', 'A1_2', 'A2_1', 'A2_2', 'B1');

-- CreateEnum
CREATE TYPE "DafExerciseKind" AS ENUM ('GAP', 'MC', 'CLOZE', 'REORDER', 'FREE_WRITE');

-- CreateEnum
CREATE TYPE "DafAnswerStatus" AS ENUM ('FROM_SOURCE', 'PARTIAL', 'OPEN');

-- CreateEnum
CREATE TYPE "DafTranslationSource" AS ENUM ('MODEL', 'TEACHER');

-- CreateTable
CREATE TABLE "DafUnit" (
    "id" SERIAL NOT NULL,
    "level" "DafLevel" NOT NULL,
    "order" INTEGER NOT NULL,
    "titleUz" TEXT NOT NULL,
    "titleDe" TEXT NOT NULL,
    "sourceChapter" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DafLexeme" (
    "id" SERIAL NOT NULL,
    "sourceId" TEXT NOT NULL,
    "unitId" INTEGER NOT NULL,
    "de" TEXT NOT NULL,
    "en" TEXT NOT NULL,
    "uz" TEXT,
    "translationSource" "DafTranslationSource",
    "audioKey" TEXT,
    "imageKey" TEXT,
    "sectionTitleDe" TEXT NOT NULL,
    "sectionTitleUz" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "DafLexeme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DafGrammar" (
    "id" SERIAL NOT NULL,
    "sourceId" TEXT NOT NULL,
    "unitId" INTEGER,
    "code" TEXT NOT NULL,
    "titleDe" TEXT NOT NULL,
    "titleUz" TEXT,
    "explanationEn" TEXT NOT NULL,
    "explanationUz" TEXT,
    "translationSource" "DafTranslationSource",
    "level" "DafLevel",

    CONSTRAINT "DafGrammar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DafExercise" (
    "id" SERIAL NOT NULL,
    "sourceId" TEXT NOT NULL,
    "unitId" INTEGER,
    "grammarId" INTEGER,
    "kind" "DafExerciseKind" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT[],
    "answers" JSONB NOT NULL,
    "answerStatus" "DafAnswerStatus" NOT NULL,
    "slots" INTEGER[],
    "sourceSetCode" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "DafExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DafAttempt" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "given" JSONB NOT NULL,
    "durationMs" INTEGER,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "groupId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DafAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DafUnit_level_idx" ON "DafUnit"("level");

-- CreateIndex
CREATE UNIQUE INDEX "DafUnit_level_order_key" ON "DafUnit"("level", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DafLexeme_sourceId_key" ON "DafLexeme"("sourceId");

-- CreateIndex
CREATE INDEX "DafLexeme_unitId_idx" ON "DafLexeme"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "DafGrammar_sourceId_key" ON "DafGrammar"("sourceId");

-- CreateIndex
CREATE INDEX "DafGrammar_unitId_idx" ON "DafGrammar"("unitId");

-- CreateIndex
CREATE INDEX "DafGrammar_code_idx" ON "DafGrammar"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DafExercise_sourceId_key" ON "DafExercise"("sourceId");

-- CreateIndex
CREATE INDEX "DafExercise_unitId_idx" ON "DafExercise"("unitId");

-- CreateIndex
CREATE INDEX "DafExercise_grammarId_idx" ON "DafExercise"("grammarId");

-- CreateIndex
CREATE INDEX "DafExercise_retiredAt_idx" ON "DafExercise"("retiredAt");

-- CreateIndex
CREATE INDEX "DafAttempt_studentId_createdAt_idx" ON "DafAttempt"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "DafAttempt_exerciseId_idx" ON "DafAttempt"("exerciseId");

-- CreateIndex
CREATE INDEX "DafAttempt_companyId_createdAt_idx" ON "DafAttempt"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "DafAttempt_branchId_createdAt_idx" ON "DafAttempt"("branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "DafLexeme" ADD CONSTRAINT "DafLexeme_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DafUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafGrammar" ADD CONSTRAINT "DafGrammar_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DafUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafExercise" ADD CONSTRAINT "DafExercise_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DafUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafExercise" ADD CONSTRAINT "DafExercise_grammarId_fkey" FOREIGN KEY ("grammarId") REFERENCES "DafGrammar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafAttempt" ADD CONSTRAINT "DafAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafAttempt" ADD CONSTRAINT "DafAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "DafExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

