/**
 * ONE-OFF MANUAL CORRECTION — Student #10198 (Абдулбосид Алижонов).
 *
 * CEO decision (NOT a general rule — applies to THIS student only):
 *  The 5 ABSENT May lessons (12/14/16/19.05, 21.05) were billed −33,333 each
 *  by the 2026-05-17 backfill. The student stopped coming; the CEO excuses
 *  those 5 lessons and refunds the money. The 02.05 PRESENT lesson stays
 *  billed (student attended) and the teacher is credited 50% for it.
 *
 * Actions (all in ONE Serializable tx, drift-guarded, marker-idempotent):
 *  1. ADJUSTMENT +166,665 → balance 4 → 166,669 (refund the 5 ABSENT lessons).
 *  2. Flip the 5 ABSENT attendances → EXCUSED (so they are non-billable and
 *     the fair-balance reconciliation stays at 0). Their existing
 *     LESSON_DEDUCTION/LESSON_CONSUMPTION rows are left in place (append-only;
 *     the ADJUSTMENT nets them out, and EXCUSED keeps retroactive billing off).
 *  3. Create the 02.05 teacher accrual: #10005, 16,667 (50% of 33,333),
 *     lessonDate 2026-05-02 (real, for rate/audit), creditPeriodDate = current
 *     open period start (June) so it is paid 01.07 alongside the June accruals
 *     — the teacher's config only exists from 31.05, so May can't bucket it.
 *
 * Usage (from server/):
 *   dry-run: railway run npx ts-node --transpile-only scripts/fix-10198-may-absent-refund.ts
 *   apply:   railway run npx ts-node --transpile-only scripts/fix-10198-may-absent-refund.ts --apply
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { resolveCurrentPeriod } from '../src/salary/shared/resolve-current-period';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DRY_RUN = !process.argv.slice(2).includes('--apply');

const STUDENT_ID = 10198;
const COMPANY_ID = 1001;
const PERFORMED_BY = 10456; // CEO Ahror Soliyev
const TEACHER_ID = 10005; // Gulnozaxon Saloxiddinova
const GROUP5_ID = '4c8952bb-15d0-4454-85e3-2c4cf8014c87'; // #005 (DROPPED)
const MARKER = 'absent-refund-10198-2026-05';
const PER_LESSON = 33333;

const EXPECTED_BALANCE = 4;
const REFUND = 5 * PER_LESSON; // 166,665
const EXPECTED_AFTER = EXPECTED_BALANCE + REFUND; // 166,669
const TEACHER_RATE = 0.5;
const ACCRUAL_AMOUNT = Math.round(PER_LESSON * TEACHER_RATE); // 16,667

// The 5 ABSENT lessons to excuse + refund (attendanceId → its LESSON_DEDUCTION).
const ABSENT = [
  { date: '2026-05-12', attId: 'f5afff7d-eb88-43d2-9499-2c84200ab3c0', dedId: '3c6f92d6-9788-4681-99f1-277ff7d67a84' },
  { date: '2026-05-14', attId: '125f9a8a-9fd9-4329-bc3b-43768c4c1fc2', dedId: '6ba7144d-512c-4d4c-84aa-5126c8f161d4' },
  { date: '2026-05-16', attId: '2866b58b-56bf-4bf0-aaf0-9df270c4d53d', dedId: '3230ca9b-5243-4787-9916-870e9f0ffbe7' },
  { date: '2026-05-19', attId: 'b3ae1bfe-b496-4e1e-9fdb-ecdada2f0baa', dedId: 'f5d94afe-9b95-4372-81d0-9b3243987f10' },
  { date: '2026-05-21', attId: 'b9490565-d60f-44fe-9fb4-878b733fd8d9', dedId: '9529c91f-27fa-47dc-8690-c7d1ac0a6fe4' },
];
// 02.05 PRESENT — kept billed; teacher credited for it.
const PRESENT_0205 = { date: '2026-05-02', attId: '8695c5a6-bddf-43e5-ac02-8866658a565e', dedId: 'e5bb6407-be80-475a-908a-4fd4e09bc7a6' };

class DryRunAbort extends Error {}
const som = (n: number) => n.toLocaleString('ru-RU') + " so'm";
const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

async function main() {
  console.log('====== FIX #10198 — May ABSENT refund + 02.05 teacher accrual ======');
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log('Mode   :', DRY_RUN ? 'DRY RUN (rollback)' : 'APPLY (commit!)');
  console.log('--------------------------------------------------------------------');

  const now = new Date();
  const { periodStart, periodEnd } = await resolveCurrentPeriod(prisma as any, COMPANY_ID, now);
  console.log(`Joriy ochiq davr: ${day(periodStart)} .. ${day(periodEnd)} → creditPeriodDate = ${periodStart.toISOString()}`);

  const cap: Record<string, any> = {};
  try {
    const run = async (tx: Prisma.TransactionClient) => {
      // ── idempotency ────────────────────────────────────────────────────
      const existing = await tx.transaction.findFirst({
        where: {
          studentId: STUDENT_ID, type: 'ADJUSTMENT', reversedAt: null,
          metadata: { path: ['marker'], equals: MARKER },
        },
        select: { id: true },
      });
      if (existing) { cap.skip = `allaqachon qo'llanilgan (ADJUSTMENT #${existing.id})`; return; }

      // ── lock + read student ────────────────────────────────────────────
      const locked = await tx.$queryRaw<{ balance: number; companyId: number; firstName: string; lastName: string }[]>`
        SELECT balance, "companyId", "firstName", "lastName" FROM "Student" WHERE id = ${STUDENT_ID} FOR UPDATE`;
      if (!locked.length) throw new Error("O'quvchi topilmadi");
      const before = locked[0].balance;
      cap.name = `${locked[0].firstName} ${locked[0].lastName}`.trim();
      cap.before = before;

      // ── DRIFT GUARD ────────────────────────────────────────────────────
      const problems: string[] = [];
      if (locked[0].companyId !== COMPANY_ID) problems.push(`companyId ${locked[0].companyId} ≠ ${COMPANY_ID}`);
      if (before !== EXPECTED_BALANCE) problems.push(`balans ${before} ≠ kutilgan ${EXPECTED_BALANCE}`);

      // 5 ABSENT deductions must be active −33,333
      const deds = await tx.transaction.findMany({
        where: { id: { in: ABSENT.map((a) => a.dedId) }, type: 'LESSON_DEDUCTION', reversedAt: null },
        select: { id: true, amount: true },
      });
      if (deds.length !== 5) problems.push(`aktiv ABSENT deduction ${deds.length}/5`);
      for (const d of deds) if (d.amount !== -PER_LESSON) problems.push(`deduction ${d.id} amount ${d.amount} ≠ ${-PER_LESSON}`);

      // 5 attendances must currently be ABSENT
      const absAtts = await tx.attendance.findMany({
        where: { id: { in: ABSENT.map((a) => a.attId) } },
        select: { id: true, status: true },
      });
      if (absAtts.length !== 5) problems.push(`ABSENT attendance ${absAtts.length}/5 topildi`);
      for (const a of absAtts) if (a.status !== 'ABSENT') problems.push(`attendance ${a.id} status ${a.status} ≠ ABSENT`);

      // 02.05 must be PRESENT + its deduction active
      const p0205 = await tx.attendance.findUnique({ where: { id: PRESENT_0205.attId }, select: { status: true } });
      if (p0205?.status !== 'PRESENT') problems.push(`02.05 attendance status ${p0205?.status} ≠ PRESENT`);
      const ded0205 = await tx.transaction.findFirst({
        where: { id: PRESENT_0205.dedId, type: 'LESSON_DEDUCTION', reversedAt: null }, select: { id: true },
      });
      if (!ded0205) problems.push('02.05 deduction aktiv emas/topilmadi');

      // no pre-existing 02.05 accrual
      const accrExists = await tx.salaryAccrual.findFirst({
        where: { userId: TEACHER_ID, studentId: STUDENT_ID, groupId: GROUP5_ID, attendanceId: PRESENT_0205.attId },
        select: { id: true },
      });
      if (accrExists) problems.push(`02.05 accrual allaqachon mavjud (#${accrExists.id})`);

      if (problems.length) throw new Error('DRIFT GUARD — holat o\'zgargan, yozilmadi:\n   - ' + problems.join('\n   - '));

      const after = before + REFUND;
      if (after !== EXPECTED_AFTER) throw new Error(`yakuniy ${after} ≠ kutilgan ${EXPECTED_AFTER}`);

      // ── 1) ADJUSTMENT refund ───────────────────────────────────────────
      const adj = await tx.transaction.create({
        data: {
          type: 'ADJUSTMENT',
          amount: REFUND,
          balanceBefore: before,
          balanceAfter: after,
          studentId: STUDENT_ID,
          companyId: COMPANY_ID,
          performedById: PERFORMED_BY,
          description:
            "Kelmagan (ABSENT) 5 dars uchun yechilgan to'lov qaytarildi: 12/14/16/19.05 va 21.05. " +
            "O'quvchi bu darslarga kelmagani uchun darslar 'sababli' (EXCUSED) qilindi va puli balansga qaytarildi.",
          metadata: {
            marker: MARKER,
            scope: 'single-student-manual',
            refundedLessons: ABSENT.map((a) => a.date),
            perLesson: PER_LESSON,
            balanceBefore: before,
            balanceAfter: after,
          },
        },
      });
      cap.adjId = adj.id;
      cap.after = after;

      await tx.student.update({ where: { id: STUDENT_ID }, data: { balance: after } });

      // ── 2) ABSENT → EXCUSED ────────────────────────────────────────────
      const flipped = await tx.attendance.updateMany({
        where: { id: { in: ABSENT.map((a) => a.attId) }, status: 'ABSENT' },
        data: { status: 'EXCUSED' },
      });
      cap.flipped = flipped.count;
      if (flipped.count !== 5) throw new Error(`EXCUSED flip ${flipped.count}/5 — abort`);

      // ── 3) 02.05 teacher accrual (50%) ─────────────────────────────────
      const accr = await tx.salaryAccrual.create({
        data: {
          userId: TEACHER_ID,
          studentId: STUDENT_ID,
          groupId: GROUP5_ID,
          attendanceId: PRESENT_0205.attId,
          lessonDate: new Date('2026-05-02T00:00:00.000Z'),
          amount: ACCRUAL_AMOUNT,
          perLessonCost: PER_LESSON,
          deductionTransactionId: PRESENT_0205.dedId,
          creditPeriodDate: periodStart, // carry into current open period (June) → paid 01.07
          companyId: COMPANY_ID,
        },
      });
      cap.accrId = accr.id;

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

  if (cap.skip) { console.log('SKIP:', cap.skip); return; }

  console.log(`O'quvchi      : #${STUDENT_ID} ${cap.name}`);
  console.log(`Refund        : +${som(REFUND)}  (5 × ${som(PER_LESSON)})`);
  console.log(`Balans        : ${som(cap.before)} → ${som(cap.after)}`);
  console.log(`EXCUSED qildi : ${cap.flipped} dars (12/14/16/19.05, 21.05)`);
  console.log(`Ustoz accrual : #${TEACHER_ID} +${som(ACCRUAL_AMOUNT)} (02.05, 50%) → ${day(periodStart)} davriga`);
  if (!DRY_RUN) {
    console.log(`  ADJUSTMENT id : ${cap.adjId}`);
    console.log(`  Accrual id    : ${cap.accrId}`);
  }
  console.log('--------------------------------------------------------------------');
  console.log(DRY_RUN ? 'DRY RUN — hech narsa saqlanmadi (rollback).' : 'APPLY — saqlandi (commit).');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
