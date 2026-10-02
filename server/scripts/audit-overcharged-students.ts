/**
 * AUDIT — fair-balance reconciliation for EVERY student (READ-ONLY).
 *
 * The same math `check-student.ts` prints in «ADOLATLI BALANS TEKSHIRUVI»
 * (scripts/lib/fair-balance.ts): per-lesson package rate before 01.09.2026,
 * the month's EnrollmentMonthlyCharge after it. Lists every student whose
 * fair position differs from the real one by at least `--min` so'm, both ways:
 * charged too much (ortiqcha) and too little (kam).
 *
 * The version before 2026-10-02 priced every lesson at today's course price
 * and ignored monthly billing, so after the September switch it flagged every
 * monthly student.
 *
 * Usage (from server/):
 *   railway run npx ts-node --transpile-only scripts/audit-overcharged-students.ts [--min=1000]
 */
import { PrismaClient } from '@prisma/client';
import { som, day, printHeader, printTable, section, run } from './lib/check-cli';
import { fairBalance } from './lib/fair-balance';

const groupBy = <T extends { studentId: number | null }>(rows: T[]) => {
  const m = new Map<number, T[]>();
  for (const r of rows) {
    if (r.studentId == null) continue;
    const list = m.get(r.studentId) ?? [];
    list.push(r);
    m.set(r.studentId, list);
  }
  return m;
};

run(async (prisma: PrismaClient) => {
  const minArg = process.argv.find((a) => a.startsWith('--min='));
  const MIN = minArg ? Number(minArg.split('=')[1]) : 1000;

  const [students, groups, enrollments, attendance, txns, charges] = await Promise.all([
    prisma.student.findMany({
      select: { id: true, firstName: true, lastName: true, status: true, balance: true, discountPercent: true, deletedAt: true },
    }),
    prisma.group.findMany({
      select: { id: true, course: { select: { price: true, lessonPaymentCount: true } } },
    }),
    prisma.enrollment.findMany({
      select: { studentId: true, groupId: true, status: true, startDate: true, prepaidLessonsRemaining: true },
    }),
    prisma.attendance.findMany({
      orderBy: { date: 'asc' },
      select: { id: true, studentId: true, date: true, status: true, groupId: true },
    }),
    prisma.transaction.findMany({
      where: { studentId: { not: null } },
      select: {
        studentId: true,
        type: true,
        amount: true,
        reversedAt: true,
        reversedTransactionId: true,
        attendanceId: true,
        enrollmentId: true,
        createdAt: true,
        metadata: true,
      },
    }),
    prisma.enrollmentMonthlyCharge.findMany({
      select: { studentId: true, groupId: true, periodYear: true, periodMonth: true, status: true, chargedAmount: true, coveredDates: true },
    }),
  ]);

  const todayRate = new Map(
    groups.map((g) => [g.id, Math.round((g.course?.price ?? 0) / (g.course?.lessonPaymentCount || 1))]),
  );
  const enrByStudent = groupBy(enrollments);
  const attByStudent = groupBy(attendance);
  const txByStudent = groupBy(txns);
  const chargeByStudent = groupBy(charges);

  type Row = {
    id: number;
    name: string;
    status: string;
    balance: number;
    fair: number;
    diff: number;
    guessed: number;
    note: string;
  };
  const rows: Row[] = [];
  let ledgerBreaks = 0;
  for (const s of students) {
    const studentTxns = txByStudent.get(s.id) ?? [];
    if (studentTxns.reduce((acc, t) => acc + t.amount, 0) !== s.balance) ledgerBreaks++;
    const r = fairBalance({
      balance: s.balance,
      discountPercent: s.discountPercent,
      todayRate,
      enrollments: enrByStudent.get(s.id) ?? [],
      attendance: attByStudent.get(s.id) ?? [],
      txns: studentTxns,
      charges: chargeByStudent.get(s.id) ?? [],
    });
    if (Math.abs(r.difference) < MIN) continue;
    const notes: string[] = [];
    // The whole gap is lessons nobody ever billed (priced as an estimate).
    if (r.guessed && Math.abs(r.difference + r.guessedFee) < MIN) notes.push(`faqat ${r.guessed} ta yechilmagan dars`);
    else if (r.guessed) notes.push(`${r.guessed} ta yechilmagan dars ichida`);
    if (r.prepaidCount) notes.push(`prepaid ${r.prepaidCount}`);
    // Discount history is not stored: today's percent is applied to every lesson.
    if (s.discountPercent) notes.push(`chegirma ${s.discountPercent}%`);
    if (s.deletedAt) notes.push(`arxiv ${day(s.deletedAt)}`);
    rows.push({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`.trim(),
      status: s.status,
      balance: s.balance,
      fair: r.fairPosition,
      diff: r.difference,
      guessed: r.guessed,
      note: notes.join('; '),
    });
  }

  const over = rows.filter((r) => r.diff > 0).sort((a, b) => b.diff - a.diff);
  const under = rows.filter((r) => r.diff < 0).sort((a, b) => a.diff - b.diff);
  const sum = (list: Row[]) => list.reduce((acc, r) => acc + r.diff, 0);
  const onlyUnbilled = under.filter((r) => r.note.startsWith('faqat'));

  printHeader(`ADOLATLI BALANS — BARCHA O'QUVCHILAR (farq >= ${som(MIN)} so'm)`);
  console.log(`  Tekshirildi            : ${students.length} ta o'quvchi`);
  console.log(`  ✓ to'g'ri keladi        : ${students.length - rows.length} ta`);
  console.log(`  ⚠ ortiqcha olingan      : ${over.length} ta, jami ${som(sum(over))} so'm`);
  console.log(
    `  ⚠ kam olingan           : ${under.length} ta, jami ${som(sum(under))} so'm` +
      `  (shundan ${onlyUnbilled.length} tasida farq faqat yechilmagan darslar)`,
  );
  console.log(`  Ledger ≠ balans         : ${ledgerBreaks} ta o'quvchi`);

  const table = (list: Row[]) =>
    printTable(
      ['#ID', 'ism', 'holat', 'balans', 'adolatli', 'farq', 'izoh'],
      list.map((r) => [r.id, r.name.slice(0, 24), r.status, som(r.balance), som(r.fair), som(r.diff), r.note]),
      ['l', 'l', 'l', 'r', 'r', 'r', 'l'],
    );
  section(`ORTIQCHA OLINGAN (${over.length})`);
  table(over);
  section(`KAM OLINGAN (${under.length})`);
  table(under);
});
