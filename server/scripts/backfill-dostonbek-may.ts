/**
 * One-off — pay departed teacher Dostonbek Ruzimatov #10004 for the May lessons
 * HE taught (marked) in groups since reassigned to other teachers.
 *
 * He has no salary config, so this:
 *   1. Creates a GLOBAL PERCENTAGE:50 config + a May-covering version
 *      (effectiveFrom 01.05 Tashkent) so createAccrual can resolve his rate.
 *   2. Accrues his covered May lessons (markedById = him, active
 *      LESSON_DEDUCTION, not deferred, and NOT already accrued to ANYONE — so a
 *      lesson already credited to the current teacher is never double-paid).
 *
 * The main backfill (backfill-may-accruals.ts) excludes markedById=10004, so
 * the current teachers (Saidaxon/Muzzammila) don't get these lessons.
 *
 * STEP 3 (`POST /salary/calculate {asOfDate:"2026-05-15"}`) then sweeps his
 * accruals into a May SalaryPayment for him like any other teacher.
 *
 *   railway run npx ts-node scripts/backfill-dostonbek-may.ts          # dry-run
 *   railway run npx ts-node scripts/backfill-dostonbek-may.ts --apply  # commit
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { SalaryAccrualService } from '../src/salary/salary-accrual.service';
dotenv.config({ quiet: true } as any);

const APPLY = process.argv.includes('--apply');
const COMPANY = 1001;
const DOSTONBEK = 10004;
const RATE = 50; // PERCENTAGE, confirmed by CEO
const MAY1 = new Date('2026-05-01T00:00:00.000Z');
const JUN1 = new Date('2026-06-01T00:00:00.000Z');
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const MAY1_START = new Date(MAY1.getTime() - TASHKENT_OFFSET_MS); // 01.05 Tashkent
const f = (n: number) => n.toLocaleString('en-US');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const accrualService = new SalaryAccrualService(prisma as any);

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log(`Mode: ${APPLY ? 'APPLY (commit)' : 'DRY RUN'}\n`);

  // 1) ensure GLOBAL config + May-covering version
  let config = await prisma.employeeSalaryConfig.findFirst({
    where: { userId: DOSTONBEK, companyId: COMPANY, groupId: null },
    select: { id: true, versions: { select: { effectiveFrom: true } } },
  });
  if (!config) {
    console.log(`Config: creating GLOBAL PERCENTAGE:${RATE} for #${DOSTONBEK}`);
    if (APPLY) {
      const created = await prisma.employeeSalaryConfig.create({
        data: {
          userId: DOSTONBEK,
          groupId: null,
          salaryType: 'PERCENTAGE',
          value: RATE,
          isActive: true,
          companyId: COMPANY,
          versions: {
            create: {
              salaryType: 'PERCENTAGE',
              value: RATE,
              effectiveFrom: MAY1_START,
              effectiveTo: null,
              companyId: COMPANY,
            },
          },
        },
        select: { id: true },
      });
      config = { id: created.id, versions: [{ effectiveFrom: MAY1_START }] };
    }
  } else {
    console.log(`Config: already exists (${config.id}).`);
  }

  // 2) his covered, not-yet-accrued-to-anyone May lessons
  const atts = await prisma.attendance.findMany({
    where: {
      companyId: COMPANY,
      markedById: DOSTONBEK,
      status: { in: ['PRESENT', 'LATE'] },
      date: { gte: MAY1, lt: JUN1 },
    },
    select: { id: true, studentId: true, groupId: true, date: true },
  });
  const attIds = atts.map((a) => a.id);

  const deds = await prisma.transaction.findMany({
    where: { attendanceId: { in: attIds }, type: 'LESSON_DEDUCTION', reversedAt: null },
    select: { id: true, attendanceId: true, metadata: true },
  });
  const dedByAtt = new Map(
    deds.map((t) => {
      const md = (t.metadata ?? {}) as Record<string, unknown>;
      return [
        t.attendanceId!,
        { txId: t.id, perLessonCost: Number(md.perLessonCost ?? 0), deferred: md.salaryDeferred === true },
      ];
    }),
  );

  // Already-accrued to ANYONE (not just Dostonbek) → never double-pay.
  const existing = await prisma.salaryAccrual.findMany({
    where: { attendanceId: { in: attIds }, reversedAt: null },
    select: { attendanceId: true },
  });
  const accruedAtt = new Set(existing.map((a) => a.attendanceId));

  const candidates = atts.filter((a) => {
    const ded = dedByAtt.get(a.id);
    return ded && !ded.deferred && !accruedAtt.has(a.id);
  });

  console.log(`Covered, unaccrued lessons to credit to #${DOSTONBEK}: ${candidates.length}`);
  if (!config && APPLY) {
    throw new Error('Config missing after create — aborting.');
  }
  if (candidates.length === 0) {
    console.log('Nothing to accrue.');
    return;
  }

  if (!APPLY) {
    let projected = 0;
    for (const a of candidates) {
      const plc = dedByAtt.get(a.id)!.perLessonCost;
      projected += Math.round((plc * RATE) / 100);
    }
    console.log(
      `DRY RUN — would accrue ${candidates.length} lesson(s), ≈ ${f(projected)} so'm to #${DOSTONBEK}.`,
    );
    console.log('Re-run with --apply (config must exist — create it on the same apply run).');
    return;
  }

  let written = 0;
  let amount = 0;
  for (const a of candidates) {
    const ded = dedByAtt.get(a.id)!;
    await prisma.$transaction(
      async (tx) => {
        const accrual = await accrualService.createAccrual({
          teacherId: DOSTONBEK,
          studentId: a.studentId,
          groupId: a.groupId,
          attendanceId: a.id,
          lessonDate: a.date,
          perLessonCost: ded.perLessonCost,
          companyId: COMPANY,
          deductionTransactionId: ded.txId,
          tx,
        });
        if (accrual) {
          written++;
          amount += accrual.amount;
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20000, timeout: 60000 },
    );
  }
  console.log(`Wrote ${written} accrual(s), total ${f(amount)} so'm to #${DOSTONBEK}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
