/**
 * ONE-OFF MANUAL CORRECTION — Student #10572 (Sarvar Abduqaxxorov).
 *
 * CEO decision (THIS student only): the student never actually attended. The
 * 4 lessons (06-06 PRESENT, 06-09/11/13 ABSENT) each generated a phantom
 * LESSON_DEDUCTION of -33,333 with NO payment ever made (balance 0 → -133,332)
 * and NO salary accrual (teacher #10473 was never credited). The whole debt is
 * unbacked phantom billing — zero it out.
 *
 * Actions (ONE Serializable tx, drift-guarded, idempotent):
 *  1. Reverse the 4 LESSON_DEDUCTION rows (canonical reversedAt + inverse
 *     entry, mirroring TransactionsWriteService.reverseTransaction) → balance
 *     -133,332 → 0.
 *  2. Reverse the 4 matching LESSON_CONSUMPTION rows (amount 0 — keeps the
 *     lesson-trail/Darslar tab consistent with the reversed deductions).
 *  3. Flip the 4 attendances → EXCUSED so they become non-billable: the
 *     fair-balance reconciliation stays at 0 and a future payment's retroactive
 *     billing will NOT re-bill them (EXCUSED is outside the BILLABLE set).
 *
 * No salary accruals exist for this student, so there is no teacher-pay to
 * unwind. Enrollment is already DROPPED with prepaid 0 — untouched.
 *
 * Usage (from server/):
 *   dry-run: railway run npx ts-node --transpile-only scripts/fix-phantom-10572.ts
 *   apply:   railway run npx ts-node --transpile-only scripts/fix-phantom-10572.ts --apply
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DRY_RUN = !process.argv.slice(2).includes('--apply');

const STUDENT_ID = 10572;
const COMPANY_ID = 1001;
const PERFORMED_BY = 10456; // CEO Ahror Soliyev
const MARKER = 'phantom-reversal-10572-2026-06';
const PER_LESSON = 33333;

const EXPECTED_BALANCE = -133332;
const EXPECTED_AFTER = 0;

// 4 phantom lessons (chronological). Each: deduction + its consumption + attendance.
const LESSONS = [
  { date: '2026-06-06', status: 'PRESENT', att: 'd0ac57dc-6e2e-4668-8bb5-887dc5bbf909', ded: '6808775b-ef34-4058-b823-5866dc3a93e4', cons: '819bb7d5-9c9e-407a-9612-a2bb05d94819' },
  { date: '2026-06-09', status: 'ABSENT',  att: 'ad884e36-8143-423d-8bc1-7b972e775485', ded: '46cd7d0d-5335-4ef7-ac99-690d3936be28', cons: '19b25dfd-1385-4cfc-b723-8d3a6218e414' },
  { date: '2026-06-11', status: 'ABSENT',  att: '99160531-5cfb-4903-abe4-4ea5f8d5d283', ded: '2ff92d2f-3c0a-4428-b62b-34a61f1067f6', cons: '32d3c144-b2f7-493e-acb0-fed38545134b' },
  { date: '2026-06-13', status: 'ABSENT',  att: 'f6133a35-767f-4873-b7d7-8703f99538d5', ded: 'c4c90159-b8e2-418c-9ac1-878d8d18a9b3', cons: '992f11eb-b39a-422a-835d-67fbb05642dc' },
];

class DryRunAbort extends Error {}
const som = (n: number) => n.toLocaleString('ru-RU') + " so'm";

async function main() {
  console.log('====== FIX #10572 — phantom deduction reversal + EXCUSE ======');
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log('Mode   :', DRY_RUN ? 'DRY RUN (rollback)' : 'APPLY (commit!)');
  console.log('--------------------------------------------------------------');

  const cap: Record<string, any> = {};
  try {
    const run = async (tx: Prisma.TransactionClient) => {
      // ── idempotency: any of the 4 deductions already reversed? ───────────
      const alreadyReversed = await tx.transaction.findFirst({
        where: { id: { in: LESSONS.map((l) => l.ded) }, reversedAt: { not: null } },
        select: { id: true },
      });
      if (alreadyReversed) {
        cap.skip = `allaqachon qo'llanilgan (deduction ${alreadyReversed.id} reversedAt set)`;
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

      // No accruals must exist (else we would have teacher-pay to unwind).
      const accr = await tx.salaryAccrual.count({ where: { studentId: STUDENT_ID } });
      if (accr !== 0) problems.push(`kutilmagan ${accr} ta SalaryAccrual mavjud — qo'lda ko'rib chiqing`);

      // 4 deductions: active, -33,333.
      const deds = await tx.transaction.findMany({
        where: { id: { in: LESSONS.map((l) => l.ded) }, type: 'LESSON_DEDUCTION', reversedAt: null },
        select: { id: true, amount: true },
      });
      if (deds.length !== 4) problems.push(`aktiv LESSON_DEDUCTION ${deds.length}/4`);
      for (const d of deds) if (d.amount !== -PER_LESSON) problems.push(`deduction ${d.id} amount ${d.amount} ≠ ${-PER_LESSON}`);

      // 4 consumptions: active, amount 0.
      const cons = await tx.transaction.findMany({
        where: { id: { in: LESSONS.map((l) => l.cons) }, type: 'LESSON_CONSUMPTION', reversedAt: null },
        select: { id: true, amount: true },
      });
      if (cons.length !== 4) problems.push(`aktiv LESSON_CONSUMPTION ${cons.length}/4`);
      for (const c of cons) if (c.amount !== 0) problems.push(`consumption ${c.id} amount ${c.amount} ≠ 0`);

      // 4 attendances: expected status, not cancelled.
      const atts = await tx.attendance.findMany({
        where: { id: { in: LESSONS.map((l) => l.att) } },
        select: { id: true, status: true, cancellationId: true },
      });
      if (atts.length !== 4) problems.push(`attendance ${atts.length}/4 topildi`);
      for (const l of LESSONS) {
        const a = atts.find((x) => x.id === l.att);
        if (!a) { problems.push(`attendance ${l.att} (${l.date}) topilmadi`); continue; }
        if (a.status !== l.status) problems.push(`attendance ${l.date} status ${a.status} ≠ ${l.status}`);
        if (a.cancellationId) problems.push(`attendance ${l.date} cancellationId o'rnatilgan`);
      }

      if (problems.length) throw new Error("DRIFT GUARD — holat o'zgargan, yozilmadi:\n   - " + problems.join('\n   - '));

      // ── 1+2) reverse each deduction then its consumption ─────────────────
      let running = before;
      const reverseOne = async (originalId: string) => {
        const orig = await tx.transaction.findUnique({ where: { id: originalId } });
        if (!orig) throw new Error(`original ${originalId} yo'q`);
        const reversalAmount = -orig.amount;
        const balBefore = running;
        const balAfter = running + reversalAmount;
        // Mark original reversed FIRST (partial-unique on reversedAt IS NULL).
        await tx.transaction.update({
          where: { id: orig.id },
          data: { reversedAt: new Date(), reversedById: PERFORMED_BY },
        });
        await tx.transaction.create({
          data: {
            type: orig.type,
            amount: reversalAmount,
            balanceBefore: balBefore,
            balanceAfter: balAfter,
            studentId: orig.studentId,
            attendanceId: orig.attendanceId,
            enrollmentId: orig.enrollmentId,
            branchId: orig.branchId,
            companyId: orig.companyId,
            performedById: PERFORMED_BY,
            reversedTransactionId: orig.id,
            description: "Phantom dars to'lovi bekor qilindi (o'quvchi kelmagan): #10572",
            metadata: { marker: MARKER, scope: 'single-student-manual', reason: 'student never attended; unbacked phantom deduction' },
          },
        });
        running = balAfter;
      };

      for (const l of LESSONS) {
        await reverseOne(l.ded);  // -33,333 → +33,333 (balance moves up)
        await reverseOne(l.cons); // amount 0 (marker only)
      }
      cap.after = running;
      if (running !== EXPECTED_AFTER) throw new Error(`yakuniy balans ${running} ≠ kutilgan ${EXPECTED_AFTER}`);

      await tx.student.update({ where: { id: STUDENT_ID }, data: { balance: running } });

      // ── 3) attendances → EXCUSED ─────────────────────────────────────────
      const flipped = await tx.attendance.updateMany({
        where: { id: { in: LESSONS.map((l) => l.att) }, status: { in: ['PRESENT', 'ABSENT'] } },
        data: { status: 'EXCUSED' },
      });
      cap.flipped = flipped.count;
      if (flipped.count !== 4) throw new Error(`EXCUSED flip ${flipped.count}/4 — abort`);

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
  console.log(`Bekor qilindi : 4 × LESSON_DEDUCTION (${som(PER_LESSON)}) + 4 × LESSON_CONSUMPTION`);
  console.log(`Balans        : ${som(cap.before)} → ${som(cap.after)}`);
  console.log(`EXCUSED qildi : ${cap.flipped} dars (06-06, 06-09, 06-11, 06-13)`);
  console.log('--------------------------------------------------------------');
  console.log(DRY_RUN ? 'DRY RUN — hech narsa saqlanmadi (rollback).' : 'APPLY — saqlandi (commit).');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
