import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  branchIdWhere,
  isEmptyScope,
  singleBranchId,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { tashkentDateStr } from '../attendance/shared/date-utils';

type SnapshotDay = {
  date: Date;
  expectedValue: number | null;
  lessonsHeldValue: number | null;
  collectedForMonth: number | null;
};

/** A branch's lifetime, in the terms the cron itself uses to decide whether
 * to write that branch's row on a given day. */
export interface BranchLifetime {
  branchId: number;
  createdAt: Date;
  deletedAt: Date | null;
}

/**
 * Whether the cron would have written `branchId`'s row on Tashkent day `day`
 * ('YYYY-MM-DD', the same key the snapshot rows use): the cron's 23:40 run
 * writes a branch's row only when that branch existed and was not yet
 * deleted at that moment. A branch created mid-month is not expected before
 * its creation day; one soft-deleted mid-month is not expected from its
 * deletion day on.
 */
function isBranchExpectedOnDay(
  lifetimes: BranchLifetime[],
  branchId: number,
  day: string,
): boolean {
  const lt = lifetimes.find((l) => l.branchId === branchId);
  if (!lt) return false;
  if (tashkentDateStr(lt.createdAt) > day) return false;
  if (lt.deletedAt && tashkentDateStr(lt.deletedAt) <= day) return false;
  return true;
}

/**
 * Per-branch rows → one row per day, summed (each lesson, group and payment
 * has one branch, so the figures add). A day is kept only when every branch
 * EXPECTED that day — per its own lifetime, not merely "seen somewhere this
 * month" — has its row: the cron writes each branch separately and one can
 * fail, and a sum missing an expected branch would plot a drop that never
 * happened. "Seen this month" was the wrong test — a branch created or
 * deleted mid-month would blank out every day outside its own lifetime, where
 * it was never expected to have a row in the first place. Gaps stay gaps; a
 * null in any present branch nulls the sum.
 */
function sumBranchRowsPerDay(
  rows: (SnapshotDay & { branchId: number | null })[],
  lifetimes: BranchLifetime[],
): SnapshotDay[] {
  type Row = SnapshotDay & { branchId: number | null };
  const byDay = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }
  const total = (list: Row[], f: Exclude<keyof SnapshotDay, 'date'>) =>
    list.some((r) => r[f] == null)
      ? null
      : list.reduce((s, r) => s + (r[f] ?? 0), 0);
  const out: SnapshotDay[] = [];
  // Rows arrive date-ascending; a Map keeps insertion order.
  for (const [day, list] of byDay.entries()) {
    const expected = lifetimes
      .filter((l) => isBranchExpectedOnDay(lifetimes, l.branchId, day))
      .map((l) => l.branchId);
    if (expected.length === 0) continue;
    const present = new Set(list.map((r) => r.branchId));
    if (!expected.every((id) => present.has(id))) continue;
    out.push({
      date: list[0].date,
      expectedValue: total(list, 'expectedValue'),
      lessonsHeldValue: total(list, 'lessonsHeldValue'),
      collectedForMonth: total(list, 'collectedForMonth'),
    });
  }
  return out;
}

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

    const start = new Date(Date.UTC(y, m - 1, 1));
    const endExcl = new Date(Date.UTC(y, m, 1));

    // `null` = the company-wide row. A branch list reads each branch's OWN
    // rows and sums them — the company row would show every branch (ADR-0002).
    const rows = await this.prisma.dailyFinancialSnapshot.findMany({
      where: {
        companyId,
        ...(branchIds === null ? { branchId: null } : branchIdWhere(branchIds)),
        // `date` is `@db.Date` — unshifted UTC bounds, upper exclusive.
        date: { gte: start, lt: endExcl },
      },
      orderBy: { date: 'asc' },
      select: {
        branchId: true,
        date: true,
        expectedValue: true,
        lessonsHeldValue: true,
        collectedForMonth: true,
      },
    });
    let days: SnapshotDay[] = rows;
    if (branchIds !== null) {
      // Do NOT filter `deletedAt` — a deleted branch still bounds its own
      // lifetime, and excluding it would make it look expected forever.
      const branches = await this.prisma.branch.findMany({
        where: { companyId, id: { in: branchIds } },
        select: { id: true, createdAt: true, deletedAt: true },
      });
      const lifetimes: BranchLifetime[] = branches.map((b) => ({
        branchId: b.id,
        createdAt: b.createdAt,
        deletedAt: b.deletedAt,
      }));
      days = sumBranchRowsPerDay(rows, lifetimes);
    }

    const eventsByDay = await this.loadEvents(
      companyId,
      branchIds,
      start,
      endExcl,
    );

    let prev: number | null = null;
    const points = days.map((r) => {
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

    return { month, branchId: singleBranchId(branchIds) ?? null, points };
  }

  /**
   * The three things that actually move the projection, counted per Tashkent
   * day. Everything here is read from records the system already keeps — none
   * of it is inferred from the figure itself, so a step with no explanation
   * stays unexplained rather than acquiring a plausible-sounding one.
   */
  private async loadEvents(
    companyId: number,
    branchIds: ReportBranchIds,
    start: Date,
    endExcl: Date,
  ): Promise<Map<string, ExpectationDayEvent[]>> {
    const groupWhere = { companyId, ...branchIdWhere(branchIds) };
    // EntityHistory has no branch column: a group's status change is matched
    // through the ids of the groups in scope. Deleted groups stay in — their
    // status change still happened.
    const groupIdFilter =
      branchIds === null
        ? {}
        : {
            entityId: {
              in: (
                await this.prisma.group.findMany({
                  where: groupWhere,
                  select: { id: true },
                })
              ).map((g) => g.id),
            },
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
          ...groupIdFilter,
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
      const status = (g.newValues as { statusEnum?: string } | null)
        ?.statusEnum;
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
