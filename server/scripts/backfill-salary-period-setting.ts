/**
 * Backfill SalaryPeriodSetting for every Company.
 *
 * Why: Faza 2 makes the salary cycle (8th→7th) configurable per company.
 * Without a SalaryPeriodSetting row, the resolver has no period to apply
 * and the cron would silently no-op for that company.
 *
 * Rule: each company gets a default `{cycleStartDay: 8, effectiveFrom: 2020-01-01}`
 * which preserves the previously hardcoded behavior.
 *
 * Idempotent: skips companies that already have at least one period setting.
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/backfill-salary-period-setting.ts --dry-run
 *   npx ts-node scripts/backfill-salary-period-setting.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');
const DEFAULT_CYCLE_START_DAY = 8;
const DEFAULT_EFFECTIVE_FROM = new Date('2020-01-01T00:00:00.000Z');

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`);

  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });

  const existing = await prisma.salaryPeriodSetting.findMany({
    select: { companyId: true },
  });
  const haveSettings = new Set(existing.map((s) => s.companyId));

  const needsBackfill = companies.filter((c) => !haveSettings.has(c.id));

  if (needsBackfill.length === 0) {
    console.log(
      `All ${companies.length} companies already have period settings. Nothing to do.`,
    );
    return;
  }

  console.log(
    `Found ${needsBackfill.length} company(ies) without period settings ` +
      `(${companies.length - needsBackfill.length} already configured):\n`,
  );
  for (const c of needsBackfill) {
    console.log(
      `  company #${c.id} ${c.name} → cycleStartDay=${DEFAULT_CYCLE_START_DAY} ` +
        `effectiveFrom=${DEFAULT_EFFECTIVE_FROM.toISOString()}`,
    );
  }

  if (DRY_RUN) {
    console.log(`\nDRY RUN — no rows written.`);
    return;
  }

  let written = 0;
  for (const c of needsBackfill) {
    await prisma.salaryPeriodSetting.create({
      data: {
        companyId: c.id,
        cycleStartDay: DEFAULT_CYCLE_START_DAY,
        effectiveFrom: DEFAULT_EFFECTIVE_FROM,
        effectiveTo: null,
        changedById: null,
      },
    });
    written++;
  }
  console.log(`\nWrote ${written} period setting(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
