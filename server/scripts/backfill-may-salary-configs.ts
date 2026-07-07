/**
 * STEP 1 of the May 2026 salary backfill — backdate salary config coverage so
 * May lessons resolve a rate.
 *
 * Problem: every teacher's EmployeeSalaryConfigVersion.effectiveFrom is
 * 2026-05-31T19:00:00Z (= 01.06 Tashkent), so `findActiveVersion` resolves
 * NOTHING for May lessons → `createAccrual` returns null → zero May accruals.
 *
 * Fix: for each active config whose earliest version starts after 01.05, INSERT
 * an earlier version covering [01.05 Tashkent, earliest.effectiveFrom) at the
 * SAME salaryType + value as the PARENT config mirror (which is what
 * may-salary-reconcile.ts assumes). We never mutate an existing version's
 * effectiveFrom — inserting preserves the SCD2 audit / timeline.
 *
 * After this runs, STEP 2 (backfill-may-accruals.ts) can write the accruals.
 *
 * Guards:
 *   - Skip a config whose earliest version already covers 01.05 (idempotent).
 *   - Refuse to write if any APPROVED/PAID SalaryPayment overlaps the inserted
 *     window for that user (a closed period must not have its rate changed).
 *   - Assert the inserted version abuts the earliest existing version exactly
 *     (no gap, no overlap).
 *
 * Mutates nothing unless `--apply` is passed.
 *   railway run npx ts-node scripts/backfill-may-salary-configs.ts            # dry-run
 *   railway run npx ts-node scripts/backfill-may-salary-configs.ts --apply    # commit
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true } as any);

const APPLY = process.argv.includes('--apply');
const COMPANY = 1001;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
// 01.05.2026 00:00 Tashkent, stored UTC — matches the config-version storage
// convention (their effectiveFrom are Tashkent-adjusted).
const MAY1_START = new Date(
  new Date('2026-05-01T00:00:00.000Z').getTime() - TASHKENT_OFFSET_MS,
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log(`Mode: ${APPLY ? 'APPLY (commit)' : 'DRY RUN (no writes)'}`);
  console.log(`Backdated effectiveFrom = ${MAY1_START.toISOString()} (01.05 Tashkent)\n`);

  const configs = await prisma.employeeSalaryConfig.findMany({
    where: { companyId: COMPANY, isActive: true },
    select: {
      id: true,
      userId: true,
      groupId: true,
      salaryType: true,
      value: true,
      user: { select: { firstName: true, lastName: true } },
      versions: {
        select: { id: true, salaryType: true, value: true, effectiveFrom: true },
        orderBy: { effectiveFrom: 'asc' },
      },
    },
    orderBy: { userId: 'asc' },
  });

  let inserted = 0;
  let skipped = 0;

  for (const c of configs) {
    const who = `#${c.userId} ${c.user.firstName} ${c.user.lastName} [${c.groupId ? 'group:' + c.groupId : 'GLOBAL'}]`;
    const earliest = c.versions[0];

    if (!earliest) {
      console.log(`${who} — ⚠ no versions, cannot mirror a rate. SKIP.`);
      skipped++;
      continue;
    }
    if (earliest.effectiveFrom.getTime() <= MAY1_START.getTime()) {
      console.log(`${who} — already covers 01.05 (${earliest.effectiveFrom.toISOString()}). SKIP.`);
      skipped++;
      continue;
    }

    // Closed-period guard: no APPROVED/PAID payment may overlap the window we
    // are about to give a rate to.
    const closed = await prisma.salaryPayment.findFirst({
      where: {
        userId: c.userId,
        companyId: COMPANY,
        status: { in: ['APPROVED', 'PAID'] },
        periodStart: { lt: earliest.effectiveFrom },
        periodEnd: { gte: MAY1_START },
      },
      select: { id: true, status: true, periodStart: true, periodEnd: true },
    });
    if (closed) {
      console.log(
        `${who} — ⚠ APPROVED/PAID payment ${closed.id} (${closed.status}) overlaps window. SKIP (manual review).`,
      );
      skipped++;
      continue;
    }

    // Mirror the PARENT config rate (what reconcile uses), abut the earliest
    // existing version.
    const newVersion = {
      salaryType: c.salaryType,
      value: c.value,
      effectiveFrom: MAY1_START,
      effectiveTo: earliest.effectiveFrom,
    };

    console.log(
      `${who} — INSERT ${newVersion.salaryType}:${newVersion.value} ` +
        `[${newVersion.effectiveFrom.toISOString()} → ${newVersion.effectiveTo.toISOString()})  ` +
        `(abuts earliest ${earliest.salaryType}:${earliest.value} @ ${earliest.effectiveFrom.toISOString()})`,
    );

    if (APPLY) {
      const created = await prisma.employeeSalaryConfigVersion.create({
        data: {
          configId: c.id,
          salaryType: newVersion.salaryType,
          value: newVersion.value,
          effectiveFrom: newVersion.effectiveFrom,
          effectiveTo: newVersion.effectiveTo,
          companyId: COMPANY,
        },
        select: { effectiveTo: true },
      });
      // Abut assertion — inserted.effectiveTo must equal earliest.effectiveFrom.
      if (created.effectiveTo?.getTime() !== earliest.effectiveFrom.getTime()) {
        throw new Error(
          `ABUT ASSERT FAILED for ${who}: inserted.effectiveTo ${created.effectiveTo?.toISOString()} !== earliest.effectiveFrom ${earliest.effectiveFrom.toISOString()}`,
        );
      }
    }
    inserted++;
  }

  console.log(`\n${APPLY ? 'Inserted' : 'Would insert'}: ${inserted} | Skipped: ${skipped}`);
  if (!APPLY && inserted > 0) {
    console.log('Re-run with --apply to commit.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
