/**
 * AUDIT — find students over-charged like #10061 (prepaid-wipe double billing).
 *
 * For each non-deleted student compute the FAIR balance from first principles
 * and compare to the actual balance:
 *
 *   fairBalance = Σ(active Transaction.amount, EXCLUDING LESSON_DEDUCTION &
 *                  ADJUSTMENT)  −  fairLessonCharge
 *   fairLessonCharge = Σ over billable attendances (PRESENT/LATE/ABSENT, date >=
 *                  enrollment.startDate for that group) of perLessonCost,
 *                  × (1 − discountPercent/100)
 *   overcharge = fairBalance − actualBalance
 *
 * Excluding ADJUSTMENT from fairBalance means students already corrected via an
 * ADJUSTMENT (e.g. #10061) net out to overcharge ≈ 0 and DON'T appear. Genuine
 * debtors (owe for lessons they really took) also net to ≈ 0 — fair == actual.
 * Only students deducted MORE than their billable lessons justify get flagged.
 *
 * READ-ONLY. Writes a JSON breakdown of candidates to /tmp/overcharge-candidates.json.
 *
 * Usage: DATABASE_URL=<prod> npx ts-node scripts/audit-overcharged-students.ts [minOvercharge]
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const COMPANY_ID = 1001;
const MIN_OVERCHARGE = Number(process.argv[2] ?? 30000); // material threshold
// April cutover: Company.systemStartDate = 2026-05-01. Lessons before this are
// FREE regardless of enrollment.startDate (incl. null-startDate enrollments).
const SYSTEM_START = '2026-05-01';
const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const som = (n: number) => n.toLocaleString('ru-RU');

type Cand = {
  id: number; name: string; status: string; discount: number;
  actualBalance: number; fairBalance: number; overcharge: number;
  paid: number; moneyInOther: number; deducted: number; dedRows: number;
  adjustments: number; billableLessons: number; fairCharge: number;
  cycles: number;
  prepaid: number; perLessonGuess: number;
  deductionTimeline: { date: string; amount: number }[];
  attendance: { date: string | null; status: string; group: string }[];
};

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Company ${COMPANY_ID} | minOvercharge=${som(MIN_OVERCHARGE)}\n`);

  // --- groups -> course perLesson
  const groups = await prisma.group.findMany({
    where: { companyId: COMPANY_ID },
    select: { id: true, name: true, course: { select: { price: true, lessonPaymentCount: true } } },
  });
  const groupInfo = new Map(
    groups.map((g) => [g.id, {
      name: g.name,
      perLesson: Math.round((g.course?.price ?? 0) / (g.course?.lessonPaymentCount || 1)),
      cycleLen: g.course?.lessonPaymentCount || 12,
    }]),
  );

  // --- enrollments: min startDate per (student,group) + prepaid per student
  const enrollments = await prisma.enrollment.findMany({
    where: { deletedAt: null, student: { companyId: COMPANY_ID } },
    select: { studentId: true, groupId: true, startDate: true, prepaidLessonsRemaining: true, status: true },
  });
  const startByPair = new Map<string, string | null>(); // studentId:groupId -> min startDate
  const prepaidValueByStudent = new Map<number, number>(); // held prepaid VALUE (so'm)
  const prepaidCountByStudent = new Map<number, number>();
  for (const e of enrollments) {
    const key = `${e.studentId}:${e.groupId}`;
    const sd = day(e.startDate);
    const cur = startByPair.get(key);
    if (cur === undefined) startByPair.set(key, sd);
    else if (sd && (!cur || sd < cur)) startByPair.set(key, sd);
    if (e.status === 'ACTIVE' && e.prepaidLessonsRemaining > 0) {
      const per = groupInfo.get(e.groupId)?.perLesson ?? 0;
      prepaidValueByStudent.set(e.studentId, (prepaidValueByStudent.get(e.studentId) ?? 0) + e.prepaidLessonsRemaining * per);
      prepaidCountByStudent.set(e.studentId, (prepaidCountByStudent.get(e.studentId) ?? 0) + e.prepaidLessonsRemaining);
    }
  }

  // --- billable attendances (PRESENT/LATE/ABSENT)
  const atts = await prisma.attendance.findMany({
    where: { companyId: COMPANY_ID, status: { in: ['PRESENT', 'LATE', 'ABSENT'] } },
    select: { studentId: true, groupId: true, date: true, status: true },
  });
  // all attendances (for breakdown display) — keep light: only for candidates later

  // --- active transactions grouped per student
  const txns = await prisma.transaction.findMany({
    where: { companyId: COMPANY_ID, reversedAt: null },
    select: { studentId: true, type: true, amount: true, createdAt: true },
  });

  // --- students
  const students = await prisma.student.findMany({
    where: { companyId: COMPANY_ID, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, status: true, balance: true, discountPercent: true },
  });
  const stMap = new Map(students.map((s) => [s.id, s]));

  // aggregate fairCharge per student
  const fairChargeFull = new Map<number, number>();
  const billableCount = new Map<number, number>();
  const cyclesByStudent = new Map<number, number>(); // Σ 1/cycleLen per billable lesson
  for (const a of atts) {
    if (!stMap.has(a.studentId)) continue;
    const gi = groupInfo.get(a.groupId);
    if (!gi) continue;
    const start = startByPair.get(`${a.studentId}:${a.groupId}`);
    const d = day(a.date)!;
    if (d < SYSTEM_START) continue; // April cutover: pre-01.05 lessons are FREE
    if (start && d < start) continue; // before enrollment start -> not billable
    fairChargeFull.set(a.studentId, (fairChargeFull.get(a.studentId) ?? 0) + gi.perLesson);
    billableCount.set(a.studentId, (billableCount.get(a.studentId) ?? 0) + 1);
    cyclesByStudent.set(a.studentId, (cyclesByStudent.get(a.studentId) ?? 0) + 1 / gi.cycleLen);
  }

  // aggregate transactions per student
  type Agg = { deducted: number; dedRows: number; adjustments: number; moneyInOther: number; paid: number; dedTimeline: { date: string; amount: number }[] };
  const agg = new Map<number, Agg>();
  const getA = (id: number) => {
    let a = agg.get(id);
    if (!a) { a = { deducted: 0, dedRows: 0, adjustments: 0, moneyInOther: 0, paid: 0, dedTimeline: [] }; agg.set(id, a); }
    return a;
  };
  for (const t of txns) {
    if (t.studentId == null || !stMap.has(t.studentId)) continue;
    const a = getA(t.studentId);
    if (t.type === 'LESSON_DEDUCTION') { a.deducted += Math.abs(t.amount); a.dedRows++; a.dedTimeline.push({ date: t.createdAt.toISOString().slice(0, 16).replace('T', ' '), amount: t.amount }); }
    else if (t.type === 'ADJUSTMENT') a.adjustments += t.amount;
    else if (t.type === 'LESSON_CONSUMPTION') { /* 0 */ }
    else if (t.type === 'PAYMENT') { a.moneyInOther += t.amount; a.paid += t.amount; }
    else a.moneyInOther += t.amount; // INITIAL_BALANCE, REFUND, BALANCE_WITHDRAWAL, TAX, DISCOUNT_ADJUSTMENT, etc.
  }

  // compute overcharge. The student's true economic position in the prepaid
  // model is (balance + held-prepaid-value) — prepaid lessons were deducted
  // from balance but represent a legitimately-held credit. Compare to fair:
  //   fairPosition = moneyIn(excl deductions & adjustments) − fairCharge
  //   position     = balance + prepaidValue
  //   overcharge   = fairPosition − position
  const candidates: Cand[] = [];
  for (const s of students) {
    const a = agg.get(s.id) ?? { deducted: 0, dedRows: 0, adjustments: 0, moneyInOther: 0, paid: 0, dedTimeline: [] };
    const disc = s.discountPercent || 0;
    const discMul = 1 - disc / 100;
    const fairCharge = Math.round((fairChargeFull.get(s.id) ?? 0) * discMul);
    const prepaidValue = Math.round((prepaidValueByStudent.get(s.id) ?? 0) * discMul);
    const actualBalance = s.balance;
    const fairPosition = a.moneyInOther - fairCharge;
    const position = actualBalance + prepaidValue;
    const overcharge = fairPosition - position;
    if (overcharge < MIN_OVERCHARGE) continue;
    candidates.push({
      id: s.id, name: `${s.firstName} ${s.lastName}`.trim(), status: s.status, discount: disc,
      actualBalance, fairBalance: fairPosition, overcharge,
      paid: a.paid, moneyInOther: a.moneyInOther, deducted: a.deducted, dedRows: a.dedRows,
      adjustments: a.adjustments, billableLessons: billableCount.get(s.id) ?? 0, fairCharge,
      cycles: Math.round((cyclesByStudent.get(s.id) ?? 0) * 100) / 100,
      prepaid: prepaidCountByStudent.get(s.id) ?? 0,
      perLessonGuess: (billableCount.get(s.id) ?? 0) ? Math.round((fairChargeFull.get(s.id) ?? 0) / (billableCount.get(s.id) ?? 1)) : 0,
      deductionTimeline: a.dedTimeline,
      attendance: [],
    });
  }
  candidates.sort((x, y) => y.overcharge - x.overcharge);

  // enrich top candidates with full attendance list for verification
  const topIds = candidates.map((c) => c.id);
  if (topIds.length) {
    const fullAtt = await prisma.attendance.findMany({
      where: { companyId: COMPANY_ID, studentId: { in: topIds } },
      orderBy: { date: 'asc' },
      select: { studentId: true, date: true, status: true, groupId: true },
    });
    const byStu = new Map<number, { date: string | null; status: string; group: string }[]>();
    for (const a of fullAtt) {
      const arr = byStu.get(a.studentId) ?? [];
      arr.push({ date: day(a.date), status: a.status, group: groupInfo.get(a.groupId)?.name ?? a.groupId });
      byStu.set(a.studentId, arr);
    }
    for (const c of candidates) c.attendance = byStu.get(c.id) ?? [];
  }

  // output
  console.log(`=== ORTIQCHA HISOBLANGAN NOMZODLAR (${candidates.length} ta, overcharge >= ${som(MIN_OVERCHARGE)}) ===\n`);
  console.log('  #ID     ISM                        balans       adolatli     ORTIQCHA    to`langan   yechilgan  dars  sikl prepaid dedQ');
  for (const c of candidates) {
    console.log(
      `  ${String(c.id).padEnd(7)} ${c.name.slice(0, 24).padEnd(25)} ${som(c.actualBalance).padStart(11)} ${som(c.fairBalance).padStart(11)} ${som(c.overcharge).padStart(11)} ${som(c.paid).padStart(10)} ${som(c.deducted).padStart(10)} ${String(c.billableLessons).padStart(4)} ${String(c.cycles).padStart(5)} ${String(c.prepaid).padStart(6)} ${String(c.dedRows).padStart(4)}`,
    );
  }
  const totalOver = candidates.reduce((s, c) => s + c.overcharge, 0);
  console.log(`\n  JAMI ortiqcha (taxminiy): ${som(totalOver)} so'm`);
  console.log(`  Nomzodlar soni: ${candidates.length}`);

  fs.writeFileSync('/tmp/overcharge-candidates.json', JSON.stringify(candidates, null, 2));
  console.log(`\n  To'liq breakdown -> /tmp/overcharge-candidates.json (${candidates.length} ta)`);

  // sanity: is #10061 absent (already fixed)?
  const has10061 = candidates.find((c) => c.id === 10061);
  console.log(`\n  [sanity] #10061 ro'yxatda: ${has10061 ? `BOR overcharge=${som(has10061.overcharge)} (kutilmagan!)` : "YO'Q (tuzatilgan — to'g'ri)"}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
