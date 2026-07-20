/**
 * AUDIT — find students holding a PHANTOM POSITIVE balance like #10655.
 *
 * The mirror image of `audit-overcharged-students.ts`. Same fair-balance model,
 * but flags the OTHER tail: students whose actual position is materially HIGHER
 * than fair (over-credited / "kam hisoblangan"), typically because a net-positive
 * ADJUSTMENT over-corrected an earlier over-deduction (the #10655 pattern) or a
 * duplicate credit was posted.
 *
 *   fairPosition = Σ(active Transaction.amount, EXCLUDING LESSON_DEDUCTION,
 *                    ADJUSTMENT, LESSON_CONSUMPTION)  −  fairLessonCharge
 *   fairLessonCharge = Σ over billable attendances (PRESENT/LATE/ABSENT,
 *                    date >= 2026-05-01 AND date >= enrollment.startDate)
 *                    of perLessonCost, × (1 − discountPercent/100)
 *   position     = balance + heldPrepaidValue
 *   discrepancy  = position − fairPosition        (> 0  ⇒ phantom credit)
 *
 * A genuine unrefunded overpayment nets to discrepancy ≈ 0 (balance already
 * equals money-in − fair lessons), so it does NOT appear. Only students whose
 * balance was distorted ABOVE fair by an adjustment/deduction anomaly are
 * flagged. Legitimate positive ADJUSTMENTs (April refund credit, old-system
 * reconciliation) will also surface here — classify each candidate afterwards.
 *
 * READ-ONLY. Writes a JSON breakdown of candidates to the path in $OUT_JSON
 * (default /tmp/phantom-credit-candidates.json).
 *
 * Usage: railway run npx ts-node --transpile-only \
 *          scripts/audit-phantom-credit-students.ts [minDiscrepancy]
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const COMPANY_ID = 1001;
const MIN_DISCREPANCY = Number(process.argv[2] ?? 30000); // material threshold (~1 lesson)
const OUT_JSON = process.env.OUT_JSON ?? '/tmp/phantom-credit-candidates.json';
// April cutover: Company.systemStartDate = 2026-05-01. Lessons before this are
// FREE regardless of enrollment.startDate (incl. null-startDate enrollments).
const SYSTEM_START = '2026-05-01';
const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const dt = (d: any) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '—');
const som = (n: number) => Math.round(n).toLocaleString('ru-RU');

type AdjRow = { date: string; amount: number; reversed: boolean; desc: string };
type Cand = {
  id: number; name: string; status: string; archived: boolean; discount: number;
  actualBalance: number; fairPosition: number; discrepancy: number;
  paid: number; refunded: number; moneyInOther: number;
  deducted: number; dedRows: number; netAdjustment: number; adjRows: number;
  billableLessons: number; fairCharge: number; prepaid: number;
  adjustments: AdjRow[];
};

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  const railway = process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT;
  console.log(`Env: ${railway ? `PROD · railway:${railway}` : 'DEV · .env'}`);
  console.log(`Company ${COMPANY_ID} | minDiscrepancy=${som(MIN_DISCREPANCY)} | out=${OUT_JSON}\n`);

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
  const startByPair = new Map<string, string | null>();
  const prepaidValueByStudent = new Map<number, number>();
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
    select: { studentId: true, groupId: true, date: true },
  });

  // --- active transactions grouped per student (reversedAt: null = still in effect).
  // A reversed original has reversedAt != null (excluded here); its REVERSAL row has
  // reversedAt = null but reversedTransactionId != null. Counting the reversal row
  // while the original is excluded double-subtracts the pair (the #10279/#10284
  // artifact), so we skip reversal rows too — the undone pair nets to zero.
  const txns = await prisma.transaction.findMany({
    where: { companyId: COMPANY_ID, reversedAt: null, reversedTransactionId: null },
    select: { studentId: true, type: true, amount: true, createdAt: true, description: true },
  });

  // --- students (INCLUDING archived, so no phantom balance is missed)
  const students = await prisma.student.findMany({
    where: { companyId: COMPANY_ID },
    select: { id: true, firstName: true, lastName: true, status: true, balance: true, discountPercent: true, deletedAt: true },
  });
  const stMap = new Map(students.map((s) => [s.id, s]));

  // aggregate fairCharge per student
  const fairChargeFull = new Map<number, number>();
  const billableCount = new Map<number, number>();
  for (const a of atts) {
    if (!stMap.has(a.studentId)) continue;
    const gi = groupInfo.get(a.groupId);
    if (!gi) continue;
    const start = startByPair.get(`${a.studentId}:${a.groupId}`);
    const d = day(a.date)!;
    if (d < SYSTEM_START) continue;
    if (start && d < start) continue;
    fairChargeFull.set(a.studentId, (fairChargeFull.get(a.studentId) ?? 0) + gi.perLesson);
    billableCount.set(a.studentId, (billableCount.get(a.studentId) ?? 0) + 1);
  }

  // aggregate transactions per student
  type Agg = {
    deducted: number; dedRows: number; netAdjustment: number; adjRows: number;
    moneyInOther: number; paid: number; refunded: number; adjustments: AdjRow[];
  };
  const agg = new Map<number, Agg>();
  const getA = (id: number) => {
    let a = agg.get(id);
    if (!a) { a = { deducted: 0, dedRows: 0, netAdjustment: 0, adjRows: 0, moneyInOther: 0, paid: 0, refunded: 0, adjustments: [] }; agg.set(id, a); }
    return a;
  };
  for (const t of txns) {
    if (t.studentId == null || !stMap.has(t.studentId)) continue;
    const a = getA(t.studentId);
    if (t.type === 'LESSON_DEDUCTION') { a.deducted += Math.abs(t.amount); a.dedRows++; }
    else if (t.type === 'ADJUSTMENT') {
      a.netAdjustment += t.amount; a.adjRows++;
      a.adjustments.push({ date: dt(t.createdAt), amount: t.amount, reversed: false, desc: (t.description ?? '').replace(/\s+/g, ' ').trim() });
    }
    else if (t.type === 'LESSON_CONSUMPTION') { /* 0 */ }
    else if (t.type === 'PAYMENT') { a.moneyInOther += t.amount; a.paid += t.amount; }
    else if (t.type === 'REFUND') { a.moneyInOther += t.amount; a.refunded += t.amount; }
    else a.moneyInOther += t.amount; // INITIAL_BALANCE, BALANCE_WITHDRAWAL, TAX, DISCOUNT_ADJUSTMENT, etc.
  }

  const candidates: Cand[] = [];
  for (const s of students) {
    const a = agg.get(s.id);
    if (!a) continue; // no transactions -> nothing to reconcile
    const disc = s.discountPercent || 0;
    const discMul = 1 - disc / 100;
    const fairCharge = Math.round((fairChargeFull.get(s.id) ?? 0) * discMul);
    const prepaidValue = Math.round((prepaidValueByStudent.get(s.id) ?? 0) * discMul);
    const fairPosition = a.moneyInOther - fairCharge;
    const position = s.balance + prepaidValue;
    const discrepancy = position - fairPosition; // > 0 ⇒ phantom credit
    if (discrepancy < MIN_DISCREPANCY) continue;
    candidates.push({
      id: s.id, name: `${s.firstName} ${s.lastName}`.trim(), status: s.status,
      archived: !!s.deletedAt, discount: disc,
      actualBalance: s.balance, fairPosition, discrepancy,
      paid: a.paid, refunded: a.refunded, moneyInOther: a.moneyInOther,
      deducted: a.deducted, dedRows: a.dedRows, netAdjustment: a.netAdjustment, adjRows: a.adjRows,
      billableLessons: billableCount.get(s.id) ?? 0, fairCharge,
      prepaid: prepaidCountByStudent.get(s.id) ?? 0,
      adjustments: a.adjustments,
    });
  }
  candidates.sort((x, y) => y.discrepancy - x.discrepancy);

  // --- output
  console.log(`=== FANTOM MUSBAT BALANS NOMZODLARI (${candidates.length} ta, discrepancy >= ${som(MIN_DISCREPANCY)}) ===`);
  console.log(`    discrepancy = (balans+prepaid) − adolatli pozitsiya;  musbat ⇒ ortiqcha kredit\n`);
  // heuristic kind: only a POSITIVE balance held on top of a net-positive
  // ADJUSTMENT can be a phantom credit (#10655). Negative balance ⇒ debt.
  const kindOf = (c: Cand) =>
    c.actualBalance > 1000 && c.netAdjustment > 1000 ? 'FANTOM?' : c.actualBalance > 1000 ? 'MUSBAT?' : 'QARZ';
  console.log('  #ID     ISM                        status    kind      balans      adolatli   ORTIQCHA   netADJ    to`langan  refund   dars');
  for (const c of candidates) {
    console.log(
      `  ${String(c.id).padEnd(7)} ${c.name.slice(0, 24).padEnd(25)} ${c.status.slice(0, 9).padEnd(9)} ${kindOf(c).padEnd(8)} ${som(c.actualBalance).padStart(10)} ${som(c.fairPosition).padStart(10)} ${som(c.discrepancy).padStart(10)} ${som(c.netAdjustment).padStart(9)} ${som(c.paid).padStart(9)} ${som(c.refunded).padStart(8)} ${String(c.billableLessons).padStart(4)}${c.archived ? '  [ARX]' : ''}`,
    );
  }
  const phantomLike = candidates.filter((c) => kindOf(c) === 'FANTOM?');
  console.log(`\n  ⇒ FANTOM? (musbat balans + musbat netADJ, #10655 tipi): ${phantomLike.length} ta — ${phantomLike.map((c) => `#${c.id}`).join(', ') || '—'}`);

  // breakdown by status
  const byStatus = new Map<string, { n: number; sum: number }>();
  for (const c of candidates) {
    const b = byStatus.get(c.status) ?? { n: 0, sum: 0 };
    b.n++; b.sum += c.discrepancy; byStatus.set(c.status, b);
  }
  console.log('\n  ── status kesimida ──');
  for (const [k, b] of [...byStatus.entries()].sort((a, z) => z[1].sum - a[1].sum)) {
    console.log(`    ${k.padEnd(12)} ${String(b.n).padStart(3)} ta   Σ ${som(b.sum).padStart(12)} so'm`);
  }

  const total = candidates.reduce((s, c) => s + c.discrepancy, 0);
  console.log(`\n  JAMI fantom kredit (taxminiy): ${som(total)} so'm  |  ${candidates.length} nomzod`);

  fs.writeFileSync(OUT_JSON, JSON.stringify(candidates, null, 2));
  console.log(`  To'liq breakdown -> ${OUT_JSON}`);

  // sanity: #10655 present with ~233k?
  const c10655 = candidates.find((c) => c.id === 10655);
  console.log(`\n  [sanity] #10655 ro'yxatda: ${c10655 ? `BOR discrepancy=${som(c10655.discrepancy)} (kutilgan ~233 331)` : "YO'Q (kutilmagan!)"}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
