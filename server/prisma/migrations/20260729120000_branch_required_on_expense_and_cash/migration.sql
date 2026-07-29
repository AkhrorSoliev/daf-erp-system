-- Every expense and every cash account belongs to exactly one branch.
--
-- Each branch's profit is its own income minus its OWN costs, so there is no
-- company-level "shared" bucket (docs/branch-decisions.md D4). The nullable
-- column allowed a branch-less row, which then belonged to no branch's P&L —
-- and the null-branch cash account silently absorbed branch outflows until it
-- drifted to −1 107 000 so'm while the branch's balance stayed that much too
-- high.
--
-- Pre-flight measured on PROD 2026-07-29: Expense has 0 branch-less rows;
-- CashAccount has 2, both already archived (the legacy company-wide pair,
-- drained and soft-deleted by scripts/close-branchless-cash-accounts.ts).

-- 1. Park the drained, archived company-wide accounts on branch 1 so the
--    column can be made NOT NULL. They are soft-deleted and invisible; their
--    historical movements keep branchId NULL on purpose — the branch-1 side of
--    that money is already represented by the compensating transfer, and
--    stamping the originals too would double-count them in branch reports.
UPDATE "CashAccount"
SET "branchId" = 1
WHERE "branchId" IS NULL AND "deletedAt" IS NOT NULL;

-- 2. Require a branch from here on.
ALTER TABLE "Expense" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "CashAccount" ALTER COLUMN "branchId" SET NOT NULL;

-- 3. One account per (company, branch, type). Partial, per the project's
--    soft-delete convention, so archived rows never block a fresh account —
--    which is exactly what the two parked rows above would otherwise do.
CREATE UNIQUE INDEX IF NOT EXISTS "cash_account_company_branch_type_unique"
  ON "CashAccount" ("companyId", "branchId", "type")
  WHERE "deletedAt" IS NULL;

-- 4. Expenses are read branch-first now that the list actually filters by it.
CREATE INDEX IF NOT EXISTS "Expense_branchId_idx" ON "Expense" ("branchId");
