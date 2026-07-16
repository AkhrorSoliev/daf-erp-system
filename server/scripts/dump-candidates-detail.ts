/**
 * READ-ONLY. Dump full per-student detail (profile + enrollments + attendance +
 * payments + FULL ledger + fair-balance recon) for a set of candidate ids, so a
 * downstream classifier can reason over each one WITHOUT hitting the DB again.
 *
 * Reuses the exact fair-balance model of check-student.ts.
 *
 * Usage: IN_JSON=candidates.json DETAIL_JSON=detail.json \
 *          railway run npx ts-node --transpile-only scripts/dump-candidates-detail.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const IN_JSON = process.env.IN_JSON ?? '/tmp/phantom-credit-candidates.json';
const DETAIL_JSON = process.env.DETAIL_JSON ?? '/tmp/phantom-credit-detail.json';
const SYSTEM_START = '2026-05-01';
const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const dt = (d: any) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : null);

async function main() {
  const ids: number[] = JSON.parse(fs.readFileSync(IN_JSON, 'utf8')).map((c: any) => c.id);
  console.log(`Dumping detail for ${ids.length} candidates...`);

  const students = await prisma.student.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, firstName: true, lastName: true, status: true, balance: true,
      discountPercent: true, deletedAt: true, createdAt: true,
      statusChangedAt: true, statusChangeReason: true,
    },
  });

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: { in: ids } },
    orderBy: { createdAt: 'asc' },
    select: {
      studentId: true, groupId: true, status: true, startDate: true, deletedAt: true,
      prepaidLessonsRemaining: true,
      group: { select: { name: true, groupNumber: true, course: { select: { price: true, lessonPaymentCount: true } } } },
    },
  });
  const groupInfo = new Map<string, { name: string; perLesson: number; cycleLen: number }>();
  const enrByStudent = new Map<number, typeof enrollments>();
  for (const e of enrollments) {
    const price = e.group?.course?.price ?? 0;
    const cyc = e.group?.course?.lessonPaymentCount || 1;
    groupInfo.set(e.groupId, {
      name: e.group?.groupNumber ? `#${e.group.groupNumber} ${e.group?.name}` : e.group?.name ?? e.groupId,
      perLesson: Math.round(price / cyc), cycleLen: cyc,
    });
    (enrByStudent.get(e.studentId) ?? enrByStudent.set(e.studentId, []).get(e.studentId)!).push(e);
  }

  const atts = await prisma.attendance.findMany({
    where: { studentId: { in: ids } },
    orderBy: { date: 'asc' },
    select: { studentId: true, date: true, status: true, groupId: true },
  });
  const attByStudent = new Map<number, typeof atts>();
  for (const a of atts) (attByStudent.get(a.studentId) ?? attByStudent.set(a.studentId, []).get(a.studentId)!).push(a);

  const payments = await prisma.payment.findMany({
    where: { studentId: { in: ids } },
    orderBy: { createdAt: 'asc' },
    select: { studentId: true, amount: true, method: true, status: true, source: true, createdAt: true, note: true },
  });
  const payByStudent = new Map<number, typeof payments>();
  for (const p of payments) (payByStudent.get(p.studentId) ?? payByStudent.set(p.studentId, []).get(p.studentId)!).push(p);

  const txns = await prisma.transaction.findMany({
    where: { studentId: { in: ids } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, studentId: true, type: true, amount: true, balanceBefore: true, balanceAfter: true,
      createdAt: true, reversedAt: true, reversedTransactionId: true, description: true,
    },
  });
  const txByStudent = new Map<number, typeof txns>();
  for (const t of txns) (txByStudent.get(t.studentId!) ?? txByStudent.set(t.studentId!, []).get(t.studentId!)!).push(t);

  const out: any[] = [];
  for (const s of students) {
    const enrs = enrByStudent.get(s.id) ?? [];
    const disc = s.discountPercent || 0;
    const discMul = 1 - disc / 100;

    // prepaid held value (ACTIVE enrollments)
    let prepaidValue = 0, prepaidCount = 0;
    const startByGroup = new Map<string, string | null>();
    for (const e of enrs) {
      if (e.status === 'ACTIVE' && e.prepaidLessonsRemaining > 0) {
        prepaidValue += e.prepaidLessonsRemaining * (groupInfo.get(e.groupId)?.perLesson ?? 0);
        prepaidCount += e.prepaidLessonsRemaining;
      }
      const sd = day(e.startDate);
      const cur = startByGroup.get(e.groupId);
      if (cur === undefined) startByGroup.set(e.groupId, sd);
      else if (sd && (!cur || sd < cur)) startByGroup.set(e.groupId, sd);
    }
    prepaidValue = Math.round(prepaidValue * discMul);

    // attendance + billable
    const sAtts = attByStudent.get(s.id) ?? [];
    const counts: Record<string, number> = {};
    let billableCharge = 0, billableCount = 0;
    for (const a of sAtts) {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
      const d = day(a.date)!;
      const start = startByGroup.get(a.groupId);
      const billable = ['PRESENT', 'LATE', 'ABSENT'].includes(a.status) && d >= SYSTEM_START && (!start || d >= start);
      if (billable) { billableCharge += groupInfo.get(a.groupId)?.perLesson ?? 0; billableCount++; }
    }

    const sTx = txByStudent.get(s.id) ?? [];
    const moneyInOther = sTx
      .filter((t) => t.reversedAt == null && !['LESSON_DEDUCTION', 'ADJUSTMENT', 'LESSON_CONSUMPTION'].includes(t.type))
      .reduce((acc, t) => acc + t.amount, 0);
    const fairCharge = Math.round(billableCharge * discMul);
    const fairPosition = moneyInOther - fairCharge;
    const position = s.balance + prepaidValue;
    const discrepancy = position - fairPosition;

    out.push({
      id: s.id, name: `${s.firstName} ${s.lastName}`.trim(), status: s.status,
      archived: !!s.deletedAt, discountPercent: disc,
      createdAt: day(s.createdAt), statusChangedAt: day(s.statusChangedAt), statusChangeReason: s.statusChangeReason,
      balance: s.balance, prepaidValue, prepaidCount, position,
      fair: { moneyInOther, fairCharge, billableCount, fairPosition, discrepancy },
      attendanceCounts: counts,
      enrollments: enrs.map((e) => ({
        group: groupInfo.get(e.groupId)?.name, status: e.status, startDate: day(e.startDate),
        prepaidLessonsRemaining: e.prepaidLessonsRemaining, deleted: !!e.deletedAt,
        perLesson: groupInfo.get(e.groupId)?.perLesson, cycleLen: groupInfo.get(e.groupId)?.cycleLen,
      })),
      payments: (payByStudent.get(s.id) ?? []).map((p) => ({
        date: dt(p.createdAt), amount: p.amount, method: p.method, status: p.status, source: p.source, note: p.note,
      })),
      ledger: sTx.map((t) => ({
        date: dt(t.createdAt), type: t.type, amount: t.amount,
        before: t.balanceBefore, after: t.balanceAfter,
        reversed: !!t.reversedAt, isReversalRow: !!t.reversedTransactionId,
        desc: (t.description ?? '').replace(/\s+/g, ' ').trim() || null,
      })),
    });
  }
  out.sort((a, b) => b.fair.discrepancy - a.fair.discrepancy);
  fs.writeFileSync(DETAIL_JSON, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.length} candidate details -> ${DETAIL_JSON}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
