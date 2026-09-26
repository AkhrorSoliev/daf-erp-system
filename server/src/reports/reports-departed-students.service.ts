import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportBranchIds } from '../common/finance/report-branch-scope';
import {
  addMonthsToMonthKey,
  tashkentMonthKey,
  tashkentMonthRangeUtc,
  tashkentRangeUtc,
} from '../common/date/tashkent';
import {
  departuresInRange,
  openEpisodes,
  pendingInRange,
  type DepartureEpisode,
} from '../students/shared/departure-episodes';
import { loadDepartures } from './shared/departures.loader';
import { loadTeacherChangeDepartures } from './shared/teacher-change-departures';

const DAY_MS = 24 * 60 * 60 * 1000;
const MS_PER_MONTH = DAY_MS * 30.44;
// At most 20 years of bars; bounds the walk against an arbitrary startDate
// when no reporting floor is set.
const MAX_DYNAMICS_MONTHS = 240;

/** The picked Tashkent days as UTC instants; a 400 unless both are real days. */
function reportRange(startDate: string, endDate: string) {
  const range = tashkentRangeUtc(startDate, endDate);
  if (
    !Number.isFinite(range.gte.getTime()) ||
    !Number.isFinite(range.lt.getTime())
  ) {
    throw new BadRequestException("Sana noto'g'ri formatda");
  }
  return range;
}

@Injectable()
export class ReportsDepartedStudentsService {
  constructor(private prisma: PrismaService) {}

  /**
   * KPI cards of /reports/departed-students (ADR-0035). The range decides
   * which departures count; debt and lost revenue describe the students who
   * have not come back, as of today.
   */
  async getDepartedStudentsSummary(
    companyId: number,
    params: { scope: ReportBranchIds; startDate: string; endDate: string },
  ) {
    const range = reportRange(params.startDate, params.endDate);
    const { episodes, activeAtStart, floor, graceDays } = await loadDepartures(
      this.prisma,
      companyId,
      params.scope,
      { activeAt: range.gte },
    );

    const departed = departuresInRange(episodes, range, floor);
    const departedCount = departed.length;
    const pendingCount = pendingInRange(episodes, range, floor).length;
    const churnRate =
      activeAtStart > 0 ? (departedCount / activeAtStart) * 100 : 0;

    const openIds = [
      ...new Set(openEpisodes(episodes).map((e) => e.studentId)),
    ];
    const { totalDebt, debtorCount } = await this.debtOf(openIds);
    const lostRevenue = await this.lostRevenueOf(companyId, openIds);
    const avgDurationMonths = await this.averageStudyMonths(departed);

    const { totalTeacherChanges, departedAfterTeacherChange } =
      await this.getTeacherChangeRetentionMetrics(companyId, {
        scope: params.scope,
        start: range.gte,
        end: range.lt,
      });

    return {
      departedCount,
      churnRate: Math.round(churnRate * 10) / 10,
      activeAtStart,
      pendingCount,
      graceDays,
      lostRevenue,
      totalDebt,
      debtorCount,
      avgDurationMonths: Math.round(avgDurationMonths * 10) / 10,
      totalTeacherChanges,
      departedAfterTeacherChange,
    };
  }

