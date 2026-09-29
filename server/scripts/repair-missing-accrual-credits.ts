/**
 * Writes the SALARY_ACCRUAL credits that live accruals are missing (ADR-0050).
 *
 * The 26.09.2026 monthly-billing migration reversed every September lesson's
 * credit and re-wrote the accrual at the frozen price, but the re-credit was
 * skipped: `applyAccrualToBalance` matched the reversal row as "already
 * credited". 3 054 September accruals (53.9 mln so'm, 15 teachers) were left
 * with no live credit, so `User.balance` reads that much low. The accruals
 * themselves — what payroll is computed from — are right and are NOT touched.
 *
 * A lesson qualifies when its accrual is live, its credit WAS reversed, and no
 * live credit exists. One credit per lesson at the accrual's amount, branch =
 * the group's (D3), balances chained per teacher under a row lock. Each
 * teacher is one Serializable transaction that re-selects its own lessons, so
 * a re-run writes nothing.
 *
 *   railway run npx ts-node --transpile-only scripts/repair-missing-accrual-credits.ts --as=<CEO id>
 *   … --as=<CEO id> --apply
 *
 * Without `--apply` the connection is read-only and nothing is written.
 */
import { Prisma, TransactionType } from '@prisma/client';
import { makePrisma } from './lib/check-cli';
import {
  chainCredits,
  type MissingCredit,
} from './lib/missing-accrual-credits';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const AS = Number(args.find((a) => a.startsWith('--as='))?.slice(5));
const DESCRIPTION =
  "Dars uchun yig'ildi (tiklandi: oylik to'lovga o'tishda yozilmay qolgan)";
const fmt = (n: number) => n.toLocaleString('ru-RU');

type Db = Prisma.TransactionClient;

interface GapRow extends MissingCredit {
  userId: number;
  companyId: number;
}

/** Live accruals whose credit was reversed and never written again. */
function loadGap(db: Db, userId?: number): Promise<GapRow[]> {
  const byUser = userId ? Prisma.sql`AND a."userId" = ${userId}` : Prisma.empty;
  return db.$queryRaw<GapRow[]>`
    SELECT a."userId", a."companyId", a."attendanceId", a.amount::int AS amount,
           a."lessonDate", g."branchId"
    FROM "SalaryAccrual" a
    JOIN "Group" g ON g.id = a."groupId"
    WHERE a."reversedAt" IS NULL AND a."attendanceId" IS NOT NULL ${byUser}
      AND EXISTS (SELECT 1 FROM "Transaction" t WHERE t.type = 'SALARY_ACCRUAL'
                  AND t."attendanceId" = a."attendanceId" AND t."teacherId" = a."userId"
                  AND t."reversedTransactionId" IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM "Transaction" t WHERE t.type = 'SALARY_ACCRUAL'
                  AND t."attendanceId" = a."attendanceId" AND t."teacherId" = a."userId"
                  AND t."reversedTransactionId" IS NULL AND t."reversedAt" IS NULL)`;
}

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

async function main() {
  if (!Number.isInteger(AS) || AS <= 0) {
    throw new Error('Usage: --as=<CEO user id> [--apply]');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!APPLY) process.env.DATABASE_URL = readOnlyUrl(url);
  const prisma = makePrisma();

  try {
    console.log(`DB host: ${new URL(url).host}`);
    if (!APPLY) {
      const [ro] = await prisma.$queryRaw<
        { default_transaction_read_only: string }[]
      >`
        SHOW default_transaction_read_only`;
      if (ro?.default_transaction_read_only !== 'on') {
        throw new Error('Read-only connection was not established — stopping');
      }
    }
    console.log(
      `Mode: ${APPLY ? 'APPLY' : 'DRY RUN — read-only, nothing is written'}`,
    );

    const actor = await prisma.user.findFirst({
      where: {
        id: AS,
        deletedAt: null,
        roles: { some: { role: { name: 'CEO' } } },
      },
      select: { firstName: true, lastName: true },
    });
    if (!actor) throw new Error(`User #${AS} is not a live CEO`);
    console.log(`As: ${actor.firstName} ${actor.lastName}`);

    const gap = await loadGap(prisma);
    const byTeacher = new Map<number, GapRow[]>();
    for (const r of gap)
      byTeacher.set(r.userId, [...(byTeacher.get(r.userId) ?? []), r]);
    const users = await prisma.user.findMany({
      where: { id: { in: [...byTeacher.keys()] } },
      select: { id: true, firstName: true, lastName: true, balance: true },
    });

    let total = 0;
    console.log(
      "\nUstoz | darslar | qo'shiladi | hisob varag'i: hozir -> keyin",
    );
    for (const u of users.sort((a, b) =>
      a.lastName.localeCompare(b.lastName),
    )) {
      const rows = byTeacher.get(u.id)!;
      const plan = chainCredits(u.balance, rows);
      const sum = plan.balanceAfter - u.balance;
      total += sum;
      console.log(
        `#${u.id} ${u.lastName} ${u.firstName} | ${rows.length} | ${fmt(sum)} | ${fmt(u.balance)} -> ${fmt(plan.balanceAfter)}`,
      );
    }
    console.log(
      `\nJAMI: ${gap.length} dars, ${fmt(total)} so'm, ${byTeacher.size} ustoz`,
    );

    if (!APPLY) return;

    for (const teacherId of byTeacher.keys()) {
      await prisma.$transaction(
        async (tx) => {
          // Re-select inside the transaction: a lesson credited meanwhile, or
          // by an earlier run, is simply no longer in the list.
          const rows = await loadGap(tx, teacherId);
          if (rows.length === 0) return;
          const [locked] = await tx.$queryRaw<{ balance: number }[]>`
            SELECT balance FROM "User" WHERE id = ${teacherId} FOR UPDATE`;
          const plan = chainCredits(locked.balance, rows);
          await tx.transaction.createMany({
            data: plan.rows.map((p) => ({
              type: TransactionType.SALARY_ACCRUAL,
              amount: p.amount,
              balanceBefore: p.balanceBefore,
              balanceAfter: p.balanceAfter,
              teacherId,
              attendanceId: p.attendanceId,
              branchId: p.branchId,
              companyId: rows[0].companyId,
              performedById: AS,
              description: DESCRIPTION,
            })),
          });
          await tx.user.update({
            where: { id: teacherId },
            data: { balance: plan.balanceAfter },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 60_000,
        },
      );
    }

    const left = await loadGap(prisma);
    console.log(`\nYozildi. Qolgan kreditsiz dars: ${left.length}`);
    if (left.length !== 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
