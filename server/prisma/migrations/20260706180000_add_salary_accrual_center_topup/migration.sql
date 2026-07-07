-- Faza 2: center top-up marker on SalaryAccrual.
-- TRUE when the accrual was funded by the center at calculation time for an
-- uncovered ("gap") lesson (full-deserved payroll from July 2026). Flipped back
-- to FALSE when the student later pays and the lesson becomes genuinely covered.
ALTER TABLE "SalaryAccrual" ADD COLUMN "isCenterTopUp" BOOLEAN NOT NULL DEFAULT false;
