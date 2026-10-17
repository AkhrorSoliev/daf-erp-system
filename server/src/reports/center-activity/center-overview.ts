import { tashkentMonthKey } from '../../common/date/tashkent';
import type {
  CenterFacts,
  CenterOverview,
  GroupRow,
  OverviewBranch,
  RoomRow,
} from './center-activity.types';
import { asOfForMonth, monthsUpTo } from './center-activity-period';
import { buildHeat } from './center-heat';
import {
  evaluateCenter,
  round1,
  type CenterEval,
  type GroupResult,
} from './center-metrics';
import { heatInsight } from './heat-insight';

/** The seats a group really fills: an overfull group counts at its capacity. The only place this is computed. */
const filledSeats = (g: Pick<GroupResult, 'enrolled' | 'capacity'>) =>
  Math.min(g.enrolled, g.capacity);

/** Σ lesson hours / Σ working hours of the evaluated rooms, as a percent with one decimal; null with no working hours. */
export function occupancyOf(ev: CenterEval): number | null {
  const work = ev.rooms.reduce((s, r) => s + r.workHours, 0);
  if (work <= 0) return null;
  return round1((ev.rooms.reduce((s, r) => s + r.lessonHours, 0) / work) * 100);
}

/**
 * The whole answer of the page from one fact set. The cards, both tables and
 * every month bar read the same `evaluateCenter` results, so they add up by
 * construction (pinned by the parity tests).
 */
export function buildOverview(
  facts: CenterFacts,
  month: string,
  now: Date,
  filialId?: number,
): CenterOverview {
  const at = asOfForMonth(month, now);
  const currentMonth = tashkentMonthKey(now);
  const current = month === currentMonth;
  const ev = evaluateCenter(facts, at, current);

  const byBranch = new Map<number, OverviewBranch>();
  for (const r of ev.rooms) {
    const b = byBranch.get(r.branchId) ?? {
      id: r.branchId,
      name: r.branchName,
      rooms: 0,
    };
    b.rooms++;
    byBranch.set(r.branchId, b);
  }
  const branches = [...byBranch.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'uz'),
  );
  if (filialId !== undefined && !byBranch.has(filialId)) {
    throw new RangeError('filial');
  }
  const heatBranch = filialId ?? branches[0]?.id;

  const hours = ev.rooms.reduce((s, r) => s + r.lessonHours, 0);
  const windows = new Set(
    ev.rooms.map((r) => `${r.window.start}-${r.window.end}`),
  );
  const capacity = ev.groups.reduce((s, g) => s + g.capacity, 0);
  const filled = ev.groups.reduce((s, g) => s + filledSeats(g), 0);

  // Grouped by branch, then by room name (numeric: «2-xona» before «10-xona»).
  const rooms: RoomRow[] = ev.rooms
    .map((r) => ({
      id: r.id,
      name: r.name,
      branchId: r.branchId,
      branchName: r.branchName,
      capacity: r.capacity,
      groupCount: r.groupCount,
      lessonHours: r.lessonHours,
      occupancyPct: r.occupancyPct,
    }))
    .sort(
      (a, b) =>
        a.branchName.localeCompare(b.branchName, 'uz', { numeric: true }) ||
        a.name.localeCompare(b.name, 'uz', { numeric: true }),
    );
  const free = ev.groups.filter((g) => g.free > 0);
  const groups: GroupRow[] = [...free]
    .sort((a, b) => b.free - a.free || a.name.localeCompare(b.name, 'uz'))
    .map((g) => ({
      id: g.id,
      name: g.name,
      courseName: g.courseName,
      branchId: g.branchId,
      days: g.days,
      start: g.start,
      end: g.end,
      enrolled: g.enrolled,
      capacity: g.capacity,
      free: g.free,
      overfull: g.overfull,
    }));

  // buildHeat takes its work window from rooms[0]: hand it one branch at a time.
  const heat =
    heatBranch === undefined
      ? null
      : (() => {
          const h = buildHeat(
            ev.rooms.filter((r) => r.branchId === heatBranch),
          );
          return { branchId: heatBranch, heat: h, insight: heatInsight(h) };
        })();

  return {
    month,
    asOf: at.toISOString(),
    current,
    branches,
    cards: {
      occupancyPct: occupancyOf(ev),
      lessonHoursPerWeek: round1(hours),
      workWindow: windows.size === 1 ? ev.rooms[0].window : null,
      seats: {
        pct: capacity > 0 ? round1((filled / capacity) * 100) : null,
        enrolled: filled,
        capacity,
      },
      free: {
        seats: capacity - filled,
        revenue: free.reduce((s, g) => s + g.free * (g.monthlyPrice ?? 0), 0),
      },
    },
    heat,
    rooms,
    groups,
    months: monthsUpTo(month).map((m) => ({
      month: m,
      pct: occupancyOf(
        m === month
          ? ev
          : evaluateCenter(facts, asOfForMonth(m, now), m === currentMonth),
      ),
    })),
    notes: { deletedLater: ev.deletedLater, unplaced: ev.unplaced },
  };
}
