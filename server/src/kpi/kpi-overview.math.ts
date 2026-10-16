import { KpiResultStatus, KpiResultType } from '@prisma/client';
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
  tashkentDateStr,
} from '../common/date/tashkent';
import { KPI_FIRST_MONTH } from './kpi-rules';
import { kpiSignals, monthEndForecast, type KpiSignal } from './kpi-signals';

/**
 * «Xodimlar KPI» from rows already read (spec §7.7, §7.9). Pure: the read
 * service loads, this counts; the page only formats what comes back.
 */

export interface ResultFact {
  userId: number;
  type: KpiResultType;
  status: KpiResultStatus;
  amount: number;
  occurredAt: Date;
  month: string;
}

/** An ownership log row: CLAIM/ASSIGN for its `toUserId`, EXPIRE for its `fromUserId`. */
export interface LogFact {
  userId: number;
  leadId: string;
  at: Date;
}

export interface PromiseFact {
  userId: number;
  status: 'KEPT' | 'BROKEN';
}

export interface OverviewFacts {
  month: string;
  compare: string;
  /** Today ('YYYY-MM-DD', Tashkent) when `month` is the current month, else null. */
  today: string | null;
  /** The compare month began on or after KPI_START, so all of it was recorded. */
  compareRecorded: boolean;
  /** The month's results, every status. */
  monthResults: ResultFact[];
  /** The compare month's ACTIVE results. */
  compareResults: ResultFact[];
  /** ACTIVE results of `monthsFrom(month)`. */
  series: ResultFact[];
  /** Users with an ACTIVE result in the last 7 days. */
  recentUserIds: ReadonlySet<number>;
  /** Leads held now, per owner. */
  held: ReadonlyMap<number, number>;
  received: LogFact[];
  compareReceived: LogFact[];
  /** ACTIVE LEAD_PAID results of the received leads, any month. */
  paidLeads: { userId: number; leadId: string }[];
  expired: LogFact[];
  compareExpired: LogFact[];
  /** Promises written in scope whose day falls in the month, KEPT or BROKEN. */
  promises: PromiseFact[];
  names: ReadonlyMap<number, string>;
  /**
   * Of the people holding leads now or named in this month's logs, those who
   * are administrators now: only they join the table without a result.
   */
  eligibleUsers: ReadonlySet<number>;
  /** The month's working days (current month only), for the forecast. */
  workingDays: readonly string[] | null;
  /** Tashkent day results are written from (`recordingSince`); null = the switch is off. */
  recordingSinceDay: string | null;
}

export interface KpiPair {
  value: number;
  compare: number;
}

export interface KpiAdminRow {
  userId: number;
  name: string;
  leadPaid: { count: number; amount: number; compare: number };
  promiseKept: { count: number; amount: number; compare: number };
  leadToPaid: { paid: number; received: number; pct: number | null };
  promiseRate: { kept: number; closed: number; pct: number | null };
  expired: { count: number; compare: number };
  held: number;
  total: number;
}

export interface OverviewBody {
  cards: {
    results: KpiPair;
    amount: KpiPair;
    leadToPaid: { value: number | null; compare: number | null };
    forecast: number | null;
  };
  signals: KpiSignal[];
  daily: { day: number; current: number | null; compare: number | null }[];
  months: {
    month: string;
    leadPaid: number;
    promiseKept: number;
    amount: number;
  }[];
  rows: KpiAdminRow[];
}

const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part * 100) / whole) : null;
const sum = (list: readonly ResultFact[]) =>
  list.reduce((s, r) => s + r.amount, 0);
const dayOf = (d: Date) => Number(tashkentDateStr(d).slice(8, 10));
const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const pairKey = (l: { userId: number; leadId: string }) =>
  `${l.userId}:${l.leadId}`;

/**
 * Who has an ACTIVE result in the last 7 days (the «Jim» rule's `hasRecentResult`):
 * the 7 Tashkent days ending today, so a result 6 days ago counts and one
 * exactly 7 days ago does not. The read service builds `recentUserIds` with this.
 */
export function recentResultUserIds(
  results: readonly ResultFact[],
  today: string,
): Set<number> {
  const from = addDaysToDateStr(today, -6);
  return new Set(
    results
      .filter(
        (r) =>
          r.status === KpiResultStatus.ACTIVE &&
          tashkentDateStr(r.occurredAt) >= from,
      )
      .map((r) => r.userId),
  );
}

/** «Oylar bo'yicha»: the last six months up to `month`, none before 2026-10. */
export function monthsFrom(month: string): string[] {
  const out: string[] = [];
  for (
    let k = addMonthsToMonthKey(month, -5);
    k <= month;
    k = addMonthsToMonthKey(k, 1)
  ) {
    if (k >= KPI_FIRST_MONTH) out.push(k);
  }
  return out;
}

/**
 * Results before `recordingSinceDay` (written before the switch went off) are
 * counted as they are; only the rest is projected over the recorded days.
 */
function forecastOf(
  active: readonly ResultFact[],
  f: OverviewFacts,
): number | null {
  const since = f.recordingSinceDay;
  if (!f.today || !f.workingDays || !since) return null;
  const after = active.filter(
    (r) => tashkentDateStr(r.occurredAt) >= since,
  ).length;
  const projected = monthEndForecast(after, f.workingDays, f.today, since);
  return projected === null ? null : active.length - after + projected;
}

