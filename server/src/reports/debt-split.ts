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
    /** Studying debtors with a «shu oy» part — the Shu oy tab's count. */
    currentMonthCount: number;
    /** 🔴 qolgani. */
    older: number;
    /** Studying debtors with some «eski qarz» (`older > 0`). */
    olderCount: number;
  };
  notStudying: {
    total: number;
    count: number;
    /**
     * Σ min(debt, this month's CHARGED charges) of the not-studying debtors —
     * their part of the overview's «Qoldi» (ADR-0072).
     */
    currentMonth: number;
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

export type DebtKindKey = keyof DebtSplit['notStudying']['byKind'];

/** The debt page's three tabs (spec B2a §2.2). */
export type DebtTab = 'shu-oy' | 'eski' | 'chiqqan';
export const DEBT_TABS: readonly DebtTab[] = ['shu-oy', 'eski', 'chiqqan'];

/** One debtor of the base, with the parts every debt surface reads. */
export interface DebtRow {
  studentId: number;
  /** The whole debt (−balance). */
  debt: number;
  /** min(debt, this month's CHARGED charges) — «shu oy». */
  currentMonth: number;
  /** debt − currentMonth — «eski qarz». */
  older: number;
  /** null = studying (ADR-0059); else the not-studying kind (ADR-0067). */
  kind: DebtKindKey | null;
}

/**
 * THE tab rule (ADR-0072): what a debtor owes in a tab, 0 when not in it. The
 * debt list's rows and `sumDebtRows`' totals both read it, so a tab's total is
 * the sum of its rows. A studying debtor with both parts is in both studying
 * tabs — two views of one debt, never two debts.
 */
export function debtTabAmount(row: DebtRow, tab: DebtTab): number {
  if (tab === 'chiqqan') return row.kind === null ? 0 : row.debt;
  if (row.kind !== null) return 0;
  return tab === 'shu-oy' ? row.currentMonth : row.older;
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
export function debtKindOf(status: string): DebtKindKey {
  if (status === StudentStatus.ACTIVE) return 'ungrouped';
  if (status === StudentStatus.FROZEN) return 'frozen';
  return 'left';
}

/** Pure. One row per debtor: `shuOy = min(qarz, shu oyning hisoblari)`, `eski = qarz − shuOy`. */
export function debtRows(input: {
  studying: readonly { id: number; balance: number }[];
  notStudying: readonly { id: number; balance: number; status: string }[];
  chargedThisMonth: ReadonlyMap<number, number>;
}): DebtRow[] {
  const row = (
    studentId: number,
    balance: number,
    kind: DebtKindKey | null,
  ): DebtRow => {
    const debt = Math.max(0, -balance);
    const currentMonth = Math.min(
      debt,
      input.chargedThisMonth.get(studentId) ?? 0,
    );
    return { studentId, debt, currentMonth, older: debt - currentMonth, kind };
  };
  return [
    ...input.studying.map((s) => row(s.id, s.balance, null)),
    ...input.notStudying.map((s) => row(s.id, s.balance, debtKindOf(s.status))),
  ];
}

/** Pure. Every total is a sum of `debtTabAmount` over the rows — never a second rule. */
export function sumDebtRows(rows: readonly DebtRow[]): DebtSplit {
  const kind = (): DebtKind => ({ total: 0, count: 0 });
  const split: DebtSplit = {
    studying: {
      total: 0,
      count: 0,
      currentMonth: 0,
      currentMonthCount: 0,
      older: 0,
      olderCount: 0,
    },
    notStudying: {
      total: 0,
      count: 0,
      currentMonth: 0,
      byKind: { ungrouped: kind(), frozen: kind(), left: kind() },
    },
  };
  for (const r of rows) {
    if (r.kind === null) {
      const s = split.studying;
      const shuOy = debtTabAmount(r, 'shu-oy');
      const eski = debtTabAmount(r, 'eski');
      s.total += r.debt;
      s.count += 1;
      s.currentMonth += shuOy;
      if (shuOy > 0) s.currentMonthCount += 1;
      s.older += eski;
      if (eski > 0) s.olderCount += 1;
    } else {
      const n = split.notStudying;
      const amount = debtTabAmount(r, 'chiqqan');
      n.total += amount;
      n.count += 1;
      n.currentMonth += r.currentMonth;
      n.byKind[r.kind].total += amount;
      n.byKind[r.kind].count += 1;
    }
  }
  return split;
}

/** Pure. `sumDebtRows(debtRows(input))`. */
export function splitDebt(input: Parameters<typeof debtRows>[0]): DebtSplit {
  return sumDebtRows(debtRows(input));
}

type DebtSplitDb = {
  student: Pick<Prisma.TransactionClient['student'], 'findMany'>;
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
 * «O'qiyotganlar qarzi»ning qarzdorlari. `loadDebtRows` o'qiyotganlarni
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

/** Every debtor of the base as a row, and the totals summed from those rows. */
export async function loadDebtRows(
  prisma: DebtSplitDb,
  companyId: number,
  opts: { branchIds: ReportBranchIds; month?: string },
): Promise<{ rows: DebtRow[]; split: DebtSplit }> {
  const month = opts.month ?? tashkentMonthKey(new Date());
  const [y, m] = month.split('-').map(Number);
  const [studying, notStudying] = await Promise.all([
    prisma.student.findMany({
      where: studyingDebtorWhere(companyId, opts.branchIds),
      select: { id: true, balance: true },
    }),
    // Per student, not grouped: the debt list needs each one's current-month part.
    prisma.student.findMany({
      where: {
        ...debtorBase(companyId, opts.branchIds),
        NOT: activeStudentWhere(),
      },
      select: { id: true, balance: true, status: true },
    }),
  ]);
  const ids = [...studying, ...notStudying].map((s) => s.id);
  const charges =
    ids.length === 0
      ? []
      : await prisma.enrollmentMonthlyCharge.groupBy({
          by: ['studentId'],
          where: {
            companyId,
            studentId: { in: ids },
            periodYear: y,
            periodMonth: m,
            status: MonthlyChargeStatus.CHARGED,
          },
          _sum: { chargedAmount: true },
        });
  const rows = debtRows({
    studying,
    notStudying,
    chargedThisMonth: new Map(
      charges.map((c) => [c.studentId, c._sum.chargedAmount ?? 0]),
    ),
  });
  return { rows, split: sumDebtRows(rows) };
}

export async function loadDebtSplit(
  prisma: DebtSplitDb,
  companyId: number,
  opts: { branchIds: ReportBranchIds; month?: string },
): Promise<DebtSplit> {
  return (await loadDebtRows(prisma, companyId, opts)).split;
}
