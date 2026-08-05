import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  isEmptyScope,
  singleBranchId,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { tashkentDateStr } from '../attendance/shared/date-utils';

/**
 * What happened on a day, so a step in the line can be explained rather than
 * just observed. Only counts — never a guess: a day with no matching event
 * carries an empty list, and the chart says nothing rather than inventing a
 * reason.
 */
export interface ExpectationDayEvent {
  kind: 'joined' | 'left' | 'groupStopped' | 'holiday';
  count: number;
}

export interface ExpectationHistoryPoint {
  /** Tashkent `YYYY-MM-DD`. */
  date: string;
  /** Day of month, for a compact axis. */
  day: number;
  expectedValue: number | null;
  lessonsHeldValue: number | null;
  collectedForMonth: number | null;
  /** Derived, never stored — see `DailySnapshotService`. */
  collectionPct: number | null;
  /** Change from the previous recorded day; null on the first point. */
  delta: number | null;
  events: ExpectationDayEvent[];
}

/**
 * Reads back the daily snapshot for one month: how «Oy oxiriga kutilyapti»,
 * the month's lesson value and its collected cash moved day by day.
 *
 * Read-only and snapshot-only. It deliberately does NOT recompute a missing
 * day: the whole point of the record is "this is what we actually saw then",
 * and a day reconstructed from today's roster would be a different claim
 * wearing the same shape. Gaps stay gaps.
 */
@Injectable()
export class ReportsExpectationHistoryService {
  constructor(private prisma: PrismaService) {}

  async getMonthlyHistory(
    companyId: number,
    { month, branchIds }: { month: string; branchIds: ReportBranchIds },
  ): Promise<{
    month: string;
    branchId: number | null;
    points: ExpectationHistoryPoint[];
  }> {
    // A confined caller with no branch sees nothing, never the company.
    if (isEmptyScope(branchIds)) {
      return { month, branchId: null, points: [] };
    }
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return { month, branchId: null, points: [] };

    // `null` scope = the company-wide row; one picked branch = that branch's.
    // A multi-branch scope has no single row to read, so it falls back to the
    // company-wide series rather than silently summing rows that were written
    // for different scopes.
    const branchId = singleBranchId(branchIds) ?? null;

    // `date` is `@db.Date` — unshifted UTC bounds, upper exclusive.
    const rows = await this.prisma.dailyFinancialSnapshot.findMany({
      where: {
        companyId,
        branchId,
        date: {
          gte: new Date(Date.UTC(y, m - 1, 1)),
          lt: new Date(Date.UTC(y, m, 1)),
        },
      },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        expectedValue: true,
        lessonsHeldValue: true,
        collectedForMonth: true,
      },
    });

    const eventsByDay = await this.loadEvents(
      companyId,
      branchId,
      new Date(Date.UTC(y, m - 1, 1)),
      new Date(Date.UTC(y, m, 1)),
    );

    let prev: number | null = null;
    const points = rows.map((r) => {
      const held = r.lessonsHeldValue;
      const collected = r.collectedForMonth;
      const dateStr = r.date.toISOString().slice(0, 10);
      const delta =
        prev != null && r.expectedValue != null ? r.expectedValue - prev : null;
      if (r.expectedValue != null) prev = r.expectedValue;
      return {
        date: dateStr,
        day: r.date.getUTCDate(),
        expectedValue: r.expectedValue,
        lessonsHeldValue: held,
        collectedForMonth: collected,
        collectionPct:
          held != null && collected != null && held > 0
            ? Math.round((collected / held) * 100)
            : null,
        delta,
        events: eventsByDay.get(dateStr) ?? [],
      };
    });

    return { month, branchId, points };
  }

  /**
   * The three things that actually move the projection, counted per Tashkent
   * day. Everything here is read from records the system already keeps — none
   * of it is inferred from the figure itself, so a step with no explanation
   * stays unexplained rather than acquiring a plausible-sounding one.
   */
  private async loadEvents(
    companyId: number,
    branchId: number | null,
    start: Date,
    endExcl: Date,
  ): Promise<Map<string, ExpectationDayEvent[]>> {
    const groupWhere = {
      companyId,
      ...(branchId !== null && { branchId }),
    };

    const [transitions, groupChanges, holidays] = await Promise.all([
      // Enrollment in/out — the dominant cause. No companyId on the log itself,
      // so it is reached through the enrolment's group.
      this.prisma.enrollmentStateLog.findMany({
        where: {
          transitionAt: { gte: start, lt: endExcl },
          enrollment: { group: groupWhere },
        },
        select: { status: true, transitionAt: true },
      }),
      // A group leaving ACTIVE removes every remaining lesson it had scheduled
      // — the single largest one-day step this chart can show.
      this.prisma.entityHistory.findMany({
        where: {
          companyId,
          entityType: 'Group',
          action: 'STATUS_CHANGE',
          createdAt: { gte: start, lt: endExcl },
        },
        select: { createdAt: true, newValues: true },
      }),
      // A holiday CREATED mid-month deletes future lesson days; its own date
      // range is irrelevant to WHEN the figure moved, so the creation
      // timestamp is what matters — and `Holiday` has no `createdAt`, so it
      // comes from the audit log instead.
      //
      // Not branch-filtered: the history row carries no branch, and holidays
      // are company-wide in practice. A branch-scoped chart may therefore show
      // a holiday marker that did not move ITS line. Rare, and better than
      // dropping the most common cause of a mid-month step.
      this.prisma.entityHistory.findMany({
        where: {
          companyId,
          entityType: 'Holiday',
          action: 'CREATE',
          createdAt: { gte: start, lt: endExcl },
        },
        select: { createdAt: true },
      }),
    ]);

    const byDay = new Map<string, Map<ExpectationDayEvent['kind'], number>>();
    const bump = (at: Date, kind: ExpectationDayEvent['kind']) => {
      const key = tashkentDateStr(at);
      const inner = byDay.get(key) ?? new Map();
      inner.set(kind, (inner.get(kind) ?? 0) + 1);
      byDay.set(key, inner);
    };

    for (const t of transitions) {
      if (t.status === 'ACTIVE') bump(t.transitionAt, 'joined');
      else if (t.status === 'DROPPED' || t.status === 'TRANSFERRED') {
        bump(t.transitionAt, 'left');
      }
    }
    for (const g of groupChanges) {
      const status = (g.newValues as { statusEnum?: string } | null)?.statusEnum;
      // Only a move AWAY from ACTIVE removes future lessons.
      if (status && status !== 'ACTIVE') bump(g.createdAt, 'groupStopped');
    }
    for (const h of holidays) bump(h.createdAt, 'holiday');

    const out = new Map<string, ExpectationDayEvent[]>();
    for (const [day, inner] of byDay) {
      out.set(
        day,
        [...inner.entries()].map(([kind, count]) => ({ kind, count })),
      );
    }
    return out;
  }
}
