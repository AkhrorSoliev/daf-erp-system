import { MonthlyChargeStatus, Prisma, StudentStatus } from '@prisma/client';
import {
  studentBranchWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { activeStudentWhere } from '../students/shared/active-student-where';
import { tashkentMonthKey } from '../common/date/tashkent';

/**
 * Qarz — ikki alohida raqam, hech qayerda qo'shilmaydi (CEO, 27.09; ADR-0059).
 * «O'qiyotganlar» = faol o'quvchi ta'rifi (ADR-0015): statusi ACTIVE va faol
 * guruhda faol yozuvi bor. Guruhsiz, muzlatilgan, ketgan — «O'qimayotganlar».
 * Arxivdagi karta (deletedAt) hech qayerda sanalmaydi.
 */
export interface DebtSplit {
  studying: {
    total: number;
    count: number;
    /** 🟡 qarzning shu oy hisobigacha bo'lgan qismi. */
    currentMonth: number;
    /** 🔴 qolgani. */
    older: number;
    /** Studying debtors with some «eski qarz» (`older > 0`). */
    olderCount: number;
  };
  notStudying: {
    total: number;
    count: number;
    /**
     * «guruhsiz» / «muzlatilgan» / «ketgan» (ADR-0067). Parts of `total` and
     * `count` by construction — they add up to them exactly.
     */
    byKind: { ungrouped: DebtKind; frozen: DebtKind; left: DebtKind };
  };
}

/** One part of a debt: how much and how many students owe it. */
export interface DebtKind {
  total: number;
  count: number;
}

/** One `groupBy(['status'])` row of the not-studying set. */
export interface NotStudyingByStatus {
  status: string;
  sum: number | null;
  count: number;
}

/**
 * Which «o'qimayotgan» kind a not-studying debtor is, from the status alone.
 *
 * The not-studying set is `debtorBase ∧ ¬activeStudentWhere()`, and
 * `activeStudentWhere() = status ACTIVE ∧ enrollments.some(E)`. On a row whose
 * status IS ACTIVE the negation leaves `¬enrollments.some(E)`, i.e.
 * `enrollments.none(E)` — exactly `ungroupedStudentWhere()`, which is built
 * from the same `E` (`ACTIVE_ENROLLMENT_WHERE`). So ACTIVE here means
 * «guruhsiz»; FROZEN is «muzlatilgan»; every other status (EXPELLED,
 * GRADUATED, INACTIVE, ARCHIVED with `deletedAt` null, PROSPECT) is «ketgan».
 */
export function debtKindOf(
  status: string,
): keyof DebtSplit['notStudying']['byKind'] {
  if (status === StudentStatus.ACTIVE) return 'ungrouped';
  if (status === StudentStatus.FROZEN) return 'frozen';
  return 'left';
}

/** Pure. `shuOy = min(qarz, shu oyning hisoblari)`, `eski = qarz − shuOy`. */
export function splitDebt(input: {
  studying: readonly { id: number; balance: number }[];
  chargedThisMonth: ReadonlyMap<number, number>;
  notStudying: readonly NotStudyingByStatus[];
}): DebtSplit {
  let total = 0;
  let currentMonth = 0;
  let olderCount = 0;
  for (const s of input.studying) {
    const debt = Math.max(0, -s.balance);
    const thisMonth = Math.min(debt, input.chargedThisMonth.get(s.id) ?? 0);
    total += debt;
    currentMonth += thisMonth;
    if (debt > thisMonth) olderCount += 1;
  }
  const byKind = {
    ungrouped: { total: 0, count: 0 },
    frozen: { total: 0, count: 0 },
    left: { total: 0, count: 0 },
  };
  for (const row of input.notStudying) {
    const kind = byKind[debtKindOf(row.status)];
    kind.total += Math.max(0, -(row.sum ?? 0));
    kind.count += row.count;
  }
  return {
    studying: {
      total,
      count: input.studying.length,
      currentMonth,
      older: total - currentMonth,
      olderCount,
    },
    notStudying: {
      total: byKind.ungrouped.total + byKind.frozen.total + byKind.left.total,
      count: byKind.ungrouped.count + byKind.frozen.count + byKind.left.count,
      byKind,
    },
  };
}

type DebtSplitDb = {
  student: Pick<Prisma.TransactionClient['student'], 'findMany' | 'groupBy'>;
  enrollmentMonthlyCharge: Pick<
    Prisma.TransactionClient['enrollmentMonthlyCharge'],
    'groupBy'
  >;
};

/** Ikkala raqamning asosi: arxivda bo'lmagan, balansi manfiy, qamrovdagi karta. */
function debtorBase(
  companyId: number,
  branchIds: ReportBranchIds,
): Prisma.StudentWhereInput {
  return {
    companyId,
    deletedAt: null,
    balance: { lt: 0 },
    ...studentBranchWhere(branchIds),
  };
}

/**
 * «O'qiyotganlar qarzi»ning qarzdorlari. `loadDebtSplit` o'qiyotganlar jamisini
 * shu shart bilan o'qiydi, `/qarzdorlar` ning «Eng katta 5 ta» ro'yxati ham —
 * shuning uchun ro'yxat ustidagi jamining bir qismi. O'qimayotganlar — o'sha
 * asos, `activeStudentWhere()` ning inkori bilan.
 */
export function studyingDebtorWhere(
  companyId: number,
  branchIds: ReportBranchIds,
): Prisma.StudentWhereInput {
  return { ...debtorBase(companyId, branchIds), ...activeStudentWhere() };
}

export async function loadDebtSplit(
  prisma: DebtSplitDb,
  companyId: number,
  opts: { branchIds: ReportBranchIds; month?: string },
): Promise<DebtSplit> {
  const month = opts.month ?? tashkentMonthKey(new Date());
  const [y, m] = month.split('-').map(Number);
  const [studying, notStudying] = await Promise.all([
    prisma.student.findMany({
      where: studyingDebtorWhere(companyId, opts.branchIds),
      select: { id: true, balance: true },
    }),
    // One row per status of the not-studying set; `debtKindOf` names each.
    prisma.student.groupBy({
      by: ['status'],
      where: {
        ...debtorBase(companyId, opts.branchIds),
        NOT: activeStudentWhere(),
      },
      _sum: { balance: true },
      _count: { _all: true },
    }),
  ]);
  const charges =
    studying.length === 0
      ? []
      : await prisma.enrollmentMonthlyCharge.groupBy({
          by: ['studentId'],
          where: {
            companyId,
            studentId: { in: studying.map((s) => s.id) },
            periodYear: y,
            periodMonth: m,
            status: MonthlyChargeStatus.CHARGED,
          },
          _sum: { chargedAmount: true },
        });
  return splitDebt({
    studying,
    chargedThisMonth: new Map(
      charges.map((c) => [c.studentId, c._sum.chargedAmount ?? 0]),
    ),
    notStudying: notStudying.map((r) => ({
      status: r.status,
      sum: r._sum.balance,
      count: r._count._all,
    })),
  });
}
