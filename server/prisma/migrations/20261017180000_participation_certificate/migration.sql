-- Teilnahmebestätigung (spec 2026-10-17): one row per issued document,
-- the count sealed in `snapshot`. Idempotent, like the other hand-written
-- migrations here.
CREATE TABLE IF NOT EXISTS "ParticipationCertificate" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "studentId" INTEGER NOT NULL,
  "level" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "seq" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedById" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "exemptReason" TEXT,
  "exemptById" INTEGER,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" TEXT,
  CONSTRAINT "ParticipationCertificate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ParticipationCertificate_companyId_year_seq_key"
  ON "ParticipationCertificate"("companyId", "year", "seq");

CREATE INDEX IF NOT EXISTS "ParticipationCertificate_studentId_level_idx"
  ON "ParticipationCertificate"("studentId", "level");
