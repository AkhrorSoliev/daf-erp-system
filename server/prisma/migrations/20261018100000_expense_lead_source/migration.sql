-- ADR-0109: a MARKETING expense may name the lead source (channel) it paid for.
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "leadSourceId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Expense_leadSourceId_fkey'
  ) THEN
    ALTER TABLE "Expense"
      ADD CONSTRAINT "Expense_leadSourceId_fkey"
      FOREIGN KEY ("leadSourceId") REFERENCES "LeadSource"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Expense_leadSourceId_idx" ON "Expense"("leadSourceId");
