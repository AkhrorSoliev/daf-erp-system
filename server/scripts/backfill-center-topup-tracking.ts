/**
 * Backfill `SalaryAccrual.wasCenterTopUp` (the sticky center-advance marker).
 *
 * `wasCenterTopUp` was added AFTER the July 2026 center top-up went live. For
 * every accrual the center is CURRENTLY fronting (`isCenterTopUp = true`), set
 * the sticky mirror TRUE so the center-advance report counts it as "advanced".
 *
 * Limitation: top-ups that were already RECOVERED before this migration
 * (isCenterTopUp already flipped back to false) can't be recovered — that
 * history is lost. Loss is negligible because top-up went live 2026-07 and this
 * runs right after, so almost nothing has been recovered yet.
 *
 * Idempotent: only touches rows where isCenterTopUp = true AND wasCenterTopUp =
 * false, so re-running is a no-op.
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/backfill-center-topup-tracking.ts --dry-run   # preview
 *   npx ts-node scripts/backfill-center-topup-tracking.ts             # apply
 *   railway run npx ts-node scripts/backfill-center-topup-tracking.ts # PROD
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const host = (process.env.DATABASE_URL ?? '').replace(/^.*@/, '').split('/')[0];
  console.log(`DB host: ${host}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

  const pending = await prisma.salaryAccrual.count({
    where: { isCenterTopUp: true, wasCenterTopUp: false },
  });
  const alreadyMarked = await prisma.salaryAccrual.count({
    where: { wasCenterTopUp: true },
  });

  console.log(`Currently center-fronted (isCenterTopUp=true) needing the sticky flag: ${pending}`);
  console.log(`Already have wasCenterTopUp=true: ${alreadyMarked}`);

  if (DRY_RUN) {
    console.log(`\nWould set wasCenterTopUp=true on ${pending} row(s).`);
    return;
  }

  if (pending === 0) {
    console.log('\nNothing to backfill — all center-fronted rows already marked.');
    return;
  }

  const res = await prisma.salaryAccrual.updateMany({
    where: { isCenterTopUp: true, wasCenterTopUp: false },
    data: { wasCenterTopUp: true },
  });
  console.log(`\nDone — set wasCenterTopUp=true on ${res.count} row(s).`);

  const check = await prisma.salaryAccrual.count({
    where: { isCenterTopUp: true, wasCenterTopUp: false },
  });
  console.log(
    check === 0
      ? 'Invariant OK: every isCenterTopUp=true row now has wasCenterTopUp=true.'
      : `WARNING: ${check} center-fronted row(s) still missing the sticky flag.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
