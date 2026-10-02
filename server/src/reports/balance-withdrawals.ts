import { Prisma, TransactionType } from '@prisma/client';
import { tashkentMonthRangeUtc } from '../common/date/tashkent';
import {
  branchIdWhere,
  isEmptyScope,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';

/**
 * «Yechib olish» as a revenue leg of the net profit (ADR-0055).
 *
 * A withdrawal moves a student's prepaid money into the centre's account.
 * The cash was counted as «Tushum» the day the student paid; what changes
 * now is that the money stops being the student's, so the month it is
 * withdrawn in earns it. The lesson-value revenue (`valueHeldLessons`) never
 * sees it — no lesson was held for it — so it is read here and added beside
 * that revenue, never folded into it.
 *
 * Keyed by `createdAt`: since ADR-0055 a withdrawal is always booked in the
 * current Tashkent month, so the row's own timestamp IS its month. Signed, so
 * a counter-row would net `total` out in the month it is written. There is no
 * reversal path today; one would also have to reverse the linked accrual and
 * carry `creditTeacher` (`reverseTransaction` copies no metadata), or
 * `teacherCredited` would not net.
 */
export interface BalanceWithdrawals {
  /** Σ withdrawn over the window, so'm. */
  total: number;
  /** The part that was also credited to a teacher's salary. */
  teacherCredited: number;
  /** Per student, largest first; a student whose rows net to 0 is dropped. */
  students: { studentId: number; name: string; amount: number }[];
}

export const NO_BALANCE_WITHDRAWALS: BalanceWithdrawals = {
  total: 0,
  teacherCredited: 0,
  students: [],
};

/** `months` is a contiguous, whole-month window ('YYYY-MM'). */
export async function loadBalanceWithdrawals(
  prisma: Pick<Prisma.TransactionClient, 'transaction'>,
  companyId: number,
  { months, branchIds }: { months: string[]; branchIds: ReportBranchIds },
): Promise<BalanceWithdrawals> {
  if (months.length === 0 || isEmptyScope(branchIds)) {
    return NO_BALANCE_WITHDRAWALS;
  }
  const sorted = [...months].sort();
  const rows = await prisma.transaction.findMany({
    where: {
      companyId,
      type: TransactionType.BALANCE_WITHDRAWAL,
      createdAt: {
        gte: tashkentMonthRangeUtc(sorted[0]).gte,
        lt: tashkentMonthRangeUtc(sorted[sorted.length - 1]).lt,
      },
      ...branchIdWhere(branchIds),
    },
    select: {
      studentId: true,
      amount: true,
      metadata: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  let total = 0;
  let teacherCredited = 0;
  const byStudent = new Map<number, { name: string; amount: number }>();
  for (const r of rows) {
    const withdrawn = -r.amount;
    total += withdrawn;
    const meta = r.metadata as { creditTeacher?: boolean } | null;
    if (meta?.creditTeacher === true) teacherCredited += withdrawn;
    if (r.studentId == null) continue;
    const entry = byStudent.get(r.studentId) ?? {
      name: `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim(),
      amount: 0,
    };
    entry.amount += withdrawn;
    byStudent.set(r.studentId, entry);
  }

  return {
    total,
    teacherCredited,
    students: [...byStudent]
      .map(([studentId, s]) => ({ studentId, name: s.name, amount: s.amount }))
      .filter((s) => s.amount !== 0)
      .sort((a, b) => b.amount - a.amount),
  };
}
