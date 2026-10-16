import { MonthlyChargeStatus, Prisma } from '@prisma/client';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';

/**
 * The first month billed by `EnrollmentMonthlyCharge` — every course moved to
 * monthly payment on 01.09.2026. From this month the month's main figure is
 * what was charged («Bu oy hisoblandi»), not the lesson-value forecast
 * («Oy oxiriga kutilyapti»), which stays for the months before it (spec A2.1).
 */
export const MONTHLY_BILLING_START_MONTH = '2026-09';

export function isMonthlyBillingMonth(month: string): boolean {
  return month >= MONTHLY_BILLING_START_MONTH;
}

/** «Bu oy hisoblandi / To'landi / Qoldi» for one month (ADR-0058). */
export interface MonthCharges {
  month: string;
  /** Σ chargedAmount of the month's CHARGED charges in scope. */
  charged: number;
  /** charged − unpaid. */
  paid: number;
  /** The part of the month's charges still unpaid today. */
  unpaid: number;
  /** paid ÷ charged, one decimal; null when nothing was charged. */
  paidPct: number | null;
  /** Students with a charge in scope. */
  students: number;
  /**
   * Students whose unpaid share in scope is above 0 — counted in
   * `splitMonthCharges` where `unpaid` is summed, so the two cannot disagree.
   */
  unpaidStudents: number;
}

export interface MonthChargeRow {
  studentId: number;
  periodYear: number;
  periodMonth: number;
  branchId: number;
  chargedAmount: number;
}

/** A charge row the per-charge split names in its answer (spec B5 §4.2). */
export interface MonthChargeLine extends MonthChargeRow {
  id: string;
  groupId: string;
  enrollmentId: string;
}

/** One in-scope charge of the month and its part of the student's unpaid share. */
export interface ChargeShare {
  id: string;
  studentId: number;
  groupId: string;
  enrollmentId: string;
  charged: number;
  unpaid: number;
}

interface SplitInput<R extends MonthChargeRow> {
  month: string;
  branchIds: ReportBranchIds;
  rows: readonly R[];
  balances: ReadonlyMap<number, number>;
}

/** paid ÷ charged, one decimal; null when nothing was charged. */
export function paidPctOf(paid: number, charged: number): number | null {
  return charged > 0 ? Math.round((paid / charged) * 1000) / 10 : null;
}

const monthIndex = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return y * 12 + m;
};

const inScope = (branchIds: ReportBranchIds, branchId: number): boolean =>
  branchIds === null || branchIds.includes(branchId);

/**
 * Pure. A balance settles the OLDEST charge first, so today's debt sits on the
 * newest charges: for the month M a student owes
 * `min(max(0, debt − later months' charges), M's charges)`. This is the CEO's
 * 27.09 rule (spec §2.1, «shu oy = min(qarz, shu oyning hisoblari)»), extended
 * to a past month by setting the later months aside first — the same way
 * contract 3.2's admission counts a later month as still held (`heldLater`).
 *
 * `rows` are the students' CHARGED charges of M and LATER months, all
 * branches; rows of earlier months are ignored. A student's charges of M in
 * several branches share his unpaid part by amount: `scope` is his in-scope
 * charge, `unpaid` the in-scope share. The ONE formula — `splitMonthCharges`
 * adds these up and `splitMonthChargesByCharge` spreads them; nothing else may
 * compute a month's unpaid part.
 */
function studentShares(
  input: SplitInput<MonthChargeRow>,
): Map<number, { scope: number; unpaid: number }> {
  const target = monthIndex(input.month);
  const per = new Map<number, { all: number; scope: number; later: number }>();
  for (const r of input.rows) {
    const key = r.periodYear * 12 + r.periodMonth;
    if (key < target) continue;
    const s = per.get(r.studentId) ?? { all: 0, scope: 0, later: 0 };
    if (key > target) {
      s.later += r.chargedAmount;
    } else {
      s.all += r.chargedAmount;
      if (inScope(input.branchIds, r.branchId)) s.scope += r.chargedAmount;
    }
    per.set(r.studentId, s);
  }
  const out = new Map<number, { scope: number; unpaid: number }>();
  for (const [studentId, s] of per) {
    if (s.scope <= 0) continue;
    const debt = Math.max(0, -(input.balances.get(studentId) ?? 0));
    const unpaidAll = Math.min(Math.max(0, debt - s.later), s.all);
    out.set(studentId, {
      scope: s.scope,
      unpaid: Math.round((unpaidAll * s.scope) / s.all),
    });
  }
  return out;
}

