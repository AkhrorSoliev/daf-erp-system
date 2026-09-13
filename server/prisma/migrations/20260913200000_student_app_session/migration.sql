-- CreateEnum
CREATE TYPE "AppPlatform" AS ENUM ('WEB', 'ANDROID', 'IOS');

-- CreateTable
CREATE TABLE "StudentAppSession" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "platform" "AppPlatform" NOT NULL,
    "appVersion" TEXT,
    "day" DATE NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "radioSeconds" INTEGER NOT NULL DEFAULT 0,
    "sections" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentAppSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentAppSession_studentId_day_idx" ON "StudentAppSession"("studentId", "day");

-- CreateIndex
CREATE INDEX "StudentAppSession_companyId_day_idx" ON "StudentAppSession"("companyId", "day");

-- CreateIndex
CREATE INDEX "StudentAppSession_branchId_day_idx" ON "StudentAppSession"("branchId", "day");

-- AddForeignKey
ALTER TABLE "StudentAppSession" ADD CONSTRAINT "StudentAppSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
