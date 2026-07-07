/**
 * ONE-OFF MANUAL CORRECTION — Student #10284 (Muhammadiso Ashuraliyev).
 *
 * CEO decision (THIS student only): during the 3,500,000 -> 350,000 payment
 * cleanup, a manual ADJUSTMENT of -166,665 was entered on 2026-05-21 to "re-bill
 * 5 old-cycle lessons (21/04, 23/04, 26/04, 28/04, 19/05)". Those dates are
 * PHANTOM — none exist in the student's attendance, and 4 of them are April
 * (pre-cutover, must NOT be billed per the April refund policy). The student's
 * real April lessons (22/24/27/29.04) were already correctly reversed (net 0).
 * Separately, the real 2026-05-20 PRESENT lesson was consumed but never charged
 * (its only LESSON_DEDUCTION was the reversed full-cycle batch).
 *
 * Net fair position: 23 billable May/June lessons (766,659) - 750,000 paid =
 * balance -16,659. Current balance -149,991 => student over-charged by 133,332.
 *
 * Actions (ONE Serializable tx, drift-guarded, idempotent):
 *  1. Reverse the erroneous ADJUSTMENT -166,665 (canonical reversedAt + inverse
 *     entry, mirroring TransactionsWriteService.reverseTransaction).
 *     balance -149,991 -> +16,674.
 *  2. Charge the genuinely-unbilled 2026-05-20 PRESENT lesson via a new
 *     ADJUSTMENT -33,333 linked to that attendance.
 *     balance +16,674 -> -16,659.
 *
 * No salary accrual is created for 05-20 (out of scope; May accruals are ~0
 * center-wide per the May salary-config gap). Enrollment prepaid untouched (0).
 *
 * Usage (from server/):
 *   dry-run: railway run npx ts-node --transpile-only scripts/fix-phantom-adj-10284.ts
 *   apply:   railway run npx ts-node --transpile-only scripts/fix-phantom-adj-10284.ts --apply
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DRY_RUN = !process.argv.slice(2).includes('--apply');

const STUDENT_ID = 10284;
const COMPANY_ID = 1001;
const PERFORMED_BY = 10456; // CEO Ahror Soliyev
const MARKER = 'april-phantom-adj-fix-10284-2026-06';
const PER_LESSON = 33333;

const BAD_ADJ_ID = '17105688-f4c2-40cb-b631-0b9426910c86'; // -166,665, 2026-05-21
const ATT_0520_ID = 'cea9f3b6-ed48-4e3f-992c-4503a26d9c2b'; // 2026-05-20 PRESENT
const BAD_ADJ_AMOUNT = -166665;

const EXPECTED_BALANCE = -149991;
const EXPECTED_AFTER = -16659; // -149991 + 166665 - 33333

class DryRunAbort extends Error {}
const som = (n: number) => n.toLocaleString('ru-RU') + " so'm";

async function main() {
  console.log('====== FIX #10284 — phantom/April ADJUSTMENT reversal + 05-20 charge ======');
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log('Mode   :', DRY_RUN ? 'DRY RUN (rollback)' : 'APPLY (commit!)');
  console.log('--------------------------------------------------------------------------');

  const cap: Record<string, any> = {};
  try {
    const exec = async (tx: Prisma.TransactionClient) => {
      // ── idempotency: bad ADJ already reversed? ───────────────────────────
      const bad = await tx.transaction.findUnique({
        where: { id: BAD_ADJ_ID },
        select: { id: true, amount: true, type: true, studentId: true, reversedAt: true, branchId: true, companyId: true },
      });
      if (!bad) throw new Error(`bad ADJUSTMENT ${BAD_ADJ_ID} topilmadi`);
      if (bad.reversedAt) {
        cap.skip = `allaqachon qo'llanilgan (ADJUSTMENT ${BAD_ADJ_ID} reversedAt set)`;
        return;
      }

      // ── lock + read student ──────────────────────────────────────────────
      const locked = await tx.$queryRaw<
        { balance: number; companyId: number; firstName: string; lastName: string }[]
      >`SELECT balance, "companyId", "firstName", "lastName" FROM "Student" WHERE id = ${STUDENT_ID} FOR UPDATE`;
      if (!locked.length) throw new Error("O'quvchi topilmadi");
      const before = locked[0].balance;
      cap.name = `${locked[0].firstName} ${locked[0].lastName}`.trim();
      cap.before = before;

      // ── DRIFT GUARD ──────────────────────────────────────────────────────
      const problems: string[] = [];
      if (locked[0].companyId !== COMPANY_ID) problems.push(`companyId ${locked[0].companyId} ≠ ${COMPANY_ID}`);
      if (before !== EXPECTED_BALANCE) problems.push(`balans ${before} ≠ kutilgan ${EXPECTED_BALANCE}`);

      // bad ADJ: correct shape
      if (bad.type !== 'ADJUSTMENT') problems.push(`bad tx type ${bad.type} ≠ ADJUSTMENT`);
      if (bad.studentId !== STUDENT_ID) problems.push(`bad tx studentId ${bad.studentId} ≠ ${STUDENT_ID}`);
      if (bad.amount !== BAD_ADJ_AMOUNT) problems.push(`bad ADJ amount ${bad.amount} ≠ ${BAD_ADJ_AMOUNT}`);

      // 05-20 attendance: PRESENT, not cancelled
      const att = await tx.attendance.findUnique({
        where: { id: ATT_0520_ID },
        select: { id: true, status: true, cancellationId: true, studentId: true, date: true },
      });
      if (!att) problems.push(`05-20 attendance ${ATT_0520_ID} topilmadi`);
      else {
        if (att.studentId !== STUDENT_ID) problems.push(`05-20 att studentId ${att.studentId} ≠ ${STUDENT_ID}`);
        if (att.status !== 'PRESENT') problems.push(`05-20 att status ${att.status} ≠ PRESENT`);
        if (att.cancellationId) problems.push(`05-20 att cancellationId o'rnatilgan`);
      }

      // 05-20 must be genuinely unbilled: active CONSUMPTION exists, NO active DEDUCTION
      const activeDed0520 = await tx.transaction.count({
        where: { attendanceId: ATT_0520_ID, type: 'LESSON_DEDUCTION', reversedAt: null },
      });
      const activeCons0520 = await tx.transaction.count({
        where: { attendanceId: ATT_0520_ID, type: 'LESSON_CONSUMPTION', reversedAt: null },
      });
      if (activeDed0520 !== 0) problems.push(`05-20 da kutilmagan ${activeDed0520} ta aktiv LESSON_DEDUCTION bor — qo'lda ko'ring`);
      if (activeCons0520 !== 1) problems.push(`05-20 aktiv LESSON_CONSUMPTION ${activeCons0520} ≠ 1`);

      if (problems.length) throw new Error("DRIFT GUARD — holat o'zgargan, yozilmadi:\n   - " + problems.join('\n   - '));

      let running = before;

      // ── 1) reverse the erroneous ADJUSTMENT (canonical) ──────────────────
      const reversalAmount = -bad.amount; // +166,665
      const r1Before = running;
      const r1After = running + reversalAmount;
      await tx.transaction.update({
        where: { id: bad.id },
        data: { reversedAt: new Date(), reversedById: PERFORMED_BY },
      });
      await tx.transaction.create({
        data: {
          type: 'ADJUSTMENT',
          amount: reversalAmount,
          balanceBefore: r1Before,
          balanceAfter: r1After,
          studentId: STUDENT_ID,
          branchId: bad.branchId,
          companyId: bad.companyId ?? COMPANY_ID,
          performedById: PERFORMED_BY,
          reversedTransactionId: bad.id,
          description:
            "Xato ADJUSTMENT bekor qilindi: fantom/aprel sanalari (21,23,26,28/04, 19/05) " +
            "davomatda mavjud emas va aprel darslari billing siyosatiga zid. #10284",
          metadata: { marker: MARKER, scope: 'single-student-manual', step: 'reverse-bad-adjustment' },
        },
      });
      running = r1After;

      // ── 2) charge the genuinely-unbilled 05-20 PRESENT lesson ────────────
      const r2Before = running;
      const r2After = running - PER_LESSON;
      await tx.transaction.create({
        data: {
          type: 'ADJUSTMENT',
          amount: -PER_LESSON,
          balanceBefore: r2Before,
          balanceAfter: r2After,
          studentId: STUDENT_ID,
          attendanceId: ATT_0520_ID,
          branchId: bad.branchId,
          companyId: COMPANY_ID,
          performedById: PERFORMED_BY,
          description:
            "2026-05-20 PRESENT darsi hisoblanmay qolgan edi (yagona deduction reversed " +
            "to'liq-tsikl partiyasi edi) — shu real dars uchun hisob. #10284",
          metadata: { marker: MARKER, scope: 'single-student-manual', step: 'charge-unbilled-2026-05-20', perLessonCost: PER_LESSON },
        },
      });
      running = r2After;

      cap.after = running;
      if (running !== EXPECTED_AFTER) throw new Error(`yakuniy balans ${running} ≠ kutilgan ${EXPECTED_AFTER}`);

      await tx.student.update({ where: { id: STUDENT_ID }, data: { balance: running } });

      if (DRY_RUN) throw new DryRunAbort();
    };

    try {
      await prisma.$transaction(exec, {
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

  if (cap.skip) { console.log('SKIP:', cap.skip); return; }

  console.log(`O'quvchi      : #${STUDENT_ID} ${cap.name}`);
  console.log(`1) Bekor qildi: xato ADJUSTMENT ${som(BAD_ADJ_AMOUNT)} (fantom/aprel)  → +${som(-BAD_ADJ_AMOUNT)}`);
  console.log(`2) Hisobladi  : 2026-05-20 PRESENT darsi  → ${som(-PER_LESSON)}`);
  console.log(`Balans        : ${som(cap.before)} → ${som(cap.after)}  (net +${som(-BAD_ADJ_AMOUNT - PER_LESSON)})`);
  console.log('--------------------------------------------------------------------------');
  console.log(DRY_RUN ? 'DRY RUN — hech narsa saqlanmadi (rollback).' : 'APPLY — saqlandi (commit).');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
