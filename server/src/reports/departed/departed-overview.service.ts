import { ForbiddenException, Injectable } from '@nestjs/common';
import { tashkentMonthRangeUtc } from '../../common/date/tashkent';
import {
  isEmptyScope,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { DEPARTURE_GRACE_DAYS } from '../../students/shared/departure-episodes';
import { loadTeacherChangeDepartures } from '../shared/teacher-change-departures';
import { aggregateOverview } from './departed-aggregate';
import {
  monthKeysEndingAt,
  parseDayRange,
  previousRange,
} from './departed-period';
import type { DepartedOverview } from './departed.types';
import {
  applyFilter,
  loadDepartureFacts,
  type FactSets,
} from './departure-facts.loader';
import type { DepartedFilterDto } from './dto/departed-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS_SHOWN = 6;

/** An empty scope is refused, never served as zeros (ADR-0002). */
export function assertDepartedScope(scope: ReportBranchIds) {
  if (isEmptyScope(scope)) {
    throw new ForbiddenException(
      "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
    );
  }
}

/** «Ketgan o'quvchilar» — the page's top part (spec B7a §4). */
@Injectable()
export class DepartedOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(
    companyId: number,
    scope: ReportBranchIds,
    q: DepartedFilterDto,
  ): Promise<DepartedOverview> {
    return (await this.overviewWithFacts(companyId, scope, q)).overview;
  }

  /** The overview and the filtered facts it was built from (the Excel «Xulosa» sheet reads both). */
  async overviewWithFacts(
    companyId: number,
    scope: ReportBranchIds,
    q: DepartedFilterDto,
  ): Promise<{ overview: DepartedOverview; facts: FactSets }> {
    assertDepartedScope(scope);
    const range = parseDayRange(q.startDate, q.endDate);
    const prev = previousRange({ startDate: q.startDate, endDate: q.endDate });
    const prevRange = parseDayRange(prev.startDate, prev.endDate);
    const now = new Date();
    const maxGrace = Math.max(...Object.values(DEPARTURE_GRACE_DAYS));
    const months = monthKeysEndingAt(q.endDate, MONTHS_SHOWN).map((key) => {
      const m = tashkentMonthRangeUtc(key);
      return {
        key,
        gte: m.gte,
        lt: m.lt,
        // A month that closed less than the longest grace ago can still grow.
        provisional: m.lt.getTime() > now.getTime() - maxGrace * DAY_MS,
      };
    });

    const sets = await loadDepartureFacts(this.prisma, companyId, scope, {
      range,
      previous: prevRange,
      months,
      withStartMembers: true,
      withPendingToday: true,
      now,
    });
    const filter = { courseIds: q.courseId, teacherIds: q.teacherIds };
    const f = applyFilter(sets, filter);
    const agg = aggregateOverview({
      current: f.current,
      previous: f.previous,
      months: f.months,
      pendingToday: f.pendingToday,
      startMembers: f.startMembers,
    });
    const tc = await loadTeacherChangeDepartures(this.prisma, companyId, {
      scope,
      start: range.gte,
      end: range.lt,
      groupFilter: filter,
    });

    return {
      overview: {
        range: { startDate: q.startDate, endDate: q.endDate },
        previous: prev,
        ...agg,
        teacherChange: {
          totalTeacherChanges: tc.changes.length,
          departedAfterTeacherChange: tc.departures.length,
        },
        graceDays: sets.graceDays,
      },
      facts: f,
    };
  }

  /**
   * Average months studied by those who left in `range`; no filter, so the
   * marketing page reads the same number as this page's card. 0 when nobody
   * left or no one's study length is known.
   */
  async averageStudyMonths(
    companyId: number,
    scope: ReportBranchIds,
    range: { startDate: string; endDate: string },
  ): Promise<number> {
    assertDepartedScope(scope);
    const sets = await loadDepartureFacts(this.prisma, companyId, scope, {
      range: parseDayRange(range.startDate, range.endDate),
    });
    return (
      aggregateOverview({
        current: sets.current,
        previous: [],
        months: [],
        pendingToday: [],
        startMembers: [],
      }).cards.avgStudyMonths ?? 0
    );
  }
}
