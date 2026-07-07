/**
 * DEEP FINANCIAL RECONCILIATION AUDIT — READ-ONLY.
 *
 * Verifies that after all the manual +/- balance corrections (April-2026
 * cutover refunds, overcharge-audit batches, phantom-billing reversals, debt
 * write-offs, discount adjustments) the books still reconcile exactly. The
 * append-only ledger makes correctness reduce to a small set of algebraic
 * invariants over Transaction / Student / CashAccount / CashMovement /
 * SalaryAccrual / Payment / Contract — no business re-simulation except the
 * fair-balance residual (check D).
 *
 * Writes NOTHING. Bulk-loads each table once for the company and aggregates
 * in memory. Prints a PASS/FAIL matrix and dumps per-check exception JSON.
 *
 * Usage (from server/):
 *   railway run npx ts-node scripts/audit-finance-reconciliation.ts          # PROD (Neon)
 *   npx ts-node scripts/audit-finance-reconciliation.ts                      # local dev DB
 *   flags: --full (print all exceptions)  --json (machine output)
 *          --threshold=30000 (fair-balance materiality)  --out=/tmp (json dir)
 *
 * Master invariant (verified against transactions-write.service.ts):
 *   Student.balance == Σ(amount over ALL rows for that student)   [reversal pairs cancel]
 * The `reversedAt IS NULL` filter does NOT reconcile on its own; checking the
 * active-only form too and flagging disagreement localizes malformed reversals.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import {
  som,
  day,
  dt,
  dbHost,
  dbEnvLabel,
  printHeader,
  section,
  printTable,
  run,
  SYSTEM_START,
} from './lib/check-cli';

const COMPANY_ID = 1001;

const argv = process.argv.slice(2);
const FULL = argv.includes('--full');
const JSON_ONLY = argv.includes('--json');
const THRESHOLD = (() => {
  const t = argv.find((a) => a.startsWith('--threshold='));
  return t ? Number(t.split('=')[1]) : 30000;
})();
const OUT_DIR = (() => {
  const o = argv.find((a) => a.startsWith('--out='));
  return o ? o.split('=')[1] : '/tmp';
})();

// Money-flow types that mirror onto a cash account (CASH_FLOW_TYPES in
// transactions-write.service.ts). Everything else is an internal allocation.
const CASH_FLOW_TYPES = new Set(['PAYMENT', 'EXPENSE', 'SALARY_PAYMENT', 'REFUND']);
// Manual correction types — the "+/- qildik" rows the CEO wants itemized.
const CORRECTION_TYPES = new Set([
  'ADJUSTMENT',
  'DISCOUNT_ADJUSTMENT',
  'DEBT_WRITE_OFF',
  'INITIAL_BALANCE',
  'BALANCE_WITHDRAWAL',
  'REFUND',
]);

// ── loaded row shapes ───────────────────────────────────────────────────────
interface TxRow {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  studentId: number | null;
  teacherId: number | null;
  paymentId: string | null;
  refundId: string | null;
  contractId: string | null;
  attendanceId: string | null;
  enrollmentId: string | null;
  reversedAt: Date | null;
  reversedById: number | null;
  reversedTransactionId: string | null;
  metadata: any;
  description: string | null;
  performedById: number | null;
  branchId: number | null;
  createdAt: Date;
}
interface StudentRow {
  id: number;
  balance: number;
  status: string;
  discountPercent: number | null;
  deletedAt: Date | null;
  firstName: string | null;
  lastName: string | null;
}
interface CashAccRow {
  id: string;
  name: string;
  type: string;
  balance: number;
  branchId: number | null;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
}
interface CashMovRow {
  id: string;
  cashAccountId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  transactionId: string | null;
  reversedAt: Date | null;
  reversedTransactionId: string | null;
  createdAt: Date;
}
interface AccrualRow {
  id: string;
  deductionTransactionId: string | null;
  attendanceId: string | null;
  reversedAt: Date | null;
  amount: number;
  salaryPaymentId: string | null;
  userId: number;
  studentId: number;
  groupId: string;
  lessonDate: Date;
}
interface PaymentRow {
  id: string;
  studentId: number;
  contractId: string | null;
  amount: number;
  status: string;
  createdAt: Date;
}
interface ContractRow {
  id: string;
  studentId: number;
  paidAmount: number;
  status: string;
  deletedAt: Date | null;
}
interface EnrollRow {
  studentId: number;
  groupId: string;
  startDate: Date | null;
  prepaidLessonsRemaining: number;
  status: string;
}
interface GroupRow {
  id: string;
  course: { price: number; lessonPaymentCount: number } | null;
}
interface AttRow {
  studentId: number;
  groupId: string;
  date: Date;
  status: string;
}

// ── result model ────────────────────────────────────────────────────────────
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
type Status = 'PASS' | 'FAIL' | 'INFO';
interface CheckResult {
  id: string;
  title: string;
  severity: Severity;
  status: Status;
  scanned: number;
  exceptions: Record<string, any>[];
  totals?: Record<string, any>;
  notes?: string[];
}

const name = (s: StudentRow | undefined) =>
  s ? `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() : '?';
const marker = (m: any): string | undefined => {
  const v = (m as { marker?: unknown } | null)?.marker;
  return typeof v === 'string' ? v : undefined;
};

function mk(
  id: string,
  title: string,
  severity: Severity,
  exceptions: Record<string, any>[],
  scanned: number,
  opts: { info?: boolean; totals?: Record<string, any>; notes?: string[] } = {},
): CheckResult {
  return {
    id,
    title,
    severity,
    status: opts.info ? 'INFO' : exceptions.length ? 'FAIL' : 'PASS',
    scanned,
    exceptions,
    totals: opts.totals,
    notes: opts.notes,
  };
}

async function main(prisma: PrismaClient) {
  printHeader('DEEP MOLIYAVIY SOLISHTIRUV (reconciliation) — READ-ONLY');
  console.log(
    `  company=${COMPANY_ID}  threshold=${som(THRESHOLD)}  out=${OUT_DIR}  ${FULL ? '[--full]' : ''}`,
  );

  // ── single-pass load (companyId scoped; soft-deleted students INCLUDED) ────
  const t0 = Date.now();
  const [
    txnsRaw,
    studentsRaw,
    cashAccountsRaw,
    cashMovementsRaw,
    accrualsRaw,
    paymentsRaw,
    contractsRaw,
    enrollmentsRaw,
    groupsRaw,
    attsRaw,
  ] = await Promise.all([
    prisma.transaction.findMany({
      where: { companyId: COMPANY_ID },
      select: {
        id: true,
        type: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
        studentId: true,
        teacherId: true,
        paymentId: true,
        refundId: true,
        contractId: true,
        attendanceId: true,
        enrollmentId: true,
        reversedAt: true,
        reversedById: true,
        reversedTransactionId: true,
        metadata: true,
        description: true,
        performedById: true,
        branchId: true,
        createdAt: true,
      },
    }),
    prisma.student.findMany({
      where: { companyId: COMPANY_ID },
      select: {
        id: true,
        balance: true,
        status: true,
        discountPercent: true,
        deletedAt: true,
        firstName: true,
        lastName: true,
      },
    }),
    prisma.cashAccount.findMany({
      where: { companyId: COMPANY_ID },
      select: {
        id: true,
        name: true,
        type: true,
        balance: true,
        branchId: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
      },
    }),
    prisma.cashMovement.findMany({
      where: { companyId: COMPANY_ID },
      select: {
        id: true,
        cashAccountId: true,
        type: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
        transactionId: true,
        reversedAt: true,
        reversedTransactionId: true,
        createdAt: true,
      },
    }),
    prisma.salaryAccrual.findMany({
      where: { companyId: COMPANY_ID },
      select: {
        id: true,
        deductionTransactionId: true,
        attendanceId: true,
        reversedAt: true,
        amount: true,
        salaryPaymentId: true,
        userId: true,
        studentId: true,
        groupId: true,
        lessonDate: true,
      },
    }),
    prisma.payment.findMany({
      where: { companyId: COMPANY_ID },
      select: {
        id: true,
        studentId: true,
        contractId: true,
        amount: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.contract.findMany({
      where: { companyId: COMPANY_ID },
      select: {
        id: true,
        studentId: true,
        paidAmount: true,
        status: true,
        deletedAt: true,
      },
    }),
    prisma.enrollment.findMany({
      where: { deletedAt: null, student: { companyId: COMPANY_ID } },
      select: {
        studentId: true,
        groupId: true,
        startDate: true,
        prepaidLessonsRemaining: true,
        status: true,
      },
    }),
    prisma.group.findMany({
      where: { companyId: COMPANY_ID },
      select: {
        id: true,
        course: { select: { price: true, lessonPaymentCount: true } },
      },
    }),
    prisma.attendance.findMany({
      where: { companyId: COMPANY_ID, status: { in: ['PRESENT', 'LATE', 'ABSENT'] } },
      select: { studentId: true, groupId: true, date: true, status: true },
    }),
  ]);

  const txns = txnsRaw as unknown as TxRow[];
  const students = studentsRaw as unknown as StudentRow[];
  const cashAccounts = cashAccountsRaw as unknown as CashAccRow[];
  const cashMovements = cashMovementsRaw as unknown as CashMovRow[];
  const accruals = accrualsRaw as unknown as AccrualRow[];
  const payments = paymentsRaw as unknown as PaymentRow[];
  const contracts = contractsRaw as unknown as ContractRow[];
  const enrollments = enrollmentsRaw as unknown as EnrollRow[];
  const groups = groupsRaw as unknown as GroupRow[];
  const atts = attsRaw as unknown as AttRow[];

  // indexes
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const txById = new Map(txns.map((t) => [t.id, t]));
  const txByStudent = new Map<number, TxRow[]>();
  for (const t of txns) {
    if (t.studentId == null) continue;
    const arr = txByStudent.get(t.studentId) ?? [];
    arr.push(t);
    txByStudent.set(t.studentId, arr);
  }
  // consumption row per attendance (for salary check F2)
  const consumptionByAttendance = new Map<string, TxRow>();
  for (const t of txns) {
    if (t.type === 'LESSON_CONSUMPTION' && t.attendanceId && t.reversedTransactionId == null) {
      consumptionByAttendance.set(t.attendanceId, t);
    }
  }

  console.log(
    `  yuklandi: ${txns.length} txn · ${students.length} o'quvchi · ${cashAccounts.length} kassa · ${cashMovements.length} kassa-harakat · ${accruals.length} accrual · ${payments.length} to'lov · ${contracts.length} shartnoma  (${Date.now() - t0}ms)`,
  );

  const results: CheckResult[] = [];

  // ════ A. LEDGER ↔ BALANS (per student) ══════════════════════════════════
  {
    const a1: any[] = [], a3: any[] = [], a4: any[] = [], a5: any[] = [], a6: any[] = [];
    for (const s of students) {
      const rows = txByStudent.get(s.id) ?? [];
      let full = 0;
      let active = 0;
      for (const r of rows) {
        full += r.amount;
        if (r.reversedAt == null && r.reversedTransactionId == null) active += r.amount;
        if (r.balanceAfter !== r.balanceBefore + r.amount) {
          a5.push({
            studentId: s.id,
            txId: r.id,
            type: r.type,
            balanceBefore: r.balanceBefore,
            amount: r.amount,
            balanceAfter: r.balanceAfter,
            expectedAfter: r.balanceBefore + r.amount,
          });
        }
      }
      if (full !== s.balance) {
        a1.push({
          studentId: s.id,
          name: name(s),
          status: s.status,
          deleted: !!s.deletedAt,
          storedBalance: s.balance,
          ledgerSum: full,
          delta: full - s.balance,
          rows: rows.length,
        });
      }
      if (full !== active) {
        a3.push({
          studentId: s.id,
          name: name(s),
          ledgerSum: full,
          activeSum: active,
          diff: active - full,
          reversedOriginals: rows.filter((r) => r.reversedAt != null).length,
          reversalRows: rows.filter((r) => r.reversedTransactionId != null).length,
        });
      }
      if (rows.length) {
        let maxT = -Infinity;
        for (const r of rows) maxT = Math.max(maxT, r.createdAt.getTime());
        const lastRows = rows.filter((r) => r.createdAt.getTime() === maxT);
        if (!lastRows.some((r) => r.balanceAfter === s.balance)) {
          a4.push({
            studentId: s.id,
            name: name(s),
            storedBalance: s.balance,
            lastRowAfters: lastRows.map((r) => r.balanceAfter),
          });
        }
        // multiset chain continuity (order-independent)
        const before = rows.map((r) => r.balanceBefore).sort((x, y) => x - y);
        const after = rows.map((r) => r.balanceAfter).sort((x, y) => x - y);
        const i0 = before.indexOf(0);
        const iB = after.indexOf(s.balance);
        let ok = i0 >= 0 && iB >= 0;
        if (ok) {
          before.splice(i0, 1);
          after.splice(iB, 1);
          ok = before.length === after.length && before.every((v, i) => v === after[i]);
        }
        if (!ok) {
          a6.push({
            studentId: s.id,
            name: name(s),
            hasGenesisZero: i0 >= 0,
            hasBalanceAnchor: iB >= 0,
            rows: rows.length,
          });
        }
      }
    }
    results.push(
      mk('A1', 'LEDGER↔BALANS  Σ(barcha amount)==balance', 'CRITICAL', a1, students.length),
      mk('A3', 'REVERSAL-NET  Σall==Σactive (juftlik 0)', 'CRITICAL', a3, students.length),
      mk('A5', 'QATOR ARIFMETIKASI  after==before+amount', 'CRITICAL', a5, txns.length),
      mk('A4', 'SNAPSHOT ANKORI  oxirgi after==balance', 'HIGH', a4, students.length),
      mk('A6', 'ZANJIR UZLUKSIZLIGI  (multiset)', 'LOW', a6, students.length),
    );
  }

  // ════ A0. ORPHAN ledger rows (studentId not in company student set) ══════
  {
    const orphans = txns
      .filter((t) => t.studentId != null && !studentMap.has(t.studentId))
      .map((t) => ({ txId: t.id, studentId: t.studentId, type: t.type, amount: t.amount }));
    results.push(mk('A0', "ORPHAN  txn.studentId mavjud emas", 'HIGH', orphans, txns.length));
  }

  // ════ B. REVERSAL WELL-FORMEDNESS (company-wide) ═════════════════════════
  {
    const reversedOriginals = txns.filter((t) => t.reversedAt != null);
    const reversalRows = txns.filter((t) => t.reversedTransactionId != null);
    const byOriginal = new Map<string, TxRow[]>();
    for (const r of reversalRows) {
      const arr = byOriginal.get(r.reversedTransactionId as string) ?? [];
      arr.push(r);
      byOriginal.set(r.reversedTransactionId as string, arr);
    }
    const b1: any[] = [], b2: any[] = [], b3: any[] = [];
    for (const o of reversedOriginals) {
      const revs = byOriginal.get(o.id) ?? [];
      if (revs.length === 0) {
        b1.push({ originalId: o.id, type: o.type, amount: o.amount, problem: 'teskari qator yo`q' });
        continue;
      }
      if (revs.length > 1) {
        b3.push({ originalId: o.id, type: o.type, reversalCount: revs.length, problem: 'ikki marta reversal' });
      }
      for (const r of revs) {
        if (r.amount !== -o.amount)
          b1.push({ originalId: o.id, reversalId: r.id, origAmount: o.amount, revAmount: r.amount, problem: 'summa teskari emas' });
        if (r.reversedAt != null)
          b1.push({ originalId: o.id, reversalId: r.id, problem: 'reversalning o`zi reversal qilingan' });
        if (r.studentId !== o.studentId || r.teacherId !== o.teacherId)
          b1.push({ originalId: o.id, reversalId: r.id, problem: 'studentId/teacherId mos emas', orig: { s: o.studentId, t: o.teacherId }, rev: { s: r.studentId, t: r.teacherId } });
      }
    }
    for (const r of reversalRows) {
      const o = txById.get(r.reversedTransactionId as string);
      if (!o) {
        b2.push({ reversalId: r.id, pointsTo: r.reversedTransactionId, problem: 'original topilmadi' });
        continue;
      }
      if (o.reversedAt == null)
        b2.push({ reversalId: r.id, originalId: o.id, problem: 'original reversedAt=null (belgilanmagan)' });
      if (r.amount !== -o.amount)
        b2.push({ reversalId: r.id, originalId: o.id, origAmount: o.amount, revAmount: r.amount, problem: 'summa teskari emas' });
    }
    const notes = [
      `reversedAt!=null: ${reversedOriginals.length} | reversedTransactionId!=null: ${reversalRows.length} (teng bo'lishi kerak)`,
    ];
    if (reversedOriginals.length !== reversalRows.length)
      b1.push({ problem: 'TRIPWIRE: reversedAt va reversedTransactionId sonlari teng emas', reversedOriginals: reversedOriginals.length, reversalRows: reversalRows.length });
    results.push(
      mk('B1', 'REVERSAL: original→aniq bitta to`g`ri teskari', 'CRITICAL', b1, reversedOriginals.length, { notes }),
      mk('B2', 'REVERSAL: teskari→real originalga ishora', 'CRITICAL', b2, reversalRows.length),
      mk('B3', 'REVERSAL: ikki marta reversal yo`q', 'CRITICAL', b3, reversedOriginals.length),
    );
  }

  // ════ C. CORRECTION-MARKER AUDIT ═════════════════════════════════════════
  {
    // C1: marker inventory (active rows)
    const byMarker = new Map<string, { count: number; sum: number; students: Set<number>; first: Date; last: Date; performers: Set<number> }>();
    for (const t of txns) {
      if (t.reversedAt != null) continue;
      const mk2 = marker(t.metadata);
      if (!mk2) continue;
      const e = byMarker.get(mk2) ?? { count: 0, sum: 0, students: new Set<number>(), first: t.createdAt, last: t.createdAt, performers: new Set<number>() };
      e.count++;
      e.sum += t.amount;
      if (t.studentId != null) e.students.add(t.studentId);
      if (t.performedById != null) e.performers.add(t.performedById);
      if (t.createdAt < e.first) e.first = t.createdAt;
      if (t.createdAt > e.last) e.last = t.createdAt;
      byMarker.set(mk2, e);
    }
    const markerInventory = Array.from(byMarker.entries())
      .map(([m, e]) => ({ marker: m, count: e.count, sum: e.sum, students: e.students.size, first: day(e.first), last: day(e.last), performers: Array.from(e.performers) }))
      .sort((a, b) => b.sum - a.sum);
    results.push(mk('C1', 'MARKER INVENTARI (aktiv tuzatishlar)', 'INFO', markerInventory, txns.length, { info: true, totals: { distinctMarkers: markerInventory.length, totalMarkedSum: markerInventory.reduce((s, m) => s + m.sum, 0) } }));

    // C1b: correction-TYPE inventory (active), with & without markers
    const byType = new Map<string, { count: number; sum: number; students: Set<number>; withMarker: number }>();
    for (const t of txns) {
      if (t.reversedAt != null) continue;
      if (!CORRECTION_TYPES.has(t.type)) continue;
      const e = byType.get(t.type) ?? { count: 0, sum: 0, students: new Set<number>(), withMarker: 0 };
      e.count++;
      e.sum += t.amount;
      if (t.studentId != null) e.students.add(t.studentId);
      if (marker(t.metadata)) e.withMarker++;
      byType.set(t.type, e);
    }
    const typeInventory = Array.from(byType.entries()).map(([type, e]) => ({ type, count: e.count, sum: e.sum, students: e.students.size, withMarker: e.withMarker }));
    results.push(mk('C1b', 'TUZATISH TURLARI INVENTARI (aktiv)', 'INFO', typeInventory, txns.length, { info: true }));

    // C2: duplicate (studentId, marker) among active rows
    const pairCount = new Map<string, { count: number; ids: string[]; sum: number }>();
    for (const t of txns) {
      if (t.reversedAt != null || t.studentId == null) continue;
      // Skip reversal entries: a per-row reversal batch (e.g. phantom cleanup
      // reversing 8 rows) legitimately tags many rows with one marker — that is
      // NOT a correction applied twice. Only originating rows count.
      if (t.reversedTransactionId != null) continue;
      const mk2 = marker(t.metadata);
      if (!mk2) continue;
      const key = `${t.studentId}::${mk2}`;
      const e = pairCount.get(key) ?? { count: 0, ids: [], sum: 0 };
      e.count++;
      e.ids.push(t.id);
      e.sum += t.amount;
      pairCount.set(key, e);
    }
    const dupes: any[] = [];
    for (const [key, e] of pairCount) {
      if (e.count > 1) {
        const [sid, m] = key.split('::');
        dupes.push({ studentId: Number(sid), name: name(studentMap.get(Number(sid))), marker: m, appliedTimes: e.count, sum: e.sum, txIds: e.ids });
      }
    }
    results.push(mk('C2', "MARKER DUBLIKAT  (studentId,marker) >1 = ikki marta qo'llangan", 'HIGH', dupes, pairCount.size));

    // C3: overcharge netting reproduction
    let overchargeNet = 0;
    let lessonDeductionActive = 0;
    for (const t of txns) {
      if (t.reversedAt != null) continue;
      if (t.type === 'LESSON_DEDUCTION') lessonDeductionActive += t.amount;
      if (t.type === 'ADJUSTMENT') {
        const m = marker(t.metadata);
        if (m && m.startsWith('overcharge')) overchargeNet += t.amount;
      }
    }
    results.push(
      mk('C3', "OVERCHARGE NETTING (reports-financial bilan bir xil)", 'INFO', [], txns.length, {
        info: true,
        totals: {
          activeLessonDeductionSum: lessonDeductionActive,
          overchargeMarkerSum: overchargeNet,
          billedLessons_abs: Math.abs(lessonDeductionActive + overchargeNet),
        },
      }),
    );

    // C4: full corrections dump (active correction-type rows + any marked row)
    const corrections = txns
      .filter((t) => CORRECTION_TYPES.has(t.type) || marker(t.metadata))
      .map((t) => ({
        txId: t.id,
        studentId: t.studentId,
        name: t.studentId != null ? name(studentMap.get(t.studentId)) : null,
        type: t.type,
        amount: t.amount,
        marker: marker(t.metadata) ?? null,
        rootCause: (t.metadata as any)?.rootCause ?? null,
        performedById: t.performedById,
        createdAt: dt(t.createdAt),
        reversed: t.reversedAt != null,
        description: t.description ?? null,
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    fs.writeFileSync(`${OUT_DIR}/audit-recon-C-corrections.json`, JSON.stringify(corrections, null, 2));
    results.push(mk('C4', `TUZATISHLAR RO'YXATI → ${OUT_DIR}/audit-recon-C-corrections.json`, 'INFO', [], corrections.length, { info: true, totals: { totalCorrectionRows: corrections.length } }));
  }

  // ════ D. FAIR-BALANCE RESIDUAL (two-sided) ═══════════════════════════════
  {
    const groupInfo = new Map<string, { perLesson: number; cycleLen: number }>();
    for (const g of groups) {
      groupInfo.set(g.id, {
        perLesson: Math.round((g.course?.price ?? 0) / (g.course?.lessonPaymentCount || 1)),
        cycleLen: g.course?.lessonPaymentCount || 12,
      });
    }
    const startByPair = new Map<string, string | null>();
    const prepaidValue = new Map<number, number>();
    const prepaidCount = new Map<number, number>();
    for (const e of enrollments) {
      const key = `${e.studentId}:${e.groupId}`;
      const sd = day(e.startDate) === '—' ? null : day(e.startDate);
      const cur = startByPair.get(key);
      if (cur === undefined) startByPair.set(key, sd);
      else if (sd && (!cur || sd < cur)) startByPair.set(key, sd);
      if (e.status === 'ACTIVE' && e.prepaidLessonsRemaining > 0) {
        const per = groupInfo.get(e.groupId)?.perLesson ?? 0;
        prepaidValue.set(e.studentId, (prepaidValue.get(e.studentId) ?? 0) + e.prepaidLessonsRemaining * per);
        prepaidCount.set(e.studentId, (prepaidCount.get(e.studentId) ?? 0) + e.prepaidLessonsRemaining);
      }
    }
    const fairChargeFull = new Map<number, number>();
    const billable = new Map<number, number>();
    for (const a of atts) {
      if (!studentMap.has(a.studentId)) continue;
      const gi = groupInfo.get(a.groupId);
      if (!gi) continue;
      const d = day(a.date);
      if (d < SYSTEM_START) continue;
      const start = startByPair.get(`${a.studentId}:${a.groupId}`);
      if (start && d < start) continue;
      fairChargeFull.set(a.studentId, (fairChargeFull.get(a.studentId) ?? 0) + gi.perLesson);
      billable.set(a.studentId, (billable.get(a.studentId) ?? 0) + 1);
    }
    // money-in (active). Exclude the lesson rows AND the correction types that
    // merely rebalance the discounted lesson charge: ADJUSTMENT (the overcharge
    // / refund batches) and DISCOUNT_ADJUSTMENT. The latter is critical — it
    // pairs with full-price deductions to net them down to the discounted rate;
    // counting it as money-in while ALSO discounting fairCharge double-counts
    // the discount and produces phantom "overcharge" residuals (e.g. #10066).
    const moneyInExcluded = new Set(['LESSON_DEDUCTION', 'LESSON_CONSUMPTION', 'ADJUSTMENT', 'DISCOUNT_ADJUSTMENT']);
    const moneyIn = new Map<number, number>();
    for (const t of txns) {
      if (t.studentId == null) continue;
      // Active-economic only: drop reversed originals AND reversal rows so a
      // reversed payment nets to zero (else it wrongly counts as negative
      // money-in, e.g. #10284's −2,750,000 reversed payment).
      if (t.reversedAt != null || t.reversedTransactionId != null) continue;
      if (moneyInExcluded.has(t.type)) continue;
      moneyIn.set(t.studentId, (moneyIn.get(t.studentId) ?? 0) + t.amount);
    }
    const over: any[] = [];
    const under: any[] = [];
    for (const s of students) {
      const discMul = 1 - (s.discountPercent || 0) / 100;
      const fairCharge = Math.round((fairChargeFull.get(s.id) ?? 0) * discMul);
      const pv = Math.round((prepaidValue.get(s.id) ?? 0) * discMul);
      const mIn = moneyIn.get(s.id) ?? 0;
      const fairPosition = mIn - fairCharge;
      const position = s.balance + pv;
      const residual = fairPosition - position;
      if (Math.abs(residual) < THRESHOLD) continue;
      const row = {
        studentId: s.id,
        name: name(s),
        status: s.status,
        deleted: !!s.deletedAt,
        residual,
        balance: s.balance,
        prepaidValue: pv,
        prepaidCount: prepaidCount.get(s.id) ?? 0,
        moneyIn: mIn,
        fairCharge,
        billableLessons: billable.get(s.id) ?? 0,
        discount: s.discountPercent || 0,
      };
      if (residual > 0) over.push(row);
      else under.push(row);
    }
    over.sort((a, b) => b.residual - a.residual);
    under.sort((a, b) => a.residual - b.residual);
    results.push(
      mk('D+', `FAIR-BALANCE: hali ORTIQCHA (residual ≥ +${som(THRESHOLD)})`, 'MEDIUM', over, students.length, { totals: { sum: over.reduce((s, r) => s + r.residual, 0) } }),
      mk('D-', `FAIR-BALANCE: KAM hisoblangan / qarz (residual ≤ −${som(THRESHOLD)})`, 'MEDIUM', under, students.length, { totals: { sum: under.reduce((s, r) => s + r.residual, 0) } }),
    );
  }

  // ════ E. CASH RECONCILIATION ═════════════════════════════════════════════
  {
    if (cashAccounts.length === 0) {
      results.push(mk('E', 'KASSA: hech qanday CashAccount sozlanmagan (N/A)', 'INFO', [], 0, { info: true, notes: ['Kassa moduli ishlatilmayapti — barcha cash-flow txnlar harakatsiz (kutilgan).'] }));
    } else {
      const movByAccount = new Map<string, CashMovRow[]>();
      for (const m of cashMovements) {
        const arr = movByAccount.get(m.cashAccountId) ?? [];
        arr.push(m);
        movByAccount.set(m.cashAccountId, arr);
      }
      // E1: account balance vs movement chain
      const e1: any[] = [];
      for (const a of cashAccounts) {
        const movs = (movByAccount.get(a.id) ?? []).slice();
        const sum = movs.reduce((s, m) => s + m.amount, 0);
        let maxT = -Infinity;
        for (const m of movs) maxT = Math.max(maxT, m.createdAt.getTime());
        const lastAfters = movs.filter((m) => m.createdAt.getTime() === maxT).map((m) => m.balanceAfter);
        const arithBad = movs.filter((m) => m.balanceAfter !== m.balanceBefore + m.amount).length;
        const anchorOk = movs.length === 0 ? a.balance === 0 : lastAfters.some((v) => v === a.balance);
        const sumOk = sum === a.balance;
        if (!anchorOk || arithBad > 0 || !sumOk) {
          e1.push({ accountId: a.id, name: a.name, type: a.type, storedBalance: a.balance, movementSum: sum, movements: movs.length, anchorOk, sumOk, arithBadRows: arithBad });
        }
      }
      results.push(mk('E1', 'KASSA: balance == harakatlar zanjiri', 'CRITICAL', e1, cashAccounts.length));

      // E2/E3: cash-flow txn ↔ movement coverage
      const movByTx = new Map<string, CashMovRow[]>();
      for (const m of cashMovements) {
        if (!m.transactionId) continue;
        const arr = movByTx.get(m.transactionId) ?? [];
        arr.push(m);
        movByTx.set(m.transactionId, arr);
      }
      let minAccCreated = Infinity;
      for (const a of cashAccounts) minAccCreated = Math.min(minAccCreated, a.createdAt.getTime());
      const e2: any[] = [];
      const e2expected: any[] = [];
      const e3: any[] = [];
      for (const t of txns) {
        if (!CASH_FLOW_TYPES.has(t.type)) continue;
        // Reversal rows unwind the ORIGINAL's movement (keyed to the original
        // transactionId), so they never carry their own movement — skip them.
        if (t.reversedTransactionId != null) continue;
        const movs = movByTx.get(t.id) ?? [];
        const activeMovs = movs.filter((m) => m.reversedAt == null);
        if (t.reversedAt == null) {
          // originating active cash-flow txn should have an active movement
          if (activeMovs.length === 0) {
            const beforeCash = t.createdAt.getTime() < minAccCreated;
            (beforeCash ? e2expected : e2).push({ txId: t.id, type: t.type, amount: t.amount, createdAt: dt(t.createdAt), reason: beforeCash ? 'kassa hali yaratilmagan' : 'kassa bor, harakat yo`q' });
          }
        } else {
          // reversed original: a reversing movement should exist
          const hasReversingMov = movs.some((m) => m.reversedTransactionId != null) || (movs.length > 0 && movs.every((m) => m.reversedAt != null));
          if (movs.length > 0 && !hasReversingMov)
            e3.push({ txId: t.id, type: t.type, amount: t.amount, movements: movs.length, problem: 'reversed txn, lekin kassa harakati bekor qilinmagan' });
        }
      }
      results.push(
        mk('E2', "KASSA: aktiv cash-flow txn → harakat bor", 'HIGH', e2, txns.length, { notes: e2expected.length ? [`${e2expected.length} ta txn kassa yaratilishidan oldin (kutilgan, INFO).`] : [] }),
        mk('E3', 'KASSA: reversed cash-flow → teskari harakat', 'HIGH', e3, txns.length),
      );

      // E4: movement.transactionId points to a real cash-flow txn
      const e4: any[] = [];
      for (const m of cashMovements) {
        if (!m.transactionId) continue;
        const t = txById.get(m.transactionId);
        if (!t) e4.push({ movementId: m.id, transactionId: m.transactionId, problem: 'txn topilmadi' });
        else if (!CASH_FLOW_TYPES.has(t.type)) e4.push({ movementId: m.id, transactionId: m.transactionId, txType: t.type, problem: 'cash-flow bo`lmagan turga ishora' });
      }
      results.push(mk('E4', 'KASSA: harakat→real cash-flow txn', 'MEDIUM', e4, cashMovements.length));
    }
  }

  // ════ F. SALARY / ACCRUAL SANITY ═════════════════════════════════════════
  {
    const f1: any[] = [], f2: any[] = [], f3: any[] = [];
    for (const a of accruals) {
      if (a.reversedAt != null) continue;
      // F1: coverage tx must be active
      if (a.deductionTransactionId) {
        const cov = txById.get(a.deductionTransactionId);
        if (!cov) f1.push({ accrualId: a.id, deductionTxId: a.deductionTransactionId, problem: 'coverage txn topilmadi' });
        else if (cov.reversedAt != null) f1.push({ accrualId: a.id, userId: a.userId, studentId: a.studentId, amount: a.amount, problem: 'coverage txn reversed, accrual esa aktiv' });
      } else if (a.attendanceId) {
        // F3: lesson accrual without coverage link (B.1) — legacy may be null
        f3.push({ accrualId: a.id, userId: a.userId, studentId: a.studentId, attendanceId: a.attendanceId, amount: a.amount });
      }
      // F2: linked consumption reversed but accrual not
      if (a.attendanceId) {
        const cons = consumptionByAttendance.get(a.attendanceId);
        // if there's no active consumption for this attendance but accrual active → lesson was undone
        if (!cons) {
          const anyConsReversed = txns.some((t) => t.type === 'LESSON_CONSUMPTION' && t.attendanceId === a.attendanceId && t.reversedAt != null);
          if (anyConsReversed) f2.push({ accrualId: a.id, userId: a.userId, studentId: a.studentId, attendanceId: a.attendanceId, amount: a.amount, problem: 'consumption reversed, accrual aktiv' });
        }
      }
    }
    results.push(
      mk('F1', 'OYLIK: accrual coverage txn aktiv', 'MEDIUM', f1, accruals.length),
      mk('F2', 'OYLIK: reversed dars accruali ham reversed', 'MEDIUM', f2, accruals.length),
      mk('F3', 'OYLIK: coverage`siz dars accruali (B.1, legacy)', 'LOW', f3, accruals.length),
    );
  }

  // ════ G. PAYMENT ↔ LEDGER ════════════════════════════════════════════════
  {
    const payTxByPaymentId = new Map<string, TxRow[]>();
    for (const t of txns) {
      if (t.type === 'PAYMENT' && t.paymentId) {
        const arr = payTxByPaymentId.get(t.paymentId) ?? [];
        arr.push(t);
        payTxByPaymentId.set(t.paymentId, arr);
      }
    }
    const g1: any[] = [];
    for (const p of payments) {
      const txs = payTxByPaymentId.get(p.id) ?? [];
      const active = txs.filter((t) => t.reversedAt == null && t.reversedTransactionId == null);
      if (p.status === 'COMPLETED') {
        const sum = active.reduce((s, t) => s + t.amount, 0);
        if (active.length === 0) g1.push({ paymentId: p.id, studentId: p.studentId, amount: p.amount, problem: 'COMPLETED to`lov, lekin aktiv PAYMENT txn yo`q' });
        else if (sum !== p.amount) g1.push({ paymentId: p.id, studentId: p.studentId, paymentAmount: p.amount, ledgerSum: sum, problem: 'summa mos emas' });
      } else if (p.status === 'REVERSED') {
        if (active.length > 0) g1.push({ paymentId: p.id, studentId: p.studentId, problem: 'REVERSED to`lov, lekin aktiv PAYMENT txn bor', activeCount: active.length });
      }
    }
    results.push(mk('G1', 'TO`LOV↔LEDGER: COMPLETED payment == aktiv PAYMENT txn', 'MEDIUM', g1, payments.length));

    // G2: Contract.paidAmount reconciliation
    const g2: any[] = [];
    const paidByContract = new Map<string, number>();
    for (const p of payments) {
      if (p.status !== 'COMPLETED' || !p.contractId) continue;
      paidByContract.set(p.contractId, (paidByContract.get(p.contractId) ?? 0) + p.amount);
    }
    const refundByContract = new Map<string, number>();
    for (const t of txns) {
      if (t.type === 'REFUND' && t.contractId && t.reversedAt == null) {
        refundByContract.set(t.contractId, (refundByContract.get(t.contractId) ?? 0) + Math.abs(t.amount));
      }
    }
    for (const c of contracts) {
      const expected = (paidByContract.get(c.id) ?? 0) - (refundByContract.get(c.id) ?? 0);
      if (expected !== c.paidAmount)
        g2.push({ contractId: c.id, studentId: c.studentId, status: c.status, storedPaidAmount: c.paidAmount, expected, delta: c.paidAmount - expected });
    }
    results.push(mk('G2', 'SHARTNOMA: paidAmount == Σpayments − refunds', 'MEDIUM', g2, contracts.length));
  }

  // ════ H. AGGREGATE / REPORTING RECONCILIATION ════════════════════════════
  {
    const ledgerStudentSum = txns.reduce((s, t) => (t.studentId != null ? s + t.amount : s), 0);
    const balanceSum = students.reduce((s, st) => s + st.balance, 0);
    const h1: any[] = [];
    if (ledgerStudentSum !== balanceSum)
      h1.push({ problem: 'company-darajada Σbalance ≠ Σledger', balanceSum, ledgerStudentSum, delta: ledgerStudentSum - balanceSum });
    results.push(mk('H1', 'AGREGAT: Σ Student.balance == Σ student-ledger', 'CRITICAL', h1, students.length, { totals: { balanceSum, ledgerStudentSum } }));

    // H3: total debt — in-memory vs DB aggregate cross-check
    const debtMem = students
      .filter((s) => s.balance < 0 && s.status === 'ACTIVE' && s.deletedAt == null)
      .reduce((s, st) => s + -st.balance, 0);
    const debtAgg = await prisma.student.aggregate({
      where: { companyId: COMPANY_ID, deletedAt: null, status: 'ACTIVE', balance: { lt: 0 } },
      _sum: { balance: true },
      _count: true,
    });
    const debtDb = Math.abs(debtAgg._sum.balance ?? 0);
    const h3: any[] = [];
    if (debtMem !== debtDb) h3.push({ problem: 'in-memory debt ≠ DB aggregate', debtMem, debtDb });
    results.push(mk('H3', 'AGREGAT: jami qarz (in-memory == DB)', 'HIGH', h3, debtAgg._count, { totals: { totalDebt: debtDb, debtors: debtAgg._count } }));

    // H4: active balance roll-up (INFO)
    const activeBalance = students.filter((s) => s.status === 'ACTIVE' && s.deletedAt == null).reduce((s, st) => s + st.balance, 0);
    results.push(mk('H4', 'AGREGAT: aktiv o`quvchilar balansi yig`indisi', 'INFO', [], students.length, { info: true, totals: { activeBalance } }));
  }

  // ── render matrix ─────────────────────────────────────────────────────────
  const sevRank: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  const icon = (r: CheckResult) => (r.status === 'PASS' ? '✓ PASS' : r.status === 'INFO' ? 'ℹ INFO' : '✗ FAIL');

  if (!JSON_ONLY) {
    section('SOLISHTIRUV MATRITSASI (A–H)');
    printTable(
      ['ID', 'tekshiruv', 'severity', 'natija', 'skan', 'istisno'],
      results.map((r) => [r.id, r.title, r.severity, icon(r), r.scanned, r.status === 'INFO' ? '—' : r.exceptions.length]),
      ['l', 'l', 'l', 'l', 'r', 'r'],
    );

    // totals lines for INFO checks
    section("MUHIM RAQAMLAR");
    for (const r of results) {
      if (r.totals && Object.keys(r.totals).length) {
        const parts = Object.entries(r.totals).map(([k, v]) => `${k}=${typeof v === 'number' ? som(v) : v}`);
        console.log(`  [${r.id}] ${parts.join('  ')}`);
      }
      if (r.notes) for (const n of r.notes) console.log(`  [${r.id}] ${n}`);
    }

    // detail for FAILs + INFO inventories
    for (const r of results) {
      if (r.status === 'PASS') continue;
      if (r.status === 'INFO' && r.exceptions.length === 0) continue;
      section(`[${r.id}] ${r.title} — ${r.status} (${r.exceptions.length})`);
      const rows = FULL ? r.exceptions : r.exceptions.slice(0, 20);
      const keys = rows.length ? Object.keys(rows[0]) : [];
      printTable(
        keys,
        rows.map((e) => keys.map((k) => {
          const v = (e as any)[k];
          return typeof v === 'number' ? som(v) : v == null ? '—' : Array.isArray(v) ? v.join(',') : String(v);
        })),
      );
      if (!FULL && r.exceptions.length > 20) console.log(`  … +${r.exceptions.length - 20} ta yana (to'lig'i JSON'da, --full bilan hammasi)`);
    }
  }

  // ── dump JSON ─────────────────────────────────────────────────────────────
  for (const r of results) {
    if (r.exceptions.length) fs.writeFileSync(`${OUT_DIR}/audit-recon-${r.id}.json`, JSON.stringify(r.exceptions, null, 2));
  }
  const summary = {
    ranAt: new Date().toISOString(),
    dbHost: dbHost(),
    env: dbEnvLabel(),
    companyId: COMPANY_ID,
    threshold: THRESHOLD,
    counts: { txns: txns.length, students: students.length, cashAccounts: cashAccounts.length, cashMovements: cashMovements.length, accruals: accruals.length, payments: payments.length, contracts: contracts.length },
    checks: results.map((r) => ({ id: r.id, title: r.title, severity: r.severity, status: r.status, scanned: r.scanned, exceptions: r.exceptions.length, totals: r.totals })),
  };
  fs.writeFileSync(`${OUT_DIR}/audit-recon-summary.json`, JSON.stringify(summary, null, 2));

  // ── verdict + exit code ───────────────────────────────────────────────────
  const fails = results.filter((r) => r.status === 'FAIL');
  const critHigh = fails.filter((r) => r.severity === 'CRITICAL' || r.severity === 'HIGH');
  section('XULOSA');
  if (fails.length === 0) {
    console.log('  ✓ Barcha solishtiruvlar O`TDI — moliyaviy hisob-kitob ledger bilan to`liq mos.');
  } else {
    console.log(`  ✗ ${fails.length} ta tekshiruv FAIL (${critHigh.length} ta CRITICAL/HIGH).`);
    console.log(`    ${fails.map((r) => `${r.id}(${r.severity}:${r.exceptions.length})`).join('  ')}`);
  }
  console.log(`  JSON: ${OUT_DIR}/audit-recon-summary.json  +  har FAIL uchun audit-recon-<ID>.json`);
  process.exitCode = critHigh.length ? 2 : 0;
}

run(main);
