-- Postgres treats NULLs in a UNIQUE index as distinct, so
-- Setting_companyId_branchId_key_key does NOT stop a second company-wide
-- row (branchId IS NULL) for the same key. This partial index does. Same
-- pattern as daily_snapshot_company_row_unique.
CREATE UNIQUE INDEX IF NOT EXISTS "setting_company_row_unique"
  ON "Setting" ("companyId", "key")
  WHERE "branchId" IS NULL;
