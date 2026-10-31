-- ADR-0143: a lesson the student was kept out of for non-payment and later
-- paid for is marked PRESENT by the payment, but earns the teacher nothing.
-- Existing rows stay false.
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "teacherPayWaived" BOOLEAN NOT NULL DEFAULT false;
