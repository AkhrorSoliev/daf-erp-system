-- Adds a new LessonDeductionMode value for per-lesson uncovered deductions.
--
-- SINGLE_UNCOVERED is written when a student attends a lesson but their
-- balance can't cover even one discounted lesson cost. Instead of skipping
-- the deduction (the old behaviour, which masked accumulating debt at a
-- single-lesson display ceiling), the billing service now records a real
-- LESSON_DEDUCTION row, allows the balance to go negative, and tags the
-- metadata with `mode: 'SINGLE_UNCOVERED'` plus `salaryDeferred: true` so
-- the teacher's SalaryAccrual is held until a payment lands and covers it.
ALTER TYPE "LessonDeductionMode" ADD VALUE 'SINGLE_UNCOVERED';
