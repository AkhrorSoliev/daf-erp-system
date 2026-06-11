/**
 * CORRECTION-OF-CORRECTION — Student #10061.
 *
 * The first pass (fix-overcharge-10061.ts) wrongly treated ABSENT as non-
 * billable and zeroed the balance. The real billing code bills PRESENT, LATE
 * AND ABSENT (lesson-billing.service.ts BILLABLE set) — only EXCUSED is free.
 *
 * Re-count of billable lessons (PRESENT/LATE/ABSENT, on/after startDate 01.05):
 *   15 lessons (12 PRESENT + 3 ABSENT: 05-11, 05-18, 06-01). EXCUSED 06-10 free.
 *   He paid one 12-lesson cycle (400,000). Lessons 13-15 (06-03/05/08) are
 *   cycle-2, unpaid: 3 × 33,333 = 99,999. Correct balance = -99,999.
 *
 * First pass over-credited by 99,999 (balance landed at 0 instead of -99,999).
 * This writes a -99,999 ADJUSTMENT to bring balance 0 -> -99,999 (debt for the
 * 3 unpaid cycle-2 lessons). Append-only; consumptions untouched so a future
 * payment's retroactive billing won't double-bill these lessons.
 *
 * Usage (from server/):
 *   dry-run: railway run -- bash -c 'npx ts-node scripts/fix-overcharge-10061-v2.ts --dry-run'
 *   apply:   railway run -- bash -c 'npx ts-node scripts/fix-overcharge-10061-v2.ts --apply'
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
const STUDENT_ID = 10061;
const COMPANY_ID = 1001;
const PERFORMED_BY = 10456; // CEO Ahror Soliyev
const MARKER = 'overcharge-correction-10061-v2-absent-billable';

// Expected state going in (after v1 zeroed the balance).
const EXPECTED_BALANCE = 0;
const UNPAID_CYCLE2_LESSONS = 3; // 06-03, 06-05, 06-08
const PER_LESSON = 33333;
const DEBIT = -(UNPAID_CYCLE2_LESSONS * PER_LESSON); // -99,999
const EXPECTED_AFTER = -99999;

class DryRunAbort extends Error {}
const som = (n: number) => n.toLocaleString('ru-RU') + " so'm";

async function main() {
  console.log('====== FIX #10061 v2 (ABSENT billable) ======');
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log('Mode   :', DRY_RUN ? 'DRY RUN (rollback)' : 'APPLY (commit!)');
  console.log('---------------------------------------------');

  const cap: Record<string, any> = {};
  try {
    const run = async (tx: Prisma.TransactionClient) => {
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
        cap.skip = `Allaqachon qo'llanilgan (ADJUSTMENT #${existing.id})`;
        return;
      }

      const locked = await tx.$queryRaw<
        { balance: number; firstName: string; lastName: string; companyId: number }[]
      >`SELECT balance, "firstName", "lastName", "companyId" FROM "Student" WHERE id = ${STUDENT_ID} FOR UPDATE`;
      if (!locked.length) throw new Error("O'quvchi topilmadi");
      if (locked[0].companyId !== COMPANY_ID) throw new Error('companyId mos emas');

      const before = locked[0].balance;
      const after = before + DEBIT;
      cap.name = `${locked[0].firstName} ${locked[0].lastName}`.trim();
      cap.before = before;
      cap.after = after;

      const problems: string[] = [];
      if (before !== EXPECTED_BALANCE)
        problems.push(`balans ${before} ≠ kutilgan ${EXPECTED_BALANCE} (v1 dan keyin 0 bo'lishi kerak edi)`);
      if (after !== EXPECTED_AFTER)
        problems.push(`yakuniy ${after} ≠ kutilgan ${EXPECTED_AFTER}`);
      if (problems.length)
        throw new Error('DRIFT GUARD — holat o\'zgargan, yozilmadi:\n   - ' + problems.join('\n   - '));

      const adj = await tx.transaction.create({
        data: {
          type: 'ADJUSTMENT',
          amount: DEBIT,
          balanceBefore: before,
          balanceAfter: after,
          studentId: STUDENT_ID,
          companyId: COMPANY_ID,
          performedById: PERFORMED_BY,
          description:
            "Tuzatishni to'g'rilash: ABSENT (kelmagan) darslar ham pullik. 2-siklning 3 to'lanmagan darsi (06-03, 06-05, 06-08) qarzga olindi. Balans 0 → −99 999.",
          metadata: {
            marker: MARKER,
            corrects: 'overcharge-correction-10061',
            reason: 'ABSENT is billable (lesson-billing BILLABLE set); 3 cycle-2 lessons unpaid',
            unpaidCycle2Lessons: UNPAID_CYCLE2_LESSONS,
            perLesson: PER_LESSON,
            balanceBefore: before,
            balanceAfter: after,
          },
        },
      });
      cap.adjId = adj.id;

      await tx.student.update({ where: { id: STUDENT_ID }, data: { balance: after } });

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
  console.log(`O'quvchi : #${STUDENT_ID} ${cap.name}`);
  console.log(`DEBIT    : ${som(DEBIT)} (3 dars × ${som(PER_LESSON)})`);
  console.log(`Balans   : ${som(cap.before)} → ${som(cap.after)}`);
  if (!DRY_RUN) console.log(`ADJ id   : ${cap.adjId}`);
  console.log('---------------------------------------------');
  console.log(DRY_RUN ? 'DRY RUN — saqlanmadi.' : 'APPLY — saqlandi (commit).');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
