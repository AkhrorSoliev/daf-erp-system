-- Add AttendanceMethod enum and Attendance.markedMethod column.
-- Schema had these but no prior migration introduced them — reset would
-- otherwise fail when code tries to insert markedMethod.

CREATE TYPE "AttendanceMethod" AS ENUM ('MANUAL', 'QR');

ALTER TABLE "Attendance"
  ADD COLUMN "markedMethod" "AttendanceMethod" NOT NULL DEFAULT 'MANUAL';
