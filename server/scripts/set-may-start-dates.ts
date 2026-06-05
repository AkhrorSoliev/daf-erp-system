/**
 * Faza 3 — SET START DATES to 2026-05-01.
 *
 *  - Group.startDate      -> 2026-05-01 where currently NULL or < 2026-05-01
 *  - Enrollment.startDate -> 2026-05-01 where currently NULL or < 2026-05-01
 *
 * Groups/enrollments that legitimately start later (>= 2026-05-01) are left
 * untouched. This is what permanently blocks April lessons from ever being
 * (re)billed: bill() and retroactive billing both skip any attendance dated
 * before enrollment.startDate. Critical for "uncovered" April lessons (attended
 * but never billed) — without this they would get billed the moment the student
 * pays. Also makes attendance stats / dashboards start from May 1.
 *
 * Usage (from server/):
 *   railway run -- bash -c 'npx ts-node scripts/set-may-start-dates.ts --dry-run'
 *   railway run -- bash -c 'npx ts-node scripts/set-may-start-dates.ts'
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const arg = (n: string): string | undefined =>
  argv.find((a) => a.startsWith(`${n}=`))?.split('=', 2)[1];
const COMPANY_ID = Number(arg('--company') ?? process.env.COMPANY_ID ?? 1001);
const CUTOFF = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01

async function main() {
  console.log('============ SET MAY START DATES (01.05.2026) ============');
  console.log('DB host :', new URL(process.env.DATABASE_URL ?? '').host);
  console.log('Mode    :', DRY_RUN ? 'DRY RUN (no commit)' : 'APPLY (commit!)');
  console.log('company :', COMPANY_ID);
  console.log('---------------------------------------------------------');

  // ---- Groups ----
  const groupsToChange = await prisma.group.findMany({
    where: {
      companyId: COMPANY_ID,
      deletedAt: null,
      OR: [{ startDate: null }, { startDate: { lt: CUTOFF } }],
    },
    select: { id: true, name: true, startDate: true },
    orderBy: { name: 'asc' },
  });
  const groupsTotal = await prisma.group.count({
    where: { companyId: COMPANY_ID, deletedAt: null },
  });
  console.log(`Groups: ${groupsToChange.length} / ${groupsTotal} will move to 01.05`);
  for (const g of groupsToChange.slice(0, 8)) {
    console.log(`   - ${g.name}: ${g.startDate ? g.startDate.toISOString().slice(0, 10) : 'NULL'} -> 2026-05-01`);
  }
  if (groupsToChange.length > 8) console.log(`   ... (+${groupsToChange.length - 8} more)`);

  // ---- Enrollments ----
  const enrToChange = await prisma.enrollment.count({
    where: {
      deletedAt: null,
      group: { companyId: COMPANY_ID, deletedAt: null },
      OR: [{ startDate: null }, { startDate: { lt: CUTOFF } }],
    },
  });
  const enrTotal = await prisma.enrollment.count({
    where: { deletedAt: null, group: { companyId: COMPANY_ID, deletedAt: null } },
  });
  console.log(`Enrollments: ${enrToChange} / ${enrTotal} will move to 01.05`);
  console.log('---------------------------------------------------------');

  if (DRY_RUN) {
    console.log('DRY RUN — no changes written.');
    console.log('=========================================================');
    return;
  }

  const g = await prisma.group.updateMany({
    where: {
      companyId: COMPANY_ID,
      deletedAt: null,
      OR: [{ startDate: null }, { startDate: { lt: CUTOFF } }],
    },
    data: { startDate: CUTOFF },
  });
  const e = await prisma.enrollment.updateMany({
    where: {
      deletedAt: null,
      group: { companyId: COMPANY_ID, deletedAt: null },
      OR: [{ startDate: null }, { startDate: { lt: CUTOFF } }],
    },
    data: { startDate: CUTOFF },
  });
  console.log(`APPLIED: ${g.count} groups, ${e.count} enrollments set to 2026-05-01.`);
  console.log('=========================================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
