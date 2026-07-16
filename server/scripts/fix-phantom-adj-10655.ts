/**
 * ONE-OFF MANUAL CORRECTION — Student #10655 (Omina Madraximova, EXPELLED).
 *
 * The #10655 phantom-credit pattern (DB-wide audit 2026-07-16 confirmed this is
 * the ONLY genuine case). Timeline:
 *   - 9 lessons were deducted (33,333 + a 266,664 full-cycle bulk batch) although
 *     only 3 were billable (2 PRESENT + 1 ABSENT). Over-deducted by 6 lessons.
 *   - 2026-07-02 ADJUSTMENT +199,998 "O'quvchi muzlatildi" CORRECTLY reversed the
 *     6-lesson over-deduction -> balance became the fair 200,001 (= 300,000 paid
 *     - 99,999 for 3 lessons). This entry is LEGITIMATE and is kept.
 *   - 2026-07-03 ADJUSTMENT +233,331 "Refund: foydalanilmagan darslar balansga
 *     qaytarildi" refunded "unused lessons" a SECOND time (there were none left)
 *     -> balance 433,332. This is the PHANTOM duplicate.
 *   - 2026-07-03 REFUND -200,000 cash returned to the student (legitimate — she
 *     overpaid ~200,001 and got it back) -> balance 233,332.
 *
 * Fair position = 300,000 paid - 99,999 (3 lessons) - 200,000 cash refund = 1.
 * Current balance 233,332 => phantom credit of 233,331 = exactly the 07-03 ADJ.
 *
 * Action (ONE Serializable tx, drift-guarded, idempotent):
 *   Reverse the phantom ADJUSTMENT +233,331 (canonical reversedAt + inverse
 *   -233,331 entry, mirroring TransactionsWriteService.reverseTransaction).
 *   balance 233,332 -> 1.  No salary accrual attached (pure balance credit).
 *   The legitimate +199,998 freeze correction and the -200,000 cash refund are
 *   left untouched. Enrollment prepaid untouched (0, DROPPED).
 *
 * Usage (from server/):
 *   dry-run: railway run npx ts-node --transpile-only scripts/fix-phantom-adj-10655.ts
 *   apply:   railway run npx ts-node --transpile-only scripts/fix-phantom-adj-10655.ts --apply
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DRY_RUN = !process.argv.slice(2).includes('--apply');

const STUDENT_ID = 10655;
const COMPANY_ID = 1001;
const PERFORMED_BY = 10456; // CEO Ahror Soliyev (same performer as prior fix scripts)
const MARKER = 'phantom-adj-10655-2026-07';

const BAD_ADJ_ID = '9686a303-6309-43ef-9e81-eb2ba55a8e92'; // +233,331, 2026-07-03 11:29
const BAD_ADJ_AMOUNT = 233331;

const EXPECTED_BALANCE = 233332;
const EXPECTED_AFTER = 1; // 233,332 - 233,331

class DryRunAbort extends Error {}
const som = (n: number) => n.toLocaleString('ru-RU') + " so'm";

async function main() {
  console.log('====== FIX #10655 — phantom (duplicate) ADJUSTMENT reversal ======');
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log('Mode   :', DRY_RUN ? 'DRY RUN (rollback)' : 'APPLY (commit!)');
  console.log('------------------------------------------------------------------');

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
        { balance: number; companyId: number; firstName: string; lastName: string; status: string }[]
      >`SELECT balance, "companyId", "firstName", "lastName", status FROM "Student" WHERE id = ${STUDENT_ID} FOR UPDATE`;
      if (!locked.length) throw new Error("O'quvchi topilmadi");
      const before = locked[0].balance;
      cap.name = `${locked[0].firstName} ${locked[0].lastName}`.trim();
      cap.before = before;
      cap.status = locked[0].status;

      // ── DRIFT GUARD ──────────────────────────────────────────────────────
      const problems: string[] = [];
      if (locked[0].companyId !== COMPANY_ID) problems.push(`companyId ${locked[0].companyId} ≠ ${COMPANY_ID}`);
      if (before !== EXPECTED_BALANCE) problems.push(`balans ${before} ≠ kutilgan ${EXPECTED_BALANCE}`);
      if (bad.type !== 'ADJUSTMENT') problems.push(`bad tx type ${bad.type} ≠ ADJUSTMENT`);
      if (bad.studentId !== STUDENT_ID) problems.push(`bad tx studentId ${bad.studentId} ≠ ${STUDENT_ID}`);
      if (bad.amount !== BAD_ADJ_AMOUNT) problems.push(`bad ADJ amount ${bad.amount} ≠ ${BAD_ADJ_AMOUNT}`);
      if (problems.length) throw new Error("DRIFT GUARD — holat o'zgargan, yozilmadi:\n   - " + problems.join('\n   - '));

      let running = before;

      // ── reverse the phantom ADJUSTMENT (canonical) ───────────────────────
      const reversalAmount = -bad.amount; // -233,331
      const rBefore = running;
      const rAfter = running + reversalAmount;
      await tx.transaction.update({
        where: { id: bad.id },
        data: { reversedAt: new Date(), reversedById: PERFORMED_BY },
      });
      await tx.transaction.create({
        data: {
          type: 'ADJUSTMENT',
          amount: reversalAmount,
          balanceBefore: rBefore,
          balanceAfter: rAfter,
          studentId: STUDENT_ID,
          branchId: bad.branchId,
          companyId: bad.companyId ?? COMPANY_ID,
          performedById: PERFORMED_BY,
          reversedTransactionId: bad.id,
          description:
            "Fantom ADJUSTMENT bekor qilindi: 2026-07-03 dagi +233 331 'foydalanilmagan darslar' " +
            "qaytarmasi dublikat edi (07-02 muzlatish tuzatuvi +199 998 allaqachon balansni to'g'rilagan; " +
            "keyin -200 000 naqd refund berilgan). Adolatli balans = 1. #10655",
          metadata: { marker: MARKER, scope: 'single-student-manual', step: 'reverse-phantom-adjustment' },
        },
      });
      running = rAfter;

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

  console.log(`O'quvchi      : #${STUDENT_ID} ${cap.name}  [${cap.status}]`);
  console.log(`Bekor qildi   : fantom ADJUSTMENT ${som(BAD_ADJ_AMOUNT)} (07-03 dublikat)  → ${som(-BAD_ADJ_AMOUNT)}`);
  console.log(`Balans        : ${som(cap.before)} → ${som(cap.after)}`);
  console.log('------------------------------------------------------------------');
  console.log(DRY_RUN ? 'DRY RUN — hech narsa saqlanmadi (rollback).' : 'APPLY — saqlandi (commit).');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