export function assembleOverview(f: OverviewFacts): OverviewBody {
  const todayDay = f.today === null ? null : Number(f.today.slice(8, 10));
  // In the current month every comparison stops at the same day of the
  // compare month (spec §7.9/1); the chart still draws the whole compare month.
  const inCut = (d: Date) => todayDay === null || dayOf(d) <= todayDay;
  const active = f.monthResults.filter(
    (r) => r.status === KpiResultStatus.ACTIVE,
  );
  const compare = f.compareResults.filter((r) => inCut(r.occurredAt));
  const compareExpired = f.compareExpired.filter((l) => inCut(l.at));
  const monthPairs = new Set(f.received.map(pairKey));
  const comparePairs = new Set(
    f.compareReceived.filter((l) => inCut(l.at)).map(pairKey),
  );
  const paid = new Set(f.paidLeads.map(pairKey));
  const paidOf = (pairs: Set<string>) =>
    [...pairs].filter((p) => paid.has(p)).length;

  // With a result, or an administrator who holds leads now or took or lost
  // one this month — whose leads all expired is exactly rule 3's case.
  const ids = new Set(f.monthResults.map((r) => r.userId));
  for (const userId of [
    ...f.held.keys(),
    ...f.received.map((l) => l.userId),
    ...f.expired.map((l) => l.userId),
  ]) {
    if (f.eligibleUsers.has(userId)) ids.add(userId);
  }

  const rows = [...ids]
    .map((userId): KpiAdminRow => {
      const of = <T extends { userId: number }>(list: readonly T[]) =>
        list.filter((x) => x.userId === userId);
      const typed = (list: readonly ResultFact[], type: KpiResultType) =>
        of(list).filter((r) => r.type === type);
      const lp = typed(active, KpiResultType.LEAD_PAID);
      const pk = typed(active, KpiResultType.PROMISE_KEPT);
      const received = [...monthPairs].filter((p) =>
        p.startsWith(`${userId}:`),
      );
      const paidCount = received.filter((p) => paid.has(p)).length;
      const promises = of(f.promises);
      const kept = promises.filter((p) => p.status === 'KEPT').length;
      return {
        userId,
        name: f.names.get(userId) ?? `#${userId}`,
        leadPaid: {
          count: lp.length,
          amount: sum(lp),
          compare: typed(compare, KpiResultType.LEAD_PAID).length,
        },
        promiseKept: {
          count: pk.length,
          amount: sum(pk),
          compare: typed(compare, KpiResultType.PROMISE_KEPT).length,
        },
        leadToPaid: {
          paid: paidCount,
          received: received.length,
          pct: pct(paidCount, received.length),
        },
        promiseRate: {
          kept,
          closed: promises.length,
          pct: pct(kept, promises.length),
        },
        expired: {
          count: of(f.expired).length,
          compare: of(compareExpired).length,
        },
        held: f.held.get(userId) ?? 0,
        total: sum(lp) + sum(pk),
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const signals = kpiSignals(
    rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      results: r.leadPaid.count + r.promiseKept.count,
      compareResults: r.leadPaid.compare + r.promiseKept.compare,
      held: r.held,
      hasRecentResult: f.recentUserIds.has(r.userId),
      expired: r.expired.count,
      compareExpired: r.expired.compare,
      promiseKept: r.promiseRate.kept,
      promiseClosed: r.promiseRate.closed,
      leadsReceived: r.leadToPaid.received,
      leadsPaid: r.leadToPaid.paid,
    })),
    { isCurrentMonth: f.today !== null, compareRecorded: f.compareRecorded },
  );

  const lenM = daysIn(f.month);
  const lenC = daysIn(f.compare);
  const lastM = todayDay ?? lenM;
  const perDay = (list: readonly ResultFact[]) => {
    const counts = new Array<number>(32).fill(0);
    for (const r of list) counts[dayOf(r.occurredAt)] += 1;
    return counts;
  };
  const mDays = perDay(active);
  const cDays = perDay(f.compareResults);
  const daily: OverviewBody['daily'] = [];
  let mRun = 0;
  let cRun = 0;
  for (let day = 1; day <= Math.max(lenM, lenC); day++) {
    mRun += mDays[day];
    cRun += cDays[day];
    daily.push({
      day,
      current: day <= lastM && day <= lenM ? mRun : null,
      compare: day <= lenC ? cRun : null,
    });
  }

  const months = monthsFrom(f.month).map((month) => {
    const list = f.series.filter((r) => r.month === month);
    return {
      month,
      leadPaid: list.filter((r) => r.type === KpiResultType.LEAD_PAID).length,
      promiseKept: list.filter((r) => r.type === KpiResultType.PROMISE_KEPT)
        .length,
      amount: sum(list),
    };
  });

  return {
    cards: {
      results: { value: active.length, compare: compare.length },
      amount: { value: sum(active), compare: sum(compare) },
      leadToPaid: {
        value: pct(paidOf(monthPairs), monthPairs.size),
        compare: pct(paidOf(comparePairs), comparePairs.size),
      },
      forecast: forecastOf(active, f),
    },
    signals,
    daily,
    months,
    rows,
  };
}
