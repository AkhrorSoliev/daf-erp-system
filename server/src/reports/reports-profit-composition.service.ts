import { Injectable } from '@nestjs/common';
import { MonthlyChargeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';
import {
  branchIdWhere,
  isEmptyScope,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { isTopUpMonth } from '../salary/shared/topup';
import {
  missingRecurringExpenses,
  monthStatus,
  remainingChargedLessons,
  topWithRest,
  unpaidLeftLessons,
  type ExpenseRow,
  type MissingRecurringExpense,
  type MonthStatus,
} from './profit-composition';

/** Named rows shown under a line; `rest` sums whatever did not fit. */
interface NamedRows {
  rows: { name: string; detail?: string | null; amount: number }[];
  rest: { count: number; amount: number };
}

export interface ProfitComposition {
  month: string;
  status: MonthStatus;
  /** === the Foyda card: both come out of `assembleMonthlyNetProfit`. */
  netProfit: number;
  /** `cash` when a leg had no computed figure and fell back to cash paid. */
  teacherSalaryBasis: 'hisoblangan' | 'naqd';
  staffSalaryBasis: 'hisoblangan' | 'naqd';
  revenue: {
    total: number;
    studentCount: number;
    byCourse: NamedRows;
    /** Only when the scope spans more than one branch. */
    byBranch: { id: number; name: string; amount: number }[];
  };
  teachers: { total: number; count: number; advances: number } & NamedRows;
  staff: { total: number; count: number } & NamedRows;
  expenses: {
    total: number;
    categories: {
      category: string;
      amount: number;
      items: { description: string; amount: number }[];
    }[];
  };
  refunds: number;
  /** A running month only: what the month is on course to close at. */
  forecast: {
    expectedNetProfit: number;
    remainingLessons: { count: number; value: number };
    remainingTeacherPay: number;
    missingExpenses: MissingRecurringExpense[];
  } | null;
  /** Revenue counted this month that sits with students who left owing it. */
  unpaidLeft: { students: number; lessons: number; amount: number } | null;
  /** Branches with lessons this month but no expense recorded. */
  branchesWithoutExpenses: { id: number; name: string }[];
}

const TOP_TEACHERS = 6;
const TOP_COURSES = 6;
const TOP_ITEMS = 4;

/**
 * «Foyda tarkibi» — what the Foyda card's figure is made of, and what the
 * month is on course to close at. Every total here comes from
 * `ReportsService.assembleMonthlyNetProfit`, the same call behind the card, so
 * the breakdown cannot add up to a different number. The extra queries only
 * EXPLAIN (expense items, remaining lessons, who left owing money); none of
 * them changes the figure.
 */
@Injectable()
export class ReportsProfitCompositionService {
  constructor(
    private prisma: PrismaService,
    private reports: ReportsService,
  ) {}

  async getProfitComposition(
    companyId: number,
    {
      month,
      branchIds,
      performedById,
      now = new Date(),
    }: {
      month: string;
      branchIds: ReportBranchIds;
      performedById: number;
      now?: Date;
    },
  ): Promise<ProfitComposition> {
    const status = monthStatus(month, now);
    if (isEmptyScope(branchIds)) return emptyComposition(month, status);

    const inputs = await this.reports.assembleMonthlyNetProfit(companyId, {
      month,
      branchIds,
      performedById,
    });
    const np = inputs.netProfit;
    const lessons = inputs.lessons;

    const monthStart = utcMidnightFromDateStr(`${month}-01`);
    const nextMonthStart = utcMidnightFromDateStr(`${addMonths(month, 1)}-01`);
    const prevMonthStart = utcMidnightFromDateStr(`${addMonths(month, -1)}-01`);

    const [branches, expenses, prevExpenses, charges, studying] =
      await Promise.all([
        this.prisma.branch.findMany({
          where: { companyId },
          select: { id: true, name: true },
        }),
        this.loadExpenses(companyId, branchIds, monthStart, nextMonthStart),
        status.isOpen
          ? this.loadExpenses(companyId, branchIds, prevMonthStart, monthStart)
          : Promise.resolve([]),
        status.isOpen
          ? this.prisma.enrollmentMonthlyCharge.findMany({
              where: {
                companyId,
                status: MonthlyChargeStatus.CHARGED,
                periodYear: Number(month.slice(0, 4)),
                periodMonth: Number(month.slice(5, 7)),
                ...branchIdWhere(branchIds),
              },
              select: {
                studentId: true,
                groupId: true,
                perLessonCost: true,
                coveredDates: true,
                frozenOutDates: true,
              },
            })
          : Promise.resolve([]),
        this.loadStudyingStudents(lessons),
      ]);
    const branchName = new Map(branches.map((b) => [b.id, b.name]));

    // ── Revenue ───────────────────────────────────────────────────────
    const valued = lessons.filter((l) => l.value > 0);
    const byCourseMap = new Map<string, number>();
    const byBranchMap = new Map<number, number>();
    for (const l of valued) {
      const course = l.courseName ?? '—';
      byCourseMap.set(course, (byCourseMap.get(course) ?? 0) + l.value);
      if (l.branchId != null) {
        byBranchMap.set(
          l.branchId,
          (byBranchMap.get(l.branchId) ?? 0) + l.value,
        );
      }
    }
    const courses = topWithRest(
      [...byCourseMap].map(([name, amount]) => ({ name, amount })),
      TOP_COURSES,
    );

    // ── Teachers ──────────────────────────────────────────────────────
    const teacherComputed = np.teacherSalaryBasis === 'hisoblangan';
    const topUp = isTopUpMonth(month);
    const teacherRows = teacherComputed
      ? (inputs.salaries.data ?? [])
          .map((r: any) => ({
            name: fullName(r.user),
            amount: (topUp ? r.fullDeserved : r.covered) ?? 0,
          }))
          .filter((r) => r.amount > 0)
      : [];
    const teachers = topWithRest(teacherRows, TOP_TEACHERS);

    // ── Staff ─────────────────────────────────────────────────────────
    const staffComputed = np.adminSalaryBasis === 'hisoblangan';
    const staffRows = staffComputed
      ? (inputs.salaries.staff ?? [])
          .map((s: any) => ({
            name: fullName(s.user),
            detail: s.user?.position ?? null,
            amount: s.monthly ?? 0,
          }))
          .filter((s) => s.amount > 0)
      : [];

    // ── Expenses ──────────────────────────────────────────────────────
    const categories = groupExpenses(expenses);

    // ── Forecast (running month only) ─────────────────────────────────
    let forecast: ProfitComposition['forecast'] = null;
    if (status.isOpen) {
      const heldToday = new Set(
        lessons
          .filter((l) => l.dateStr === status.todayStr)
          .map((l) => `${l.studentId}|${l.groupId}`),
      );
      const remaining = remainingChargedLessons(
        charges,
        status.todayStr,
        heldToday,
      );
      // The teacher's share of what is still to come, at the share this
      // month's lessons have paid so far — an estimate, labelled as one.
      const teacherShare = np.revenue > 0 ? np.teacherSalary / np.revenue : 0;
      const remainingTeacherPay = Math.round(remaining.value * teacherShare);
      const missingExpenses = missingRecurringExpenses(prevExpenses, expenses);
      forecast = {
        expectedNetProfit:
          np.netProfit +
          remaining.value -
          remainingTeacherPay -
          missingExpenses.reduce((s, e) => s + e.amount, 0),
        remainingLessons: remaining,
        remainingTeacherPay,
        missingExpenses,
      };
    }

    // ── Who left owing this month's lessons ───────────────────────────
    const leftStudentIds = [
      ...new Set(
        valued
          .filter((l) => !studying.has(l.studentId))
          .map((l) => l.studentId),
      ),
    ];
    const debtors = leftStudentIds.length
      ? await this.prisma.student.findMany({
          where: { id: { in: leftStudentIds }, balance: { lt: 0 } },
          select: { id: true, balance: true },
        })
      : [];
    const unpaid = unpaidLeftLessons(
      valued,
      studying,
      new Map(debtors.map((d) => [d.id, -d.balance])),
    );

    // ── Branches that recorded no expense ─────────────────────────────
    const spentBranches = new Set(expenses.map((e) => e.branchId));
    const multiBranch = branchIds === null || branchIds.length > 1;
    const branchesWithoutExpenses = multiBranch
      ? [...byBranchMap.keys()]
          .filter((id) => !spentBranches.has(id))
          .map((id) => ({ id, name: branchName.get(id) ?? `#${id}` }))
      : [];

    return {
      month,
      status,
      netProfit: np.netProfit,
      teacherSalaryBasis: np.teacherSalaryBasis,
      staffSalaryBasis: np.adminSalaryBasis,
      revenue: {
        total: np.revenue,
        studentCount: new Set(valued.map((l) => l.studentId)).size,
        byCourse: {
          rows: courses.top.map((c) => ({ name: c.name, amount: c.amount })),
          rest: courses.rest,
        },
        byBranch: multiBranch
          ? [...byBranchMap]
              .map(([id, amount]) => ({
                id,
                name: branchName.get(id) ?? `#${id}`,
                amount,
              }))
              .sort((a, b) => b.amount - a.amount)
          : [],
      },
      teachers: {
        total: np.teacherSalary,
        count: teacherRows.length,
        advances: inputs.salaries.totals?.advances ?? 0,
        rows: teachers.top.map((t) => ({ name: t.name, amount: t.amount })),
        rest: teachers.rest,
      },
      staff: {
        total: np.adminSalary,
        count: staffRows.length,
        rows: staffRows.sort((a, b) => b.amount - a.amount),
        rest: { count: 0, amount: 0 },
      },
      expenses: { total: np.operatingExpenses, categories },
      refunds: np.refunds,
      forecast,
      unpaidLeft: unpaid.students > 0 ? unpaid : null,
      branchesWithoutExpenses,
    };
  }

  /** Non-advance expenses in [from, to) — the set `getProfitLoss` sums. */
  private async loadExpenses(
    companyId: number,
    branchIds: ReportBranchIds,
    from: Date,
    to: Date,
  ): Promise<(ExpenseRow & { branchId: number })[]> {
    const rows = await this.prisma.expense.findMany({
      where: {
        companyId,
        deletedAt: null,
        category: { not: 'TEACHER_ADVANCE' },
        date: { gte: from, lt: to },
        ...branchIdWhere(branchIds),
      },
      select: {
        category: true,
        description: true,
        amount: true,
        date: true,
        branchId: true,
      },
    });
    return rows.map((r) => ({
      category: r.category,
      description: r.description,
      amount: r.amount,
      dateStr: tashkentDateStr(r.date),
      branchId: r.branchId,
    }));
  }

  /** Students among the month's lessons who still study somewhere. */
  private async loadStudyingStudents(
    lessons: { studentId: number }[],
  ): Promise<Set<number>> {
    if (!lessons.length) return new Set();
    const rows = await this.prisma.enrollment.findMany({
      where: {
        status: 'ACTIVE',
        studentId: { in: [...new Set(lessons.map((l) => l.studentId))] },
      },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    return new Set(rows.map((r) => r.studentId));
  }
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function fullName(user: { firstName?: string; lastName?: string } | null) {
  return `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || '—';
}

function groupExpenses(
  expenses: ExpenseRow[],
): ProfitComposition['expenses']['categories'] {
  const byCategory = new Map<string, ExpenseRow[]>();
  for (const e of expenses) {
    const list = byCategory.get(e.category) ?? [];
    list.push(e);
    byCategory.set(e.category, list);
  }
  return [...byCategory]
    .map(([category, rows]) => ({
      category,
      amount: rows.reduce((s, r) => s + r.amount, 0),
      items: [...rows]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, TOP_ITEMS)
        .map((r) => ({ description: r.description ?? '', amount: r.amount })),
    }))
    .sort((a, b) => b.amount - a.amount);
}

function emptyComposition(
  month: string,
  status: MonthStatus,
): ProfitComposition {
  const none = { rows: [], rest: { count: 0, amount: 0 } };
  return {
    month,
    status,
    netProfit: 0,
    teacherSalaryBasis: 'hisoblangan',
    staffSalaryBasis: 'hisoblangan',
    revenue: { total: 0, studentCount: 0, byCourse: none, byBranch: [] },
    teachers: { total: 0, count: 0, advances: 0, ...none },
    staff: { total: 0, count: 0, ...none },
    expenses: { total: 0, categories: [] },
    refunds: 0,
    forecast: null,
    unpaidLeft: null,
    branchesWithoutExpenses: [],
  };
}
