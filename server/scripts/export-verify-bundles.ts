/**
 * Export a self-contained verification bundle per candidate (raw facts only,
 * no pre-computed verdict) so an independent verifier can re-derive the fair
 * balance from scratch. Reads candidate ids from /tmp/overcharge-candidates.json,
 * writes /tmp/verify/<id>.json. READ-ONLY.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const dt = (d: any) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : null);

async function main() {
  const cands = JSON.parse(fs.readFileSync('/tmp/overcharge-candidates.json', 'utf8')) as { id: number }[];
  const ids = cands.map((c) => c.id);
  fs.mkdirSync('/tmp/verify', { recursive: true });
  console.log(`Exporting ${ids.length} bundles: ${ids.join(', ')}`);

  for (const id of ids) {
    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, balance: true, discountPercent: true, status: true, createdAt: true },
    });
    if (!student) continue;

    const payments = await prisma.payment.findMany({
      where: { studentId: id }, orderBy: { createdAt: 'asc' },
      select: { amount: true, method: true, status: true, createdAt: true },
    });

    const ledger = await prisma.transaction.findMany({
      where: { studentId: id }, orderBy: { createdAt: 'asc' },
      select: { type: true, amount: true, balanceBefore: true, balanceAfter: true, reversedAt: true, reversedTransactionId: true, createdAt: true, description: true, attendanceId: true, metadata: true },
    });

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: id, deletedAt: null }, orderBy: { createdAt: 'asc' },
      select: {
        groupId: true, status: true, startDate: true, prepaidLessonsRemaining: true,
        group: { select: { name: true, course: { select: { price: true, lessonPaymentCount: true } } } },
      },
    });
    const startByGroup = new Map<string, string | null>();
    const perByGroup = new Map<string, number>();
    for (const e of enrollments) {
      const per = Math.round((e.group.course?.price ?? 0) / (e.group.course?.lessonPaymentCount || 1));
      perByGroup.set(e.groupId, per);
      const sd = day(e.startDate);
      const cur = startByGroup.get(e.groupId);
      if (cur === undefined) startByGroup.set(e.groupId, sd);
      else if (sd && (!cur || sd < cur)) startByGroup.set(e.groupId, sd);
    }

    const att = await prisma.attendance.findMany({
      where: { studentId: id }, orderBy: { date: 'asc' },
      select: { date: true, status: true, groupId: true, group: { select: { name: true } } },
    });
    const SYSTEM_START = '2026-05-01'; // Company.systemStartDate — April cutover floor
    const attendance = att.map((a) => {
      const d = day(a.date);
      const start = startByGroup.get(a.groupId) ?? null;
      const billableStatus = ['PRESENT', 'LATE', 'ABSENT'].includes(a.status);
      const afterStart = !start || (d! >= start);
      const afterSystemStart = d! >= SYSTEM_START;
      return { date: d, status: a.status, group: a.group.name, enrollStart: start, perLesson: perByGroup.get(a.groupId) ?? null, billable: billableStatus && afterStart && afterSystemStart };
    });

    const bundle = {
      student: { id: student.id, name: `${student.firstName} ${student.lastName}`.trim(), balance: student.balance, discountPercent: student.discountPercent, status: student.status, createdAt: day(student.createdAt) },
      note: "BILLABLE = PRESENT/LATE/ABSENT on/after BOTH enrollment startDate AND 2026-05-01 (April-cutover systemStartDate — ALL pre-May lessons are FREE company-wide; EXCUSED is FREE). Course price = full cycle (lessonPaymentCount lessons). perLesson = round(price/count). Student true position = balance + Σ(active-enrollment prepaid × perLesson). Fair position = (Σ money-in: payments+initial+refund+withdrawal — payments count REGARDLESS of date incl. April, EXCLUDING lesson-deductions & adjustments) − (billable lessons × perLesson, ×(1−discount)). Overcharge = fairPosition − position.",
      payments: payments.map((p) => ({ amount: p.amount, method: p.method, status: p.status, date: dt(p.createdAt) })),
      enrollments: enrollments.map((e) => ({ group: e.group.name, status: e.status, startDate: day(e.startDate), prepaid: e.prepaidLessonsRemaining, coursePrice: e.group.course?.price, lessonPaymentCount: e.group.course?.lessonPaymentCount, perLesson: perByGroup.get(e.groupId) })),
      attendance,
      ledger: ledger.map((t) => ({ type: t.type, amount: t.amount, balBefore: t.balanceBefore, balAfter: t.balanceAfter, reversed: !!t.reversedAt, isReversal: !!t.reversedTransactionId, date: dt(t.createdAt), perLessonCost: (t.metadata as any)?.perLessonCost ?? null, marker: (t.metadata as any)?.marker ?? null, desc: t.description }),
      ),
    };
    fs.writeFileSync(`/tmp/verify/${id}.json`, JSON.stringify(bundle, null, 2));
    console.log(`  ${id}: ${bundle.attendance.length} att, ${bundle.ledger.length} ledger, ${bundle.payments.length} pay`);
  }
  console.log('Done -> /tmp/verify/');
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
