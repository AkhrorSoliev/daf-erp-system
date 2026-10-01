import { MonthlyChargeStatus, Prisma } from '@prisma/client';
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
  };
  notStudying: { total: number; count: number };
}

/** Pure. `shuOy = min(qarz, shu oyning hisoblari)`, `eski = qarz − shuOy`. */
export function splitDebt(input: {
  studying: readonly { id: number; balance: number }[];
  chargedThisMonth: ReadonlyMap<number, number>;
  notStudying: { sum: number | null; count: number };
}): DebtSplit {
  let total = 0;
  let currentMonth = 0;
  for (const s of input.studying) {
    const debt = Math.max(0, -s.balance);
    total += debt;
    currentMonth += Math.min(debt, input.chargedThisMonth.get(s.id) ?? 0);
  }
  return {
    studying: {
      total,
      count: input.studying.length,
      currentMonth,
      older: total - currentMonth,
    },
    notStudying: {
      total: Math.max(0, -(input.notStudying.sum ?? 0)),
      count: input.notStudying.count,
    },
  };
}

type DebtSplitDb = {
  student: Pick<Prisma.TransactionClient['student'], 'findMany' | 'aggregate'>;
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
    prisma.student.aggregate({
      where: {
        ...debtorBase(companyId, opts.branchIds),
        NOT: activeStudentWhere(),
      },
      _sum: { balance: true },
      _count: true,
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
    notStudying: { sum: notStudying._sum.balance, count: notStudying._count },
  });
}
