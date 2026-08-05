import { Injectable } from '@nestjs/common';
import { Prisma, SalaryPaymentStatus, SalaryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveCurrentPeriod } from './shared/resolve-current-period';
import {
  narrowPayrollScope,
  resolvePayrollBranchScope,
} from './shared/payroll-branch-scope';

export interface SalaryOverviewQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  /** 'configured' = has at least one active rate; 'unconfigured' = none. */
  status?: 'all' | 'configured' | 'unconfigured';
  /**
   * The branch picked in the header. It can only ever NARROW — the caller's own
   * payroll scope is the ceiling, and a confined caller naming another branch is
   * refused rather than quietly served their own.
   *
   * Not a DTO field: the controller reads it from `X-Branch-Id` via
   * `@BranchScope()` and spreads it in, exactly as `/salary/monthly` does.
   */
  branchId?: number;
}

/**
 * The empty response, in the SAME shape a populated one has.
 *
 * The refusal path used to return `{ data, total, page, pageSize }` while the
 * "no teachers" path also carried `period` and `pending`. Today's only consumer
 * reads `data`, so nothing broke — but a response whose shape depends on the
 * outcome is a trap for the next one, and the difference showed up exactly on
 * the path a caller hits when they are refused.
 */
function emptyOverview(
  page: number,
  pageSize: number,
  period: Awaited<ReturnType<typeof resolveCurrentPeriod>>,
) {
  return {
    data: [] as never[],
    total: 0,
    page,
    pageSize,
    period,
    pending: {
      calculated: 0,
      approved: 0,
      approvedTotal: 0,
      calculatedIds: [] as string[],
      approvedIds: [] as string[],
    },
  };
}

/**
 * "Ustozlar oyligi" jonli ko'rinishi — har bir ustoz uchun ayni vaqtdagi
 * oylik holati (profildagi summalar bilan bir xil): kutilayotgan oylik, joriy
 * davrda real ishlangan (to'lanmagan accrual), jami berilgan + avans, hozirgi
 * stavka(lar) va oxirgi oylik to'lovi (tasdiqlash/to'lash uchun).
 *
 * Hisob-kitob profildagi `getTeacherSalarySummary` bilan AYNAN bir xil
 * formula bo'yicha — shuning uchun sahifadagi raqam profildagi raqam bilan
 * mos keladi. Ko'p so'rov o'rniga bitta sahifadagi barcha ustozlar uchun
 * to'plamli (bulk) so'rovlar ishlatiladi.
 */
@Injectable()
export class SalaryOverviewService {
  constructor(private prisma: PrismaService) {}

