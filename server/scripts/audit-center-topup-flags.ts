/**
 * audit-center-topup-flags — READ-ONLY. How much of the «Qolgan (markaz)»
 * figure (Z, `isCenterTopUp`) belongs to students who owe nothing today.
 *
 * Known defect (server/CLAUDE.md, «SalaryCenterTopUpService»): under the
 * 12-lesson model `isCenterTopUp` is cleared only when retroactive billing
 * settles a previously unbilled lesson. A debtor's lesson was billed at once
 * (the balance just went negative), so a later payment never cleared the flag
 * and Z of those months reads high. Spec:
 * docs/superpowers/specs/2026-09-28-markaz-birinchi-dars-design.md, item 11.
 *
 * Per month (by the accrual's `lessonDate`), it prints the live fronted
 * accruals (`isCenterTopUp`, not reversed) and splits them by the student's
 * balance TODAY: `>= 0` → the student has paid everything they owe, so the
 * centre has its money back and the flag is stale; `< 0` → still owed. A
 * balance settles oldest-first across every month, so a student at zero has
 * paid every past month; a student still in debt may have paid some of it —
 * the second line is an upper bound, not a claim.
 *
 * Nothing is written, and the connection is opened read-only and checked.
 * The figures are printed, never stored in the repository.
 *
 *   DATABASE_URL=… npx ts-node --transpile-only scripts/audit-center-topup-flags.ts \
 *     [--company=1] [--from=2026-07] [--details]
 */
import { PrismaService } from '../src/prisma/prisma.service';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const COMPANY = Number(arg('company') ?? 1);
const FROM = arg('from') ?? '2026-07';
const DETAILS = args.includes('--details');

const fmt = (n: number) => n.toLocaleString('ru-RU');

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

interface Bucket {
  lessons: number;
  amount: number;
  students: Set<number>;
}

const emptyBucket = (): Bucket => ({
  lessons: 0,
  amount: 0,
  students: new Set(),
});

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  if (!/^\d{4}-\d{2}$/.test(FROM)) throw new Error('--from must be YYYY-MM');

  process.env.DATABASE_URL = readOnlyUrl(url);
  const prisma = new PrismaService();
  try {
    const [ro] = await prisma.$queryRaw<
      { default_transaction_read_only: string }[]
    >`SHOW default_transaction_read_only`;
    if (ro?.default_transaction_read_only !== 'on') {
      throw new Error('The connection is not read-only; refusing to run');
    }

    const fronted = await prisma.salaryAccrual.findMany({
      where: {
        companyId: COMPANY,
        isCenterTopUp: true,
        reversedAt: null,
        lessonDate: { gte: new Date(`${FROM}-01T00:00:00.000Z`) },
      },
      select: { studentId: true, lessonDate: true, amount: true },
    });
    const studentIds = [...new Set(fronted.map((a) => a.studentId))];
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, balance: true },
    });
    const balance = new Map(students.map((s) => [s.id, s.balance]));

    const months = new Map<string, { paid: Bucket; owing: Bucket }>();
    const perStudent = new Map<string, number>();
    for (const a of fronted) {
      // `lessonDate` is a @db.Date: its UTC calendar date is the day.
      const month = a.lessonDate.toISOString().slice(0, 7);
      const row = months.get(month) ?? {
        paid: emptyBucket(),
        owing: emptyBucket(),
      };
      months.set(month, row);
      const paid = (balance.get(a.studentId) ?? 0) >= 0;
      const b = paid ? row.paid : row.owing;
      b.lessons += 1;
      b.amount += a.amount;
      b.students.add(a.studentId);
      if (paid) {
        const key = `${month} #${a.studentId}`;
        perStudent.set(key, (perStudent.get(key) ?? 0) + a.amount);
      }
    }

    console.log(`Company ${COMPANY}, fronted accruals from ${FROM}:\n`);
    let staleTotal = 0;
    for (const month of [...months.keys()].sort()) {
      const { paid, owing } = months.get(month)!;
      staleTotal += paid.amount;
      console.log(
        `${month}  Z = ${fmt(paid.amount + owing.amount)}\n` +
          `  owes nothing today (flag stale): ${fmt(paid.amount)} — ` +
          `${paid.lessons} lessons, ${paid.students.size} students\n` +
          `  still in debt (upper bound):     ${fmt(owing.amount)} — ` +
          `${owing.lessons} lessons, ${owing.students.size} students`,
      );
    }
    console.log(`\nStale in all: ${fmt(staleTotal)}`);

    if (DETAILS) {
      console.log('\nStale per month and student:');
      for (const [key, amount] of [...perStudent].sort()) {
        console.log(`  ${key}: ${fmt(amount)}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
