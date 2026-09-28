-- ADR-0047: minutes late when an administrator marks a student present after
-- the lesson's first save. Nullable, no default: existing rows stay null.
ALTER TABLE "Attendance" ADD COLUMN "lateMinutes" INTEGER;
