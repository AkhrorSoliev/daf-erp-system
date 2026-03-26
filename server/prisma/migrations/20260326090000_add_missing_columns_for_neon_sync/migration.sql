-- AlterTable
ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "phone" TEXT,
ADD COLUMN IF NOT EXISTS "subdomain" TEXT;

-- AlterTable
ALTER TABLE "Student"
ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;

-- AlterTable
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Student_telegramChatId_key" ON "Student"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramChatId_key" ON "User"("telegramChatId");