  /**
   * "Ketish dinamikasi" — confirmed departures per Tashkent month of the
   * range. A month reaching into the longest grace period (a freeze's) is
   * provisional: stops started there may still be confirmed.
   */
  async getDepartedStudentsDynamics(
    companyId: number,
    params: { scope: ReportBranchIds; startDate: string; endDate: string },
  ) {
    const now = new Date();
    const range = reportRange(params.startDate, params.endDate);
    const { episodes, floor, graceDays } = await loadDepartures(
      this.prisma,
      companyId,
      params.scope,
      { now },
    );

    const from = new Date(
      Math.max(range.gte.getTime(), floor?.getTime() ?? -Infinity),
    );
    const until = new Date(Math.min(range.lt.getTime() - 1, now.getTime()));
    if (from.getTime() > until.getTime()) return { data: [] };

    const provisionalAfter =
      now.getTime() - Math.max(...Object.values(graceDays)) * DAY_MS;
    const lastKey = tashkentMonthKey(until);
    // 'YYYY-MM' keys compare correctly as strings. Without a reporting floor,
    // `from` comes straight from the caller's `startDate` — an arbitrary old
    // date would otherwise walk one month at a time, synchronously, with no
    // cap.
    const fromKey = tashkentMonthKey(from);
    const oldestAllowedKey = addMonthsToMonthKey(
      lastKey,
      -(MAX_DYNAMICS_MONTHS - 1),
    );
    const firstKey = fromKey > oldestAllowedKey ? fromKey : oldestAllowedKey;
    const data: { date: string; count: number; provisional: boolean }[] = [];
    // Bounded by a step count as well as by the keys.
    let key = firstKey;
    for (
      let step = 0;
      step < MAX_DYNAMICS_MONTHS && key <= lastKey;
      step += 1, key = addMonthsToMonthKey(key, 1)
    ) {
      const month = tashkentMonthRangeUtc(key);
      const bucket = {
        gte: new Date(Math.max(month.gte.getTime(), range.gte.getTime())),
        lt: new Date(Math.min(month.lt.getTime(), range.lt.getTime())),
      };
      data.push({
        date: `${key}-01`,
        count: departuresInRange(episodes, bucket, floor).length,
        provisional: month.lt.getTime() > provisionalAfter,
      });
    }
    return { data };
  }

  private async debtOf(studentIds: number[]) {
    if (studentIds.length === 0) return { totalDebt: 0, debtorCount: 0 };
    const agg = await this.prisma.student.aggregate({
      where: { id: { in: studentIds }, balance: { lt: 0 } },
      _sum: { balance: true },
      _count: { _all: true },
    });
    return { totalDebt: agg._sum.balance ?? 0, debtorCount: agg._count._all };
  }

  /** Unpaid remainder of still-open contracts; stage 2 removes this card. */
  private async lostRevenueOf(companyId: number, studentIds: number[]) {
    if (studentIds.length === 0) return 0;
    const contracts = await this.prisma.contract.findMany({
      where: {
        companyId,
        deletedAt: null,
        studentId: { in: studentIds },
        status: { notIn: ['CANCELLED', 'REFUNDED'] },
      },
      select: { totalAmount: true, paidAmount: true },
    });
    let total = 0;
    for (const c of contracts) {
      const unpaid = c.totalAmount - c.paidAmount;
      if (unpaid > 0) total += unpaid;
    }
    return total;
  }

  /** From each student's very first enrollment to the day they left. */
  private async averageStudyMonths(departed: readonly DepartureEpisode[]) {
    if (departed.length === 0) return 0;
    const firsts = await this.prisma.enrollment.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: departed.map((d) => d.studentId) },
        deletedAt: null,
      },
      _min: { startDate: true, createdAt: true },
    });
    const firstById = new Map(
      firsts.map((f) => [f.studentId, f._min.startDate ?? f._min.createdAt]),
    );
    let sum = 0;
    let count = 0;
    for (const d of departed) {
      const first = firstById.get(d.studentId);
      if (!first) continue;
      const ms = d.startedAt.getTime() - first.getTime();
      if (ms > 0) {
        sum += ms;
        count += 1;
      }
    }
    return count > 0 ? sum / count / MS_PER_MONTH : 0;
  }

  /**
   * Counts teacher changes within the period and how many students "left"
   * within 5 lessons of one. Who left is decided in
   * `loadTeacherChangeDepartures` — the same reader behind the drill-down list
   * (`getDepartedAfterTeacherChangeList`), so the count and the list agree.
   */
  private async getTeacherChangeRetentionMetrics(
    companyId: number,
    // `end` is EXCLUSIVE: 00:00 Tashkent of the day after the range.
    params: { scope: ReportBranchIds; start: Date; end: Date },
  ) {
    const { changes, departures } = await loadTeacherChangeDepartures(
      this.prisma,
      companyId,
      params,
    );
    return {
      totalTeacherChanges: changes.length,
      departedAfterTeacherChange: departures.length,
    };
  }
}
