-- Student chat (spec 2026-10-25). Idempotent, like the other hand-written migrations.
DO $$ BEGIN CREATE TYPE "ChatMessageKind" AS ENUM ('TEXT', 'IMAGE', 'VOICE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ChatWho" AS ENUM ('EVERYONE', 'GROUPMATES', 'NOBODY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ChatFindWho" AS ENUM ('EVERYONE', 'NOBODY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ChatReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "chatBannedAt" TIMESTAMP(3);

-- Prisma cannot express a partial unique index: a username is unique only among live cards.
CREATE UNIQUE INDEX IF NOT EXISTS "Student_username_live_key"
  ON "Student"("username") WHERE "deletedAt" IS NULL AND "username" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "ChatConversation" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "studentLowId" INTEGER NOT NULL,
  "studentHighId" INTEGER NOT NULL,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChatConversation_studentLowId_studentHighId_key"
  ON "ChatConversation"("studentLowId", "studentHighId");
CREATE INDEX IF NOT EXISTS "ChatConversation_studentLowId_lastMessageAt_idx"
  ON "ChatConversation"("studentLowId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "ChatConversation_studentHighId_lastMessageAt_idx"
  ON "ChatConversation"("studentHighId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "ChatConversation_companyId_idx" ON "ChatConversation"("companyId");

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderId" INTEGER NOT NULL,
  "kind" "ChatMessageKind" NOT NULL DEFAULT 'TEXT',
  "text" TEXT,
  "fileKey" TEXT,
  "mime" TEXT,
  "sizeBytes" INTEGER,
  "durationSec" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "mediaPurgedAt" TIMESTAMP(3),
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_createdAt_id_idx"
  ON "ChatMessage"("conversationId", "createdAt", "id");

CREATE TABLE IF NOT EXISTS "ChatReadState" (
  "conversationId" TEXT NOT NULL,
  "studentId" INTEGER NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatReadState_pkey" PRIMARY KEY ("conversationId", "studentId"),
  CONSTRAINT "ChatReadState_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ChatBlock" (
  "blockerId" INTEGER NOT NULL,
  "blockedId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatBlock_pkey" PRIMARY KEY ("blockerId", "blockedId")
);
CREATE INDEX IF NOT EXISTS "ChatBlock_blockedId_idx" ON "ChatBlock"("blockedId");

CREATE TABLE IF NOT EXISTS "ChatPrivacy" (
  "studentId" INTEGER NOT NULL,
  "whoCanWrite" "ChatWho" NOT NULL DEFAULT 'EVERYONE',
  "whoCanFind" "ChatFindWho" NOT NULL DEFAULT 'EVERYONE',
  "whoSeesPhoto" "ChatWho" NOT NULL DEFAULT 'EVERYONE',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatPrivacy_pkey" PRIMARY KEY ("studentId")
);

CREATE TABLE IF NOT EXISTS "ChatReport" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "reporterId" INTEGER NOT NULL,
  "reportedId" INTEGER NOT NULL,
  "conversationId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "status" "ChatReportStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" INTEGER,
  "resolutionNote" TEXT,
  CONSTRAINT "ChatReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChatReport_companyId_status_createdAt_idx"
  ON "ChatReport"("companyId", "status", "createdAt");
