-- CreateEnum
CREATE TYPE "DafBattleQuestionKind" AS ENUM ('CHOOSE', 'TYPE', 'LISTEN');

-- CreateEnum
CREATE TYPE "DafBattleQuestionStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "DafBattleOpponent" AS ENUM ('GHOST', 'BOT');

-- CreateEnum
CREATE TYPE "DafBattleStatus" AS ENUM ('OPEN', 'DONE', 'ABANDONED');

-- CreateEnum
CREATE TYPE "DafBattleResult" AS ENUM ('WIN', 'LOSS', 'DRAW');

-- CreateTable
CREATE TABLE "DafBattleQuestion" (
    "id" SERIAL NOT NULL,
    "sourceId" TEXT NOT NULL,
    "unitId" INTEGER NOT NULL,
    "kind" "DafBattleQuestionKind" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answer" TEXT NOT NULL,
    "akzeptiert" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audioKey" TEXT,
    "audioStartMs" INTEGER,
    "audioEndMs" INTEGER,
    "status" "DafBattleQuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafBattleQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DafBattle" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "opponent" "DafBattleOpponent" NOT NULL,
    "ghostBattleId" INTEGER,
    "questionIds" INTEGER[],
    "botAnswers" JSONB,
    "status" "DafBattleStatus" NOT NULL DEFAULT 'OPEN',
    "result" "DafBattleResult",
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "totalMs" INTEGER NOT NULL DEFAULT 0,
    "opponentCorrect" INTEGER NOT NULL DEFAULT 0,
    "opponentMs" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DafBattle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DafBattleAnswer" (
    "id" SERIAL NOT NULL,
    "battleId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "given" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "ms" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DafBattleAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DafBattleQuestion_sourceId_key" ON "DafBattleQuestion"("sourceId");

-- CreateIndex
CREATE INDEX "DafBattleQuestion_unitId_status_idx" ON "DafBattleQuestion"("unitId", "status");

-- CreateIndex
CREATE INDEX "DafBattle_studentId_createdAt_idx" ON "DafBattle"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "DafBattle_companyId_status_finishedAt_idx" ON "DafBattle"("companyId", "status", "finishedAt");

-- CreateIndex
CREATE INDEX "DafBattle_studentId_status_finishedAt_idx" ON "DafBattle"("studentId", "status", "finishedAt");

-- CreateIndex
CREATE INDEX "DafBattleAnswer_questionId_idx" ON "DafBattleAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "DafBattleAnswer_battleId_position_key" ON "DafBattleAnswer"("battleId", "position");

-- AddForeignKey
ALTER TABLE "DafBattleQuestion" ADD CONSTRAINT "DafBattleQuestion_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DafUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafBattle" ADD CONSTRAINT "DafBattle_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafBattle" ADD CONSTRAINT "DafBattle_ghostBattleId_fkey" FOREIGN KEY ("ghostBattleId") REFERENCES "DafBattle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafBattleAnswer" ADD CONSTRAINT "DafBattleAnswer_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "DafBattle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DafBattleAnswer" ADD CONSTRAINT "DafBattleAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DafBattleQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
