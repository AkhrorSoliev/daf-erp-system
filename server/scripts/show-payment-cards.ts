/**
 * show-payment-cards — READ-ONLY.
 * Bitta o'quvchining "Bu to'lovdan keyin" kartalarini aynan UI ko'radigan
 * ko'rinishda chiqaradi (server bilan bir xil dvigatel).
 *
 *   railway run npx ts-node --transpile-only scripts/show-payment-cards.ts 10460
 */
import { PrismaClient, TransactionType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import {
  replayStudentLedger,
  splitLessonSlices,
  type LessonSlice,
} from '../src/common/finance/ledger-replay';
import { allocateCoverage } from '../src/billing/lesson-coverage.helper';

dotenv.config();
const fmt = (n: number) => n.toLocaleString('ru-RU');
const dd = (d: Date | null) =>
  d ? `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}` : null;

async function main() {
  const studentId = Number(process.argv.find((a) => /^\d+$/.test(a)));
  if (!studentId) throw new Error('Usage: show-payment-cards <studentId>');

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, firstName: true, lastName: true, balance: true },
  });
  if (!student) throw new Error('NOT FOUND');

  const rows = await prisma.transaction.findMany({
    where: { studentId },
    select: {
      id: true,
      type: true,
      amount: true,
      balanceBefore: true,
      balanceAfter: true,
      enrollmentId: true,
      attendanceId: true,
      metadata: true,
      createdAt: true,
      reversedAt: true,
      reversedTransactionId: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const attRows = await prisma.attendance.findMany({
    where: {
      id: {
        in: rows.filter((r) => r.attendanceId).map((r) => r.attendanceId!),
      },
    },
    select: { id: true, date: true },
  });
  const attDates = new Map(attRows.map((a) => [a.id, a.date]));

  const { byDeduction } = allocateCoverage(
    rows
      .filter(
        (r) =>
          (r.type === TransactionType.LESSON_DEDUCTION ||
            r.type === TransactionType.LESSON_CONSUMPTION) &&
          r.reversedAt === null &&
          r.reversedTransactionId === null &&
          !!r.enrollmentId,
      )
      .map((r) => ({
        id: r.id,
        type: r.type,
        amount: r.amount,
        enrollmentId: r.enrollmentId,
        attendanceId: r.attendanceId,
        metadata: r.metadata,
        createdAt: r.createdAt,
      })),
    attDates,
  );

  const timeline = rows.filter((r) => r.amount !== 0);
  const slices = new Map<string, LessonSlice[]>();
  for (const r of timeline) {
    if (r.type !== TransactionType.LESSON_DEDUCTION) continue;
    slices.set(
      r.id,
      splitLessonSlices(
        r.amount,
        r.metadata,
        byDeduction.get(r.id)?.consumedDates ?? [],
      ),
    );
  }

  const replay = replayStudentLedger(timeline, slices);
  const byId = new Map(timeline.map((r) => [r.id, r]));

  console.log(
    `\n#${student.id} ${student.firstName} ${student.lastName} — balans ${fmt(student.balance)} so'm`,
  );
  console.log(`zanjir: ${replay.reconciled ? '✓ mos keladi' : '✗ UZILGAN'}\n`);

  const payments = timeline.filter((r) => r.type === TransactionType.PAYMENT);
  for (const p of payments) {
    const a = replay.byCredit.get(p.id);
    if (!a) continue;
    const row = byId.get(p.id)!;
    console.log(
      `┌─ +${fmt(p.amount)} so'm · ${row.createdAt.toISOString().slice(0, 10)}`,
    );
    console.log(
      `│  Balans: ${fmt(row.balanceBefore)}  →  ${fmt(row.balanceAfter)}`,
    );
    if (a.toPreviousDebt > 0) {
      const r = [dd(a.debtFirstLessonDate), dd(a.debtLastLessonDate)]
        .filter(Boolean)
        .join(' — ');
      console.log(
        `│    Oldingi qarzga (${a.debtLessonCount} dars · ${r})`.padEnd(48) +
          `${fmt(a.toPreviousDebt)} so'm`,
      );
    }
    if (a.toLessons > 0) {
      const r = [dd(a.firstLessonDate), dd(a.lastLessonDate)]
        .filter(Boolean)
        .join(' — ');
      console.log(
        `│    Darslarga (${a.lessonCount} dars · ${r})`.padEnd(48) +
          `${fmt(a.toLessons)} so'm`,
      );
    }
    if (a.toOther > 0)
      console.log(`│    Boshqa yechimlar`.padEnd(48) + `${fmt(a.toOther)} so'm`);
    if (a.unspent > 0)
      console.log(
        `│    Sarflanmagan qoldiq`.padEnd(48) + `${fmt(a.unspent)} so'm`,
      );
    console.log(`└    JAMI`.padEnd(48) + `${fmt(a.amount)} so'm\n`);
  }

  console.log(
    `Yakuniy: sarflanmagan ${fmt(replay.unspentTotal)} − qarz ${fmt(replay.outstandingDebt)} = ${fmt(replay.unspentTotal - replay.outstandingDebt)}  (balans ${fmt(student.balance)})`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
