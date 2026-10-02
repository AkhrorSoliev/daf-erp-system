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
}

export interface MonthChargeRow {
  studentId: number;
  periodYear: number;
  periodMonth: number;
  branchId: number;
  chargedAmount: number;
}

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
 * several branches share his unpaid part by amount.
 */
export function splitMonthCharges(input: {
  month: string;
  branchIds: ReportBranchIds;
  rows: readonly MonthChargeRow[];
  balances: ReadonlyMap<number, number>;
}): MonthCharges {
  const [y, m] = input.month.split('-').map(Number);
  const target = y * 12 + m;
  const per = new Map<number, { all: number; scope: number; later: number }>();
  for (const r of input.rows) {
    const key = r.periodYear * 12 + r.periodMonth;
    if (key < target) continue;
    const s = per.get(r.studentId) ?? { all: 0, scope: 0, later: 0 };
    if (key > target) {
      s.later += r.chargedAmount;
    } else {
      s.all += r.chargedAmount;
      if (input.branchIds === null || input.branchIds.includes(r.branchId)) {
        s.scope += r.chargedAmount;
      }
    }
    per.set(r.studentId, s);
  }

  let charged = 0;
  let unpaid = 0;
  let students = 0;
  for (const [studentId, s] of per) {
    if (s.scope <= 0) continue;
    students += 1;
    charged += s.scope;
    const debt = Math.max(0, -(input.balances.get(studentId) ?? 0));
    const unpaidAll = Math.min(Math.max(0, debt - s.later), s.all);
    unpaid += Math.round((unpaidAll * s.scope) / s.all);
  }
  const paid = charged - unpaid;
  return {
    month: input.month,
    charged,
    paid,
    unpaid,
    paidPct: charged > 0 ? Math.round((paid / charged) * 1000) / 10 : null,
    students,
  };
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