  async getOverview(
    query: SalaryOverviewQuery,
    companyId: number,
    performedById: number,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    // One shared resolver instead of a fifth hand-rolled copy of the same
    // `!CEO && !Administrator` shape. CEO spans every branch; everyone else is
    // confined, and an unknown scope sees NOTHING rather than everything.
    //
    // `narrowPayrollScope` then applies the header selection. Without it this
    // endpoint ignored the branch switcher entirely while `/salary/monthly`
    // honoured it — so a CEO switching to Namangan saw the report change and the
    // ⚙ Sozlamalar rate list keep listing every teacher in the company.
    const scope = await resolvePayrollBranchScope(this.prisma, performedById);
    const { branchId, blocked } = narrowPayrollScope(scope, query.branchId);

    // Resolved before the refusal so every exit from this method returns the
    // SAME shape. The payroll cycle is a company-wide setting, not branch data,
    // so a refused caller learning it discloses nothing.
    const period = await resolveCurrentPeriod(this.prisma, companyId, new Date());

    if (blocked) {
      return emptyOverview(page, pageSize, period);
    }

    const search = query.search?.trim();
    const searchId = search && /^\d+$/.test(search) ? Number(search) : null;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      companyId,
      roles: { some: { role: { name: 'Teacher' } } },
      ...(branchId !== undefined && {
        branches: { some: { branchId } },
      }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          ...(searchId !== null ? [{ id: searchId }] : []),
        ],
      }),
    };

    const teachers = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        isActive: true,
        branches: { select: { branch: { select: { id: true, name: true } } } },
      },
    });

    const ids = teachers.map((t) => t.id);

    if (ids.length === 0) {
      return emptyOverview(page, pageSize, period);
    }

    // ─── Bulk fetches (one query each, keyed by userId) ───────────────────
    const [
      configs,
      groupTeachers,
      earnedAgg,
      paidAgg,
      advancesAgg,
      payments,
    ] = await Promise.all([
      this.prisma.employeeSalaryConfig.findMany({
        where: { userId: { in: ids }, isActive: true, companyId },
        select: {
          id: true,
          userId: true,
          salaryType: true,
          value: true,
          groupId: true,
          group: { select: { id: true, name: true } },
        },
      }),
      this.prisma.groupTeacher.findMany({
        where: {
          teacherId: { in: ids },
          group: { deletedAt: null, statusEnum: 'ACTIVE' },
        },
        select: {
          teacherId: true,
          group: {
            select: {
              id: true,
              exactDays: true,
              course: { select: { price: true, lessonPaymentCount: true } },
              _count: {
                select: {
                  enrollments: { where: { status: 'ACTIVE', deletedAt: null } },
                },
              },
            },
          },
        },
      }),
      // Real ishlangan = to'lanmagan, bekor qilinmagan accruallar yig'indisi
      // (profildagi `actualEarned` bilan bir xil — davr bo'yicha filtrlanmaydi).
      this.prisma.salaryAccrual.groupBy({
        by: ['userId'],
        where: {
          userId: { in: ids },
          companyId,
          salaryPaymentId: null,
          reversedAt: null,
        },
        _sum: { amount: true },
      }),
      this.prisma.salaryPayment.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, companyId, status: 'PAID' },
        _sum: { amount: true },
      }),
      this.prisma.expense.groupBy({
        by: ['relatedUserId'],
        where: {
          relatedUserId: { in: ids },
          category: 'TEACHER_ADVANCE',
          companyId,
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      // Oxirgi to'lov (har ustoz uchun) + pending (tasdiqlash/to'lash) uchun.
      this.prisma.salaryPayment.findMany({
        where: {
          userId: { in: ids },
          companyId,
          status: { not: SalaryPaymentStatus.CANCELLED },
        },
        select: {
          id: true,
          userId: true,
          amount: true,
          status: true,
          periodStart: true,
          periodEnd: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Index bulk results by userId.
    const configsByUser = new Map<number, typeof configs>();
    for (const c of configs) {
      const list = configsByUser.get(c.userId) ?? [];
      list.push(c);
      configsByUser.set(c.userId, list);
    }
    const groupsByUser = new Map<number, typeof groupTeachers>();
    for (const gt of groupTeachers) {
      const list = groupsByUser.get(gt.teacherId) ?? [];
      list.push(gt);
      groupsByUser.set(gt.teacherId, list);
    }
    const earnedByUser = new Map(
      earnedAgg.map((a) => [a.userId, a._sum.amount ?? 0]),
    );
    const paidByUser = new Map(
      paidAgg.map((a) => [a.userId, a._sum.amount ?? 0]),
    );
    const advancesByUser = new Map(
      advancesAgg.map((a) => [a.relatedUserId as number, a._sum.amount ?? 0]),
    );
    // payments are createdAt DESC — first seen per user is the latest.
    const latestByUser = new Map<number, (typeof payments)[number]>();
    for (const p of payments) {
      if (!latestByUser.has(p.userId)) latestByUser.set(p.userId, p);
    }

    const rows = teachers.map((t) => {
      const userConfigs = configsByUser.get(t.id) ?? [];
      const activeStudentCount = this.countActiveStudents(
        groupsByUser.get(t.id) ?? [],
      );
      return {
        user: {
          id: t.id,
          firstName: t.firstName,
          lastName: t.lastName,
          isActive: t.isActive,
          branch: t.branches[0]?.branch ?? null,
        },
        configs: userConfigs.map((c) => ({
          id: c.id,
          salaryType: c.salaryType,
          value: c.value,
          groupId: c.groupId,
          group: c.group,
        })),
        activeStudentCount,
        actualEarned: earnedByUser.get(t.id) ?? 0,
        paidTotal: paidByUser.get(t.id) ?? 0,
        advancesTotal: advancesByUser.get(t.id) ?? 0,
        latestPayment: latestByUser.get(t.id) ?? null,
      };
    });

    // status filter (configured / unconfigured) over the computed rows.
    const filtered =
      query.status === 'configured'
        ? rows.filter((r) => r.configs.length > 0)
        : query.status === 'unconfigured'
          ? rows.filter((r) => r.configs.length === 0)
          : rows;

    // Sort: most "real ishlangan" first, then class size, then name. In-memory
    // pagination — per-company teacher counts are small (tens, not thousands).
    filtered.sort((a, b) => {
      if (b.actualEarned !== a.actualEarned)
        return b.actualEarned - a.actualEarned;
      if (b.activeStudentCount !== a.activeStudentCount)
        return b.activeStudentCount - a.activeStudentCount;
      const fn = a.user.firstName.localeCompare(b.user.firstName);
      return fn !== 0 ? fn : a.user.lastName.localeCompare(b.user.lastName);
    });

    const data = filtered.slice((page - 1) * pageSize, page * pageSize);

    // Pending batch — every CALCULATED / APPROVED payment in scope (not just
    // the current page), so the batch "tasdiqlash / to'lash" bar acts globally.
    const calculatedIds: string[] = [];
    const approvedIds: string[] = [];
    let approvedTotal = 0;
    for (const p of payments) {
      if (p.status === SalaryPaymentStatus.CALCULATED) calculatedIds.push(p.id);
      else if (p.status === SalaryPaymentStatus.APPROVED) {
        approvedIds.push(p.id);
        approvedTotal += p.amount;
      }
    }

    return {
      data,
      total: filtered.length,
      page,
      pageSize,
      period,
      pending: {
        calculated: calculatedIds.length,
        approved: approvedIds.length,
        approvedTotal,
        calculatedIds,
        approvedIds,
      },
    };
  }

  /**
   * How many active students this teacher currently has across their groups —
   * the ⚙ Sozlamalar list's tiebreak, used only for ordering.
   *
   * It replaced a money figure (`expectedMonthly`) that multiplied each group's
   * students by `exactDays.length * 4` — the four-week forecast this codebase
   * has now deleted everywhere. That number was never rendered; it only sorted
   * the list, and ordering does not need a currency amount to be meaningful.
   */
  private countActiveStudents(
    groups: {
      group: { _count: { enrollments: number } };
    }[],
  ): number {
    return groups.reduce((sum, { group }) => sum + group._count.enrollments, 0);
  }
}
