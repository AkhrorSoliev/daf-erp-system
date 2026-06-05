/**
 * Faza 5 — SET SALARY PERIOD to calendar months (cycleStartDay = 1) from May.
 *
 * Creates a SalaryPeriodSetting { cycleStartDay: 1, effectiveFrom: 2026-05-01 }
 * so payroll periods become [May 1–31], [June 1–30], ... instead of the legacy
 * 8th→7th default. Safe: there are no existing settings and no SalaryPayments
 * for this company, so there is no mid-cycle conflict to resolve.
 *
 * After this, May salary settles correctly: on any date in June,
 * resolveCompletedPeriod() returns [May 1–31]. The owner triggers the May run
 * from the UI (Salary → Hisoblash) or POST /salary/calculate — this script does
 * NOT create or pay any SalaryPayment (that stays a deliberate owner action).
 *
 * Usage (from server/):
 *   railway run -- bash -c 'npx ts-node scripts/set-salary-period-may.ts --dry-run'
 *   railway run -- bash -c 'npx ts-node scripts/set-salary-period-may.ts --by=10456'
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
const CHANGED_BY = arg('--by') ? Number(arg('--by')) : null;
const EFFECTIVE_FROM = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01

async function main() {
  console.log('======= SET SALARY PERIOD: calendar months from 01.05 =======');
  console.log('DB host :', new URL(process.env.DATABASE_URL ?? '').host);
  console.log('Mode    :', DRY_RUN ? 'DRY RUN (no commit)' : 'APPLY (commit!)');
  console.log('company :', COMPANY_ID);

  const existing = await prisma.salaryPeriodSetting.findMany({
    where: { companyId: COMPANY_ID },
    orderBy: { effectiveFrom: 'asc' },
  });
  console.log(`Existing settings: ${existing.length}`);
  for (const s of existing) {
    console.log(`  cycleStartDay=${s.cycleStartDay} from=${s.effectiveFrom.toISOString().slice(0, 10)} to=${s.effectiveTo?.toISOString().slice(0, 10) ?? 'open'}`);
  }

  const already = existing.find(
    (s) => s.cycleStartDay === 1 && s.effectiveTo === null,
  );
  if (already) {
    console.log('Calendar-month setting already present — nothing to do.');
    console.log('=============================================================');
    return;
  }

  console.log('Will create: cycleStartDay=1, effectiveFrom=2026-05-01, effectiveTo=null');
  if (DRY_RUN) {
    console.log('DRY RUN — not written.');
    console.log('=============================================================');
    return;
  }

  // Close any open prior setting at the cutover instant (none expected).
  await prisma.salaryPeriodSetting.updateMany({
    where: { companyId: COMPANY_ID, effectiveTo: null },
    data: { effectiveTo: EFFECTIVE_FROM },
  });

  const created = await prisma.salaryPeriodSetting.create({
    data: {
      companyId: COMPANY_ID,
      cycleStartDay: 1,
      effectiveFrom: EFFECTIVE_FROM,
      effectiveTo: null,
      changedById: CHANGED_BY ?? undefined,
    },
  });
  console.log('CREATED SalaryPeriodSetting', created.id);
  console.log('=============================================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
