-- Drop the CompanyTaxConfig table — no service reads it any more.
DROP TABLE IF EXISTS "CompanyTaxConfig";

-- Collapse SalaryPayment gross/tax/net into a single amount column.
-- Existing rows: copy grossAmount into the new column so paid-out totals
-- reflect what was earned (the same number that was previously stored in
-- grossAmount). Tax-related fields are then removed entirely.
ALTER TABLE "SalaryPayment" ADD COLUMN "amount" INTEGER;
UPDATE "SalaryPayment" SET "amount" = "grossAmount";
ALTER TABLE "SalaryPayment" ALTER COLUMN "amount" SET NOT NULL;
ALTER TABLE "SalaryPayment" DROP COLUMN "grossAmount";
ALTER TABLE "SalaryPayment" DROP COLUMN "taxAmount";
ALTER TABLE "SalaryPayment" DROP COLUMN "netAmount";
