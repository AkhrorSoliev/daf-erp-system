/**
 * BATCH CORRECTION — 2026-06 over-charge audit (9 confirmed students).
 *
 * Two victim classes (see scripts/audit-overcharged-students.ts):
 *  - PREPAID_WIPE_REBILL: cutover migration wiped prepaid counters; lessons
 *    re-billed per-lesson on top of the original full-cycle deduction.
 *  - DROP/FREEZE refund gap: enrollment closed (DROPPED/TRANSFERRED via
 *    cascade, or FROZEN) without (fully) refunding unused prepaid lessons.
 *
 * Fix per student (append-only, ledger-safe):
 *  - ONE ADJUSTMENT credit = overcharge, where
 *      overcharge = fairPosition − currentPosition
 *      fairPosition = moneyIn − billable×perLesson×(1−disc)
 *      currentPosition = balance + ACTIVE-enrollment prepaid value
 *    The amount is RE-DERIVED LIVE inside the tx and must match the audited
 *    EXPECTED value exactly, and the live balance must match the audited
 *    balance — otherwise the student is SKIPPED (drift guard).
 *  - Zero stale prepaidLessonsRemaining on DROPPED/TRANSFERRED enrollments
 *    (their value is now refunded to balance — prevents double counting).
 *
 * Billing facts used (verified against src/billing/lesson-billing.service.ts
 * and Company.systemStartDate):
 *  - BILLABLE = PRESENT/LATE/ABSENT; EXCUSED free.
 *  - April cutover: lessons before 2026-05-01 are FREE (even when enrollment
 *    startDate is null).
 *  - Payments count as money-in regardless of date (April money carried over).
 *
 * Usage (from server/):
 *   dry-run: DATABASE_URL=<prod> npx ts-node scripts/fix-overcharged-batch-2026-06.ts --dry-run
 *   apply:   DATABASE_URL=<prod> npx ts-node scripts/fix-overcharged-batch-2026-06.ts --apply
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const argv = process.argv.slice(2);
const DRY_RUN = !argv.includes('--apply');
const COMPANY_ID = 1001;
const PERFORMED_BY = 10456; // CEO Ahror Soliyev
const BATCH_MARKER = 'overcharge-audit-2026-06';
const SYSTEM_START = '2026-05-01';

// Audited 2026-06-11 (audit-overcharged-students.ts + 9 independent adversarial
// verifications + manual check of #10474). Live recompute must match exactly.
const EXPECTED: { id: number; overcharge: number; balance: number; rootCause: string }[] = [
  { id: 10404, overcharge: 400000, balance: -216662, rootCause: 'PREPAID_WIPE_REBILL' },
  { id: 10305, overcharge: 400000, balance: 100007, rootCause: 'PREPAID_WIPE_REBILL' },
  { id: 10498, overcharge: 133336, balance: 0, rootCause: 'DROP_REFUND_MISSING' },
  { id: 10454, overcharge: 133332, balance: 4, rootCause: 'DROP_REFUND_MISSING' },
  { id: 10482, overcharge: 125001, balance: 2, rootCause: 'DROP_REFUND_PARTIAL' },
  { id: 10440, overcharge: 103500, balance: 0, rootCause: 'DROP_REFUND_MISSING' },
  { id: 10474, overcharge: 66666, balance: -83329, rootCause: 'DROP_REFUND_MISSING' },
  { id: 10417, overcharge: 33337, balance: 199998, rootCause: 'FREEZE_REFUND_PARTIAL' },
  { id: 10280, overcharge: 33333, balance: -33329, rootCause: 'DROP_REFUND_MISSING' },
];

class DryRunAbort extends Error {}
const som = (n: number) => n.toLocaleString('ru-RU') + " so'm";
const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** Re-derive the overcharge from live data — same algorithm as the audit. */
async function computeLive(tx: Prisma.TransactionClient, studentId: number) {
  const student = await tx.student.findFirst({
    where: { id: studentId, companyId: COMPANY_ID },
    select: { balance: true, discountPercent: true, firstName: true, lastName: true },
  });
  if (!student) throw new Error("O'quvchi topilmadi");
  const discMul = 1 - (student.discountPercent || 0) / 100;

  const enrollments = await tx.enrollment.findMany({
    where: { studentId, deletedAt: null },
    select: {
      groupId: true, status: true, startDate: true, prepaidLessonsRemaining: true,
      group: { select: { course: { select: { price: true, lessonPaymentCount: true } } } },
    },
  });
  const perByGroup = new Map<string, number>();
  const startByGroup = new Map<string, string | null>();
  let prepaidValue = 0;
  for (const e of enrollments) {
    const per = Math.round((e.group.course?.price ?? 0) / (e.group.course?.lessonPaymentCount || 1));
    perByGroup.set(e.groupId, per);
    const sd = day(e.startDate);
    const cur = startByGroup.get(e.groupId);
    if (cur === undefined) startByGroup.set(e.groupId, sd);
    else if (sd && (!cur || sd < cur)) startByGroup.set(e.groupId, sd);
    if (e.status === 'ACTIVE') prepaidValue += e.prepaidLessonsRemaining * per;
    // Formula counts only ACTIVE prepaid as held value; FROZEN/COMPLETED
    // prepaid would be neither held nor refunded here — needs manual review.
    if ((e.status === 'FROZEN' || e.status === 'COMPLETED') && e.prepaidLessonsRemaining > 0)
      throw new Error(`${e.status} enrollmentda prepaid=${e.prepaidLessonsRemaining} — qo'lda ko'rib chiqish kerak`);
  }
  prepaidValue = Math.round(prepaidValue * discMul);

  const atts = await tx.attendance.findMany({
    where: { studentId, status: { in: ['PRESENT', 'LATE', 'ABSENT'] } },
    select: { groupId: true, date: true },
  });
  let fairCharge = 0;
  let billable = 0;
  for (const a of atts) {
    const d = day(a.date)!;
    if (d < SYSTEM_START) continue;
    const start = startByGroup.get(a.groupId);
    if (start && d < start) continue;
    const per = perByGroup.get(a.groupId);
    if (per == null) continue; // attendance in a group with no (non-deleted) enrollment
    fairCharge += per;
    billable++;
  }
  fairCharge = Math.round(fairCharge * discMul);

  const txns = await tx.transaction.findMany({
    where: {
      studentId, reversedAt: null,
      type: { notIn: ['LESSON_DEDUCTION', 'LESSON_CONSUMPTION', 'ADJUSTMENT'] },
    },
    select: { amount: true },
  });
  const moneyIn = txns.reduce((s, t) => s + t.amount, 0);

  const fairPosition = moneyIn - fairCharge;
  const currentPosition = student.balance + prepaidValue;
  return {
    name: `${student.firstName} ${student.lastName}`.trim(),
    balance: student.balance,
    moneyIn, fairCharge, billable, prepaidValue, fairPosition, currentPosition,
    overcharge: fairPosition - currentPosition,
  };
}

