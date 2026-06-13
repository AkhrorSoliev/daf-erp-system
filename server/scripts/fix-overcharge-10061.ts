/**
 * ONE-OFF CORRECTION — Student #10061 (Xamidullo Ashurov) over-charge.
 *
 * Diagnosis (verified against prod):
 *   - Student paid ONE cycle: 400 000 so'm (PAYME, 2026-04-24).
 *   - That payment was correctly deducted once as a full prepaid cycle
 *     (04-24 LESSON_DEDUCTION −400 000, prepaid=12) covering 12 lessons.
 *   - During the April-cutover / prepaid migration the prepaid counter was
 *     wiped, so every subsequent lesson re-billed per-lesson: 16 × 33 333 =
 *     533 328 of phantom LESSON_DEDUCTIONs piled on top of the one legitimate
 *     400 000 cycle. Balance fell to −533 328.
 *   - The student attended exactly 12 billable (May+, on/after startDate
 *     2026-05-01) PRESENT lessons — i.e. exactly the one cycle they paid for.
 *     Fair balance = 400 000 (paid) − 400 000 (one cycle) = 0.
 *   - There are ZERO salary accruals for this student (May config gap), so no
 *     teacher pay is affected by this correction.
 *
 * Fix (append-only, ledger-safe): a single +533 328 ADJUSTMENT credit that
 * leaves the one legitimate 400 000 cycle in place and cancels the phantom
 * per-lesson re-bills. Balance → 0. Also resets the stray prepaid (1) to 0 so
 * the next lesson bills against balance correctly.
 *
 * Usage (from server/):
 *   dry-run: railway run -- bash -c 'npx ts-node scripts/fix-overcharge-10061.ts --dry-run'
 *   apply:   railway run -- bash -c 'npx ts-node scripts/fix-overcharge-10061.ts --apply'
 * (Or set DATABASE_URL inline to the prod URL.)
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const argv = process.argv.slice(2);
const DRY_RUN = !argv.includes('--apply'); // safe default: dry-run unless --apply
const STUDENT_ID = 10061;
const COMPANY_ID = 1001;
const PERFORMED_BY = 10456; // CEO Ahror Soliyev
const MARKER = 'overcharge-correction-10061';

// Expected pre-state (guards against drift between analysis and write).
const EXPECTED_BALANCE = -533328;
const EXPECTED_CREDIT = 533328;
const COURSE_CYCLE = 400000; // the one legitimate full cycle the student paid

class DryRunAbort extends Error {}

const som = (n: number) => n.toLocaleString('ru-RU') + " so'm";

async function main() {
  console.log('============ FIX OVER-CHARGE #10061 ============');
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log('Mode   :', DRY_RUN ? 'DRY RUN (rollback)' : 'APPLY (commit!)');
  console.log('------------------------------------------------');

  const cap: Record<string, any> = {};
  try {
    const run = async (tx: Prisma.TransactionClient) => {
      // Idempotency: already corrected?
      const existing = await tx.transaction.findFirst({
        where: {
          studentId: STUDENT_ID,
          type: 'ADJUSTMENT',
          reversedAt: null,
          metadata: { path: ['marker'], equals: MARKER },
        },
        select: { id: true },
      });
      if (existing) {
        cap.skip = `Allaqachon tuzatilgan (ADJUSTMENT #${existing.id})`;
        return;
      }

      // Lock student row.
      const locked = await tx.$queryRaw<
        { balance: number; firstName: string; lastName: string; companyId: number }[]
      >`SELECT balance, "firstName", "lastName", "companyId" FROM "Student" WHERE id = ${STUDENT_ID} FOR UPDATE`;
      if (!locked.length) throw new Error('O\'quvchi topilmadi');
      if (locked[0].companyId !== COMPANY_ID) throw new Error('companyId mos emas');
      const before = locked[0].balance;
      cap.name = `${locked[0].firstName} ${locked[0].lastName}`.trim();

      // Re-derive the numbers from the live ledger.
      const payments = await tx.payment.aggregate({
        where: { studentId: STUDENT_ID, status: 'COMPLETED' },
        _sum: { amount: true },
      });
      const ded = await tx.transaction.findMany({
        where: { studentId: STUDENT_ID, type: 'LESSON_DEDUCTION', reversedAt: null },
        select: { amount: true },
      });
      const activeDed = ded.reduce((s, t) => s + Math.abs(t.amount), 0);
      const paid = payments._sum.amount ?? 0;

      // Credit = phantom per-lesson re-bills = total active deductions minus the
      // single legitimate full cycle (COURSE_CYCLE).
      const credit = activeDed - COURSE_CYCLE;
      const after = before + credit;

      cap.paid = paid;
      cap.activeDed = activeDed;
      cap.credit = credit;
      cap.before = before;
      cap.after = after;

      // ---- Drift guards: refuse to write if reality differs from analysis ----
      const problems: string[] = [];
      if (before !== EXPECTED_BALANCE)
        problems.push(`balans ${before} ≠ kutilgan ${EXPECTED_BALANCE}`);
      if (credit !== EXPECTED_CREDIT)
        problems.push(`kredit ${credit} ≠ kutilgan ${EXPECTED_CREDIT}`);
      if (paid !== COURSE_CYCLE)
        problems.push(`to'lov ${paid} ≠ kutilgan ${COURSE_CYCLE}`);
      if (after !== 0)
        problems.push(`yakuniy balans ${after} ≠ 0`);
      if (problems.length) {
        throw new Error(
          'DRIFT GUARD — holat o\'zgargan, yozilmadi:\n   - ' + problems.join('\n   - '),
        );
      }

      // ---- Write the correction ----
      const adj = await tx.transaction.create({
        data: {
          type: 'ADJUSTMENT',
          amount: credit,
          balanceBefore: before,
          balanceAfter: after,
          studentId: STUDENT_ID,
          companyId: COMPANY_ID,
          performedById: PERFORMED_BY,
          description:
            "Ortiqcha hisoblangan dars to'lovlari qaytarildi (cutover/prepaid migratsiyasi qo'sh-charge): 16 × 33 333 fantom deduksiya bekor qilindi, bitta haqiqiy 400 000 sikl qoldi. Balans 0 ga keltirildi.",
          metadata: {
            marker: MARKER,
            reason: 'april-cutover prepaid wipe → per-lesson double billing',
            paidTotal: paid,
            activeDeductions: activeDed,
            legitimateCycle: COURSE_CYCLE,
            phantomCredit: credit,
            balanceBefore: before,
            balanceAfter: after,
          },
        },
      });
      cap.adjId = adj.id;

      await tx.student.update({
        where: { id: STUDENT_ID },
        data: { balance: after },
      });

      // Reset the stray prepaid (came from the 06-10 EXCUSED flip) so the next
      // lesson bills against balance instead of consuming a phantom prepaid.
      const enrReset = await tx.enrollment.updateMany({
        where: { studentId: STUDENT_ID, status: 'ACTIVE', prepaidLessonsRemaining: { gt: 0 } },
        data: { prepaidLessonsRemaining: 0 },
      });
      cap.prepaidReset = enrReset.count;

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
  } catch (e) {
    console.error('XATO:', e instanceof Error ? e.message : e);
    process.exit(1);
  }

  if (cap.skip) {
    console.log('SKIP:', cap.skip);
    return;
  }
  console.log(`O'quvchi      : #${STUDENT_ID} ${cap.name}`);
  console.log(`To'lov (jami) : ${som(cap.paid)}`);
  console.log(`Aktiv deduksiya: ${som(cap.activeDed)}  (shundan 1 haqiqiy sikl ${som(COURSE_CYCLE)})`);
  console.log(`KREDIT (ADJ)  : +${som(cap.credit)}`);
  console.log(`Balans        : ${som(cap.before)} → ${som(cap.after)}`);
  console.log(`Prepaid reset : ${cap.prepaidReset} ta enrollment → 0`);
  if (!DRY_RUN) console.log(`ADJUSTMENT id : ${cap.adjId}`);
  console.log('------------------------------------------------');
  console.log(DRY_RUN ? 'DRY RUN — hech narsa saqlanmadi (rollback).' : 'APPLY — saqlandi (commit).');
  console.log('================================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
