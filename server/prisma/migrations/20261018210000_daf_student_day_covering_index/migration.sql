-- DafStudentDay: covering index for the weekly ranking (ADR-0111).
-- Hand-written because Prisma cannot express INCLUDE. The (companyId, day)
-- index declared in schema.prisma stays; this one is an addition. The planner
-- can answer the centre-week query with an Index Only Scan, reading studentId
-- and points without touching the heap.
-- Not declared in schema.prisma: a later `prisma migrate diff` shows it as a
-- DROP INDEX. That diff is expected; do not fold the index into schema.prisma
-- or drop it.
CREATE INDEX IF NOT EXISTS "DafStudentDay_companyId_day_cover_idx"
  ON "DafStudentDay" ("companyId", "day") INCLUDE ("studentId", "points");