/** «Bu oy hisoblandi / To'landi / Qoldi» in scope (ADR-0058): the students' shares added up. */
export function splitMonthCharges(
  input: SplitInput<MonthChargeRow>,
): MonthCharges {
  let charged = 0;
  let unpaid = 0;
  let unpaidStudents = 0;
  const shares = studentShares(input);
  for (const s of shares.values()) {
    charged += s.scope;
    unpaid += s.unpaid;
    if (s.unpaid > 0) unpaidStudents += 1;
  }
  const paid = charged - unpaid;
  return {
    month: input.month,
    charged,
    paid,
    unpaid,
    paidPct: paidPctOf(paid, charged),
    students: shares.size,
    unpaidStudents,
  };
}

/**
 * Pure. Each student's unpaid share (`studentShares`) spread over his in-scope
 * charges of `month` by `chargedAmount`. The so'm left by rounding go to the
 * largest remainders (ties by charge id), so a student's charges add up to his
 * share EXACTLY and any grouping of the answer adds up to `splitMonthCharges`'
 * `unpaid` (spec B5 §4.2). Rows of later months, of other branches and of
 * students with nothing charged in scope get no entry. Integer arithmetic:
 * `unpaid × chargedAmount` stays far below 2^53.
 */
export function splitMonthChargesByCharge(
  input: SplitInput<MonthChargeLine>,
): ChargeShare[] {
  const shares = studentShares(input);
  const target = monthIndex(input.month);
  const mine = input.rows.filter(
    (r) =>
      r.periodYear * 12 + r.periodMonth === target &&
      inScope(input.branchIds, r.branchId) &&
      shares.has(r.studentId),
  );
  const byStudent = new Map<number, MonthChargeLine[]>();
  for (const r of mine) {
    const list = byStudent.get(r.studentId);
    if (list) list.push(r);
    else byStudent.set(r.studentId, [r]);
  }
  const unpaidById = new Map<string, number>();
  for (const [studentId, lines] of byStudent) {
    const { scope, unpaid } = shares.get(studentId)!;
    const parts = lines.map((l) => ({
      id: l.id,
      base: Math.floor((unpaid * l.chargedAmount) / scope),
      rem: (unpaid * l.chargedAmount) % scope,
    }));
    let left = unpaid - parts.reduce((s, p) => s + p.base, 0);
    for (const p of [...parts].sort(
      (a, b) => b.rem - a.rem || (a.id < b.id ? -1 : 1),
    )) {
      if (left <= 0) break;
      p.base += 1;
      left -= 1;
    }
    for (const p of parts) unpaidById.set(p.id, p.base);
  }
  return mine.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    groupId: r.groupId,
    enrollmentId: r.enrollmentId,
    charged: r.chargedAmount,
    unpaid: unpaidById.get(r.id) ?? 0,
  }));
}

type MonthChargesDb = {
  enrollmentMonthlyCharge: Pick<
    Prisma.TransactionClient['enrollmentMonthlyCharge'],
    'findMany'
  >;
  student: Pick<Prisma.TransactionClient['student'], 'findMany'>;
};

/**
 * Branch scoping is a CHAIN: only the first query carries `branchId`; the
 * other two read the students it returned (their later charges in any branch
 * still sit on their one balance).
 */
export async function loadMonthCharges(
  prisma: MonthChargesDb,
  companyId: number,
  opts: { month: string; branchIds: ReportBranchIds },
): Promise<MonthCharges> {
  const [y, m] = opts.month.split('-').map(Number);
  const holders = await prisma.enrollmentMonthlyCharge.findMany({
    where: {
      companyId,
      periodYear: y,
      periodMonth: m,
      status: MonthlyChargeStatus.CHARGED,
      ...branchIdWhere(opts.branchIds),
    },
    select: { studentId: true },
    distinct: ['studentId'],
  });
  const studentIds = holders.map((h) => h.studentId);
  if (studentIds.length === 0) {
    return splitMonthCharges({
      ...opts,
      rows: [],
      balances: new Map(),
    });
  }
  const [rows, students] = await Promise.all([
    prisma.enrollmentMonthlyCharge.findMany({
      where: {
        companyId,
        studentId: { in: studentIds },
        status: MonthlyChargeStatus.CHARGED,
        OR: [
          { periodYear: { gt: y } },
          { periodYear: y, periodMonth: { gte: m } },
        ],
      },
      select: {
        studentId: true,
        periodYear: true,
        periodMonth: true,
        branchId: true,
        chargedAmount: true,
      },
    }),
    prisma.student.findMany({
      where: { companyId, id: { in: studentIds } },
      select: { id: true, balance: true },
    }),
  ]);
  return splitMonthCharges({
    ...opts,
    rows,
    balances: new Map(students.map((s) => [s.id, s.balance])),
  });
}