async function main() {
  console.log('========== BATCH FIX: OVERCHARGE AUDIT 2026-06 ==========');
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log('Mode   :', DRY_RUN ? 'DRY RUN (rollback)' : 'APPLY (commit!)');
  console.log('----------------------------------------------------------');

  let applied = 0, skipped = 0, failed = 0, total = 0;

  for (const exp of EXPECTED) {
    const cap: Record<string, any> = {};
    try {
      const run = async (tx: Prisma.TransactionClient) => {
        const existing = await tx.transaction.findFirst({
          where: {
            studentId: exp.id, type: 'ADJUSTMENT', reversedAt: null,
            metadata: { path: ['marker'], equals: BATCH_MARKER },
          },
          select: { id: true },
        });
        if (existing) { cap.skip = `allaqachon tuzatilgan (#${existing.id})`; return; }

        await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${exp.id} AND "companyId" = ${COMPANY_ID} FOR UPDATE`;

        const live = await computeLive(tx, exp.id);
        cap.live = live;

        const problems: string[] = [];
        if (live.balance !== exp.balance)
          problems.push(`balans ${live.balance} ≠ audit ${exp.balance}`);
        if (live.overcharge !== exp.overcharge)
          problems.push(`ortiqcha ${live.overcharge} ≠ audit ${exp.overcharge}`);
        if (problems.length) { cap.skip = `DRIFT: ${problems.join('; ')}`; return; }

        const after = live.balance + exp.overcharge;
        const adj = await tx.transaction.create({
          data: {
            type: 'ADJUSTMENT',
            amount: exp.overcharge,
            balanceBefore: live.balance,
            balanceAfter: after,
            studentId: exp.id,
            companyId: COMPANY_ID,
            performedById: PERFORMED_BY,
            description:
              exp.rootCause === 'PREPAID_WIPE_REBILL'
                ? "Ortiqcha hisoblangan dars to'lovlari qaytarildi (cutover/prepaid migratsiyasi qo'sh-charge)"
                : "Guruhdan chiqarilganda/muzlatilganda qaytarilmagan oldindan to'langan darslar puli qaytarildi",
            metadata: {
              marker: BATCH_MARKER,
              rootCause: exp.rootCause,
              moneyIn: live.moneyIn,
              fairCharge: live.fairCharge,
              billableLessons: live.billable,
              activePrepaidValue: live.prepaidValue,
              balanceBefore: live.balance,
              balanceAfter: after,
            },
          },
        });
        cap.adjId = adj.id;
        cap.after = after;

        await tx.student.update({ where: { id: exp.id }, data: { balance: after } });

        const reset = await tx.enrollment.updateMany({
          where: {
            studentId: exp.id, deletedAt: null,
            status: { in: ['DROPPED', 'TRANSFERRED'] },
            prepaidLessonsRemaining: { gt: 0 },
          },
          data: { prepaidLessonsRemaining: 0 },
        });
        cap.prepaidReset = reset.count;

        if (DRY_RUN) throw new DryRunAbort();
      };

      try {
        await prisma.$transaction(run, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 20_000,
          timeout: 60_000,
        });
      } catch (e) {
        if (!(e instanceof DryRunAbort)) throw e;
      }

      if (cap.skip) {
        skipped++;
        console.log(`  #${exp.id} SKIP — ${cap.skip}`);
        continue;
      }
      applied++;
      total += exp.overcharge;
      const l = cap.live;
      console.log(
        `  #${exp.id} ${l.name.slice(0, 24).padEnd(25)} +${som(exp.overcharge).padStart(12)}  bal ${som(l.balance)} → ${som(cap.after)}  (dars=${l.billable}, prepaidReset=${cap.prepaidReset})${DRY_RUN ? '' : `  adj=${cap.adjId}`}`,
      );
    } catch (e) {
      failed++;
      console.error(`  #${exp.id} XATO: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log('----------------------------------------------------------');
  console.log(`Qo'llandi: ${applied} | Skip: ${skipped} | Xato: ${failed}`);
  console.log(`Jami kredit: ${som(total)}`);
  console.log(DRY_RUN ? 'DRY RUN — hech narsa saqlanmadi.' : 'APPLY — saqlandi (commit).');
  console.log('==========================================================');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
