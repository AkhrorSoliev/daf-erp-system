-- Xodimning rasmiy oylik summasi (spec 2026-10-25). null = hammasi naqd.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "officialSalary" INTEGER;
