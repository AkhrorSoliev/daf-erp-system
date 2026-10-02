-- ADR-0048: how many minutes late a student arrived, written only while the
-- lesson runs. Nullable, no default: existing rows stay null.
-- IF NOT EXISTS: a dev database may already carry the column from this
-- migration's earlier name, 20260927220000_attendance_late_minutes.
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "lateMinutes" INTEGER;
