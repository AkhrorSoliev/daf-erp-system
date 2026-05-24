-- Seed the two fixed/system columns for the Leads Kanban board if they are
-- missing. The original migration (20260521120000_add_leads_board) only
-- created the LeadColumn table; the system rows were seeded by seed.ts /
-- backfill-leads-board.ts, which never ran on production. Without these two
-- rows the /leads board renders empty.
--
-- Idempotent: re-running this is a no-op when both rows are present.

INSERT INTO "LeadColumn" ("id", "name", "order", "isSystem", "systemKey", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'Yangi Lidlar', 0, true, 'NEW', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "LeadColumn" WHERE "systemKey" = 'NEW' AND "deletedAt" IS NULL
);

INSERT INTO "LeadColumn" ("id", "name", "order", "isSystem", "systemKey", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'Aloqaga chiqilgan Lidlar', 1, true, 'CONTACTED', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "LeadColumn" WHERE "systemKey" = 'CONTACTED' AND "deletedAt" IS NULL
);
