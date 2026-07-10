-- Sticky companion to SalaryAccrual.isCenterTopUp for the center-advance report.
-- TRUE whenever the accrual was EVER center-funded, and never cleared (unlike
-- isCenterTopUp, which flips back to FALSE on recovery). Lets the report compute
-- advanced (Σ wasCenterTopUp), still-fronted (Σ isCenterTopUp), and recovered
-- (Σ wasCenterTopUp AND NOT isCenterTopUp) per teacher/period.
ALTER TABLE "SalaryAccrual" ADD COLUMN "wasCenterTopUp" BOOLEAN NOT NULL DEFAULT false;
