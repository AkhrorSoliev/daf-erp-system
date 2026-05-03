-- Add Branch.workingDays — defaults to Mon-Sat (no Sunday) which is the
-- typical school week. Existing rows get the default automatically.
ALTER TABLE "Branch"
  ADD COLUMN "workingDays" TEXT[] NOT NULL
  DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday','saturday']::TEXT[];
