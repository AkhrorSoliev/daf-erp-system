-- Deutsch Tutor (AI suhbat) olib tashlandi: jadval, enum va tashqi kalitlar.
-- Xususiyat noldan, boshqa strukturada qayta quriladi.

-- DropForeignKey
ALTER TABLE "AiChatMessage" DROP CONSTRAINT "AiChatMessage_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "AiConversation" DROP CONSTRAINT "AiConversation_studentId_fkey";

-- DropForeignKey
ALTER TABLE "AiConversation" DROP CONSTRAINT "AiConversation_userId_fkey";

-- DropTable
DROP TABLE "AiChatMessage";

-- DropTable
DROP TABLE "AiConversation";

-- DropEnum
DROP TYPE "AiUseCaseType";
