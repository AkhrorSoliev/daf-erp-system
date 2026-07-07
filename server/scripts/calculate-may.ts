/**
 * STEP 3 — settle the May 2026 payroll from the backfilled accruals, using the
 * NEW merge-idempotent calculation code directly against prod (so we don't have
 * to deploy first, and the deployed old code's non-idempotent accrual branch
 * can't duplicate Saidaxon/Sohibaxon's existing May payments).
 *
 * Instantiates SalaryCalculationService on a raw PrismaClient and runs
 * calculateMonthlySalaries(company, { asOfDate: 2026-05-15 }) → resolves the
 * May period (cycleStartDay=1 → 01.05–31.05) and creates/merges one
 * SalaryPayment per teacher.
 *
 *   railway run npx ts-node scripts/calculate-may.ts          # preview period only
 *   railway run npx ts-node scripts/calculate-may.ts --apply  # run the calculation
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { SalaryCalculationService } from '../src/salary/salary-calculation.service';
import { resolveCurrentPeriod } from '../src/salary/shared/resolve-current-period';
dotenv.config({ quiet: true } as any);

const APPLY = process.argv.includes('--apply');
const COMPANY = 1001;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const AS_OF = new Date(new Date('2026-05-15T00:00:00.000Z').getTime() - TASHKENT_OFFSET_MS);
const f = (n: number) => n.toLocaleString('en-US');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const service = new SalaryCalculationService(prisma as any);

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  const period = await resolveCurrentPeriod(prisma as any, COMPANY, AS_OF);
  console.log(
    `asOfDate ${AS_OF.toISOString()} → period [${period.periodStart.toISOString()} .. ${period.periodEnd.toISOString()}] cycleStartDay=${period.cycleStartDay}`,
  );

  if (!APPLY) {
    console.log('\nPREVIEW only. Re-run with --apply to create May SalaryPayments.');
    return;
  }

  const result = await service.calculateMonthlySalaries(COMPANY, { asOfDate: AS_OF });
  console.log(`\nCalculated: ${result.calculated} | skipped(closed): ${result.skipped}`);
  for (const d of result.details) {
    console.log(`   #${d.userId} ${d.kind} ${d.action} — net ${f(d.amount)} (advance ${f(d.advanceDeducted)})`);
  }
  if (result.skippedUserIds.length) {
    console.log(`   skipped userIds: ${result.skippedUserIds.join(', ')}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
