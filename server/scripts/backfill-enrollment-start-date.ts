/**
 * Backfill Enrollment.startDate for all existing enrollments.
 *
 * Why: A new `startDate` field controls when a student begins appearing in
 * attendance and being billed for a group. New enrollments set it explicitly
 * during the enroll dialog ("from which lesson"), but existing rows are NULL
 * after the migration. The attendance/billing code defaults to "treat NULL
 * as no restriction" so the system stays functional, but for clean data we
 * set startDate = createdAt (truncated to the day in Tashkent time).
 *
 * Idempotent: skips rows where startDate IS NOT NULL.
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/backfill-enrollment-start-date.ts --dry-run
 *   npx ts-node scripts/backfill-enrollment-start-date.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Truncate to the start of the day in Tashkent (UTC+5, no DST).
 * Matches the convention used elsewhere in the codebase for lesson dates.
 */
function startOfDayTashkent(d: Date): Date {
  // Tashkent is UTC+5 with no DST. To get "start of day in Tashkent" as a UTC
  // Date, take the UTC date components, shift by -5h, floor to midnight, then
  // shift back. Simpler: build the date string in Tashkent and parse as UTC.
  const tashkent = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  const y = tashkent.getUTCFullYear();
  const m = String(tashkent.getUTCMonth() + 1).padStart(2, '0');
  const day = String(tashkent.getUTCDate()).padStart(2, '0');
  return new Date(`${y}-${m}-${day}T00:00:00.000Z`);
}

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`);

  const rows = await prisma.enrollment.findMany({
    where: { startDate: null },
    select: { id: true, createdAt: true },
  });

  if (rows.length === 0) {
    console.log('All enrollments already have startDate. Nothing to do.');
    return;
  }

  console.log(`Found ${rows.length} enrollment(s) needing backfill.\n`);

  if (DRY_RUN) {
    console.log('Sample (first 5):');
    for (const r of rows.slice(0, 5)) {
      console.log(
        `  ${r.id}: createdAt=${r.createdAt.toISOString()} → startDate=${startOfDayTashkent(r.createdAt).toISOString()}`,
      );
    }
    console.log(`\nDRY RUN — no rows written.`);
    return;
  }

  let written = 0;
  // Batched updates to avoid one-row-at-a-time round-trips. Group by the
  // computed startDate so each unique date becomes one updateMany call.
  const byDate = new Map<string, string[]>();
  for (const r of rows) {
    const key = startOfDayTashkent(r.createdAt).toISOString();
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(r.id);
  }

  for (const [iso, ids] of byDate.entries()) {
    const result = await prisma.enrollment.updateMany({
      where: { id: { in: ids } },
      data: { startDate: new Date(iso) },
    });
    written += result.count;
    console.log(`  ${iso}: ${result.count} row(s)`);
  }

  console.log(`\nWrote ${written} enrollment(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
