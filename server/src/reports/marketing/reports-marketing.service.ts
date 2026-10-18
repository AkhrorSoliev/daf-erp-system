import { Injectable } from '@nestjs/common';
import { ExpenseCategory, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  branchIdWhere,
  studentBranchWhere,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
  tashkentMonthKey,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import { DEBT_FLOOR_MONTH, enumerateMonths } from '../debt-history.util';
import { isMonthlyBillingMonth } from '../month-charges';
import { ReportsFinancialService } from '../reports-financial.service';
import { DepartedOverviewService } from '../departed/departed-overview.service';
import { ReportsLeadFunnelService } from '../lead-funnel/reports-lead-funnel.service';
import { FUNNEL_START_DATE } from '../lead-funnel/lead-funnel.math';
import {
  lifetimeValue,
  marketingMonths,
  sourceRows,
  type FirstPayment,
} from './marketing.math';

/**
 * «Marketing» (spec B1 §3, ADR-0067): one month's spend, new students and
 * what they paid, the months before it back to the reporting floor, and the
 * lead-source cohort. Every figure comes from its single source — first
 * payments and spend read here once, the month charge from `getMonthCharges`,
 * the study months from `DepartedOverviewService.averageStudyMonths`, the sources from the
 * lead funnel's own cohort — and the arithmetic is `marketing.math.ts`.
 */
@Injectable()
export class ReportsMarketingService {
  constructor(
    private prisma: PrismaService,
    private financial: ReportsFinancialService,
    private departed: DepartedOverviewService,
    private leadFunnel: ReportsLeadFunnelService,
  ) {}

  async getMarketing(
    companyId: number,
    opts: { month?: string; branchIds: ReportBranchIds },
  ) {
    const { branchIds } = opts;
    const current = tashkentMonthKey(new Date());
    const asked = opts.month ?? current;
    const month =
      asked > current
        ? current
        : asked < DEBT_FLOOR_MONTH
          ? DEBT_FLOOR_MONTH
          : asked;
    const startDate = `${month}-01`;
    const endDate = addDaysToDateStr(`${addMonthsToMonthKey(month, 1)}-01`, -1);

    const [firstPayments, expenses, avgStudyMonths, charges, sources] =
      await Promise.all([
        // Every candidate student's FIRST completed payment and everything
        // paid since. A candidate is a live card in scope with at least one
        // enrollment — a mock-only payer has none. REVERSED never counts.
        this.prisma.payment.groupBy({
          by: ['studentId'],
          where: {
            companyId,
            status: PaymentStatus.COMPLETED,
            student: {
              deletedAt: null,
              enrollments: { some: { deletedAt: null } },
              ...studentBranchWhere(branchIds),
            },
          },
          _min: { createdAt: true },
          _sum: { amount: true },
        }),
        // MARKETING spend from the floor to the asked month. `Expense.date` is
        // `@db.Date`: plain calendar dates, the next month exclusive.
        this.prisma.expense.findMany({
          where: {
            companyId,
            deletedAt: null,
            category: ExpenseCategory.MARKETING,
            date: {
              gte: utcMidnightFromDateStr(`${DEBT_FLOOR_MONTH}-01`),
              lt: utcMidnightFromDateStr(`${addMonthsToMonthKey(month, 1)}-01`),
            },
            ...branchIdWhere(branchIds),
          },
          select: {
            date: true,
            amount: true,
            leadSource: { select: { name: true } },
          },
        }),
        this.departed.averageStudyMonths(companyId, branchIds, {
          startDate,
          endDate,
        }),
        isMonthlyBillingMonth(month)
          ? this.financial.getMonthCharges(companyId, { month, branchIds })
          : Promise.resolve(null),
        // Lead sources are written from 10.09.2026: an earlier month has none.
        endDate < FUNNEL_START_DATE
          ? Promise.resolve(null)
          : this.leadFunnel.getSourceBreakdown(
              companyId,
              { startDate, endDate },
              branchIds,
            ),
      ]);

    const spendByMonth = new Map<string, number>();
    // The asked month's spend by the channel it names (ADR-0109).
    // ponytail: joined to the lead cohort by source NAME; give the funnel the
    // source id if two live sources ever share a name.
    const spendBySource = new Map<string, number>();
    for (const e of expenses) {
      // A calendar date stored at UTC midnight: its Tashkent day is the same date.
      const key = tashkentMonthKey(e.date);
      spendByMonth.set(key, (spendByMonth.get(key) ?? 0) + e.amount);
      if (key === month && e.leadSource) {
        const name = e.leadSource.name;
        spendBySource.set(name, (spendBySource.get(name) ?? 0) + e.amount);
      }
    }
    const firsts: FirstPayment[] = firstPayments.flatMap((r) =>
      r._min.createdAt
        ? [
            {
              firstMonth: tashkentMonthKey(r._min.createdAt),
              paid: r._sum.amount ?? 0,
            },
          ]
        : [],
    );
    const months = marketingMonths({
      months: enumerateMonths(DEBT_FLOOR_MONTH, month).reverse(),
      spendByMonth,
      firstPayments: firsts,
    });

    // What the lead cohort's paying people have paid so far. Not branch-scoped
    // on purpose: the ids come from the cohort, which the funnel already scoped.
    const cohortIds = [
      ...new Set((sources ?? []).flatMap((s) => s.studentIds)),
    ];
    const paidByStudent = new Map<number, number>();
    if (cohortIds.length > 0) {
      const paidRows = await this.prisma.payment.groupBy({
        by: ['studentId'],
        where: {
          companyId,
          status: PaymentStatus.COMPLETED,
          studentId: { in: cohortIds },
        },
        _sum: { amount: true },
      });
      for (const r of paidRows) {
        paidByStudent.set(r.studentId, r._sum.amount ?? 0);
      }
    }
    const bySource = sources
      ? sourceRows({
          sources,
          spendBySource,
          paidByStudent,
          monthSpend: months[0].spend,
        })
      : null;

    return {
      ...months[0],
      ltv: lifetimeValue(avgStudyMonths, charges),
      months,
      sources: bySource?.rows ?? null,
      sourcesTotal: bySource?.total ?? null,
      unassignedSpend: bySource?.unassignedSpend ?? null,
    };
  }
}
