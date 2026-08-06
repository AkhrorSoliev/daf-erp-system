/**
 * audit-payment-destination — READ-ONLY.
 *
 * "Bu pul ketdi" kartasining dvigatelini (`ledger-replay`) BUTUN bazada
 * yugurtiradi va uchta invariantni tekshiradi:
 *
 *   I-1  zanjir har qatorda saqlangan balansga mos keladi (reconciled)
 *   I-2  Σunspent − Σqarz === Student.balance
 *   I-3  toPreviousDebt + toLessons + toOther + unspent === amount
 *
 * Qabul mezoni: uchalasi ham 0 buzilish. Bitta ham buzilish qolsa karta
 * fail-closed rejimda taqsimotni yashiradi — ya'ni yolg'on son chiqmaydi,
 * lekin nega mos kelmagani tekshirilishi kerak.
 *
 *   railway run npx ts-node --transpile-only scripts/audit-payment-destination.ts
 *   npx ts-node --transpile-only scripts/audit-payment-destination.ts --dev
 */
import { PrismaClient, TransactionType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import {
  replayStudentLedger,
  splitLessonSlices,
  type LessonSlice,
  type ReplayRow,
} from '../src/common/finance/ledger-replay';
import { allocateCoverage } from '../src/billing/lesson-coverage.helper';

dotenv.config();
const fmt = (n: number) => n.toLocaleString('ru-RU');

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const isProd = !!process.env.RAILWAY_ENVIRONMENT_NAME;
  console.log(
    `\n=== audit-payment-destination — ${isProd ? 'PROD' : 'DEV'} ===\n`,
  );

  // 1) Butun student-scoped ledger, bitta o'qish.
  const all = await prisma.transaction.findMany({
    where: { studentId: { not: null } },
    select: {
      id: true,
      studentId: true,
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

  const attIds = all
    .filter((r) => r.type === TransactionType.LESSON_CONSUMPTION && r.attendanceId)
    .map((r) => r.attendanceId as string);
  const attRows = await prisma.attendance.findMany({
    where: { id: { in: attIds } },
    select: { id: true, date: true },
  });
  const attDates = new Map(attRows.map((a) => [a.id, a.date]));

  const balances = new Map(
    (await prisma.student.findMany({ select: { id: true, balance: true } })).map(
      (s) => [s.id, s.balance],
    ),
  );

  const perStudent = new Map<number, typeof all>();
  for (const r of all) {
    const list = perStudent.get(r.studentId!) ?? [];
    list.push(r);
    perStudent.set(r.studentId!, list);
  }

  let checked = 0;
  let i1Bad = 0;
  let i2Bad = 0;
  let i3Bad = 0;
  let i2Sum = 0;
  const offenders: Array<{ id: number; kind: string; detail: string }> = [];

  for (const [studentId, rows] of perStudent) {
    const balance = balances.get(studentId);
    if (balance === undefined) continue;
    checked += 1;

    // Sikl qoplamasi — servicedagi bilan bir xil helper (bekor qilingan
    // juftlik ikkala tomondan ham chiqariladi).
    const coverageTxs = rows
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
      }));
    const { byDeduction } = allocateCoverage(coverageTxs, attDates);

    const timeline: ReplayRow[] = rows.filter((r) => r.amount !== 0);
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

    if (!replay.reconciled) {
      i1Bad += 1;
      offenders.push({
        id: studentId,
        kind: 'I-1',
        detail: `zanjir uzilgan (${timeline.length} qator)`,
      });
    }

    const i2 = replay.unspentTotal - replay.outstandingDebt;
    if (i2 !== balance) {
      i2Bad += 1;
      i2Sum += Math.abs(i2 - balance);
      offenders.push({
        id: studentId,
        kind: 'I-2',
        detail: `replay=${fmt(i2)} balans=${fmt(balance)} farq=${fmt(i2 - balance)}`,
      });
    }

    for (const [creditId, a] of replay.byCredit) {
      const sum = a.toPreviousDebt + a.toLessons + a.toOther + a.unspent;
      if (sum !== a.amount) {
        i3Bad += 1;
        offenders.push({
          id: studentId,
          kind: 'I-3',
          detail: `${creditId}: ${fmt(sum)} != ${fmt(a.amount)}`,
        });
      }
    }
  }

  console.log(`Tekshirilgan o'quvchi: ${checked}`);
  console.log(`  I-1 (zanjir langari)  buzilgan: ${i1Bad}`);
  console.log(`  I-2 (o'quvchi balansi) buzilgan: ${i2Bad}  Σ|farq| = ${fmt(i2Sum)}`);
  console.log(`  I-3 (karta yig'indisi) buzilgan: ${i3Bad}`);

  if (offenders.length) {
    console.log(`\nBirinchi 20 ta buzilish:`);
    for (const o of offenders.slice(0, 20)) {
      console.log(`  #${o.id} [${o.kind}] ${o.detail}`);
    }
  } else {
    console.log(`\n✓ Uchala invariant ham toza.`);
  }

  await prisma.$disconnect();
  process.exit(i1Bad + i2Bad + i3Bad > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
