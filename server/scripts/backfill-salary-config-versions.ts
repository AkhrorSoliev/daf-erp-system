/**
 * Backfill EmployeeSalaryConfigVersion rows for every existing
 * EmployeeSalaryConfig.
 *
 * Why: Faza 2 changes the accrual lookup to read versions by
 * `effectiveFrom <= lessonDate < effectiveTo`. Without a version row,
 * accruals would silently fall back to "no config" and stop being written.
 *
 * Rule: one version per existing config, with:
 *   - effectiveFrom = config.createdAt (the rate started when the config
 *     was first created — that's the only honest answer we have)
 *   - effectiveTo = NULL (still current)
 *   - changedById = NULL (system backfill, no human author)
 *
 * Idempotent: skips configs that already have at least one version row.
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/backfill-salary-config-versions.ts --dry-run
 *   npx ts-node scripts/backfill-salary-config-versions.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`);

  const configs = await prisma.employeeSalaryConfig.findMany({
    select: {
      id: true,
      userId: true,
      groupId: true,
      salaryType: true,
      value: true,
      companyId: true,
      createdAt: true,
      versions: { select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  });

  const needsBackfill = configs.filter((c) => c.versions.length === 0);

  if (needsBackfill.length === 0) {
    console.log(
      `All ${configs.length} configs already have versions. Nothing to do.`,
    );
    return;
  }

  console.log(
    `Found ${needsBackfill.length} config(s) without versions ` +
      `(${configs.length - needsBackfill.length} already backfilled):\n`,
  );
  for (const c of needsBackfill) {
    console.log(
      `  config ${c.id} userId=${c.userId} groupId=${c.groupId ?? 'GLOBAL'} ` +
        `${c.salaryType}=${c.value} effectiveFrom=${c.createdAt.toISOString()}`,
    );
  }

  if (DRY_RUN) {
    console.log(`\nDRY RUN — no rows written.`);
    return;
  }

  let written = 0;
  for (const c of needsBackfill) {
    await prisma.employeeSalaryConfigVersion.create({
      data: {
        configId: c.id,
        salaryType: c.salaryType,
        value: c.value,
        effectiveFrom: c.createdAt,
        effectiveTo: null,
        changedById: null,
        companyId: c.companyId,
      },
    });
    written++;
  }
  console.log(`\nWrote ${written} version row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
