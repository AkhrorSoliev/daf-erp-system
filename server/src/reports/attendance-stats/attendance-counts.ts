import type { AttendanceStatus } from '@prisma/client';
import { dayOfWeekForDateStr } from '../../common/date/tashkent';
import { round1 } from '../center-activity/center-metrics';
import type {
  AttRow,
  AttendanceFacts,
  Counts,
  CutKey,
  CutRow,
  DayWindow,
  GroupFact,
  MisserPair,
  WeekdayRow,
} from './attendance-stats.types';

/**
 * THE definition of the attendance rate (spec B7c §3, ADR-0103). The report,
 * its Excel file and the home page's «davomat (bu oy)» all count through this
 * file; no other place writes the formula.
 */

/** What the counting reads of a mark; `declaration: true` needs it exported (it is in the signatures). */
export type Mark = Pick<AttRow, 'date' | 'status' | 'cancelled'>;

const MISS_MIN = 3;

const emptyCounts = (): Counts => ({
  came: 0,
  late: 0,
  absent: 0,
  excused: 0,
  cancelled: 0,
});

/** A database mark → the report's mark: the `@db.Date` as its calendar day (= the Tashkent day). */
export function markOf(m: {
  date: Date;
  status: AttendanceStatus;
  cancellationId: string | null;
}): Mark {
  return {
    date: m.date.toISOString().slice(0, 10),
    status: m.status,
    cancelled: m.cancellationId !== null,
  };
}

/** A centre-cancelled lesson is its own count, never «Sababli». */
function addRow(c: Counts, r: Pick<AttRow, 'status' | 'cancelled'>): void {
  if (r.cancelled) {
    c.cancelled++;
    return;
  }
  if (r.status === 'PRESENT') c.came++;
  else if (r.status === 'LATE') c.late++;
  else if (r.status === 'ABSENT') c.absent++;
  else c.excused++;
}

export const inWindow = (date: string, w: DayWindow): boolean =>
  date >= w.from && date < w.to;

/** The five counts of the marks (inside `w` when given). */
export function countRows(rows: readonly Mark[], w?: DayWindow): Counts {
  const c = emptyCounts();
  for (const r of rows) if (!w || inWindow(r.date, w)) addRow(c, r);
  return c;
}

/** «Darslar»: the marks the rate is taken over (Keldi + Kechikdi + Kelmadi). */
export const lessonsOf = (c: Counts): number => c.came + c.late + c.absent;
/** Keldi + Kechikdi. */
export const attendedOf = (c: Counts): number => c.came + c.late;

/** (Keldi + Kechikdi) ÷ (Keldi + Kechikdi + Kelmadi), one decimal; null with nothing to divide by — never 0%. */
export function rateOf(c: Counts): number | null {
  const n = lessonsOf(c);
  return n > 0 ? round1((attendedOf(c) / n) * 100) : null;
}

/** Fewest marks a cut row needs to be listed (spec §4): ceil(60 × days / 30). */
export const minLessons = (days: number): number => Math.ceil((60 * days) / 30);

/** Monday–Saturday always, Sunday only when a mark falls on it; Σ = the window's counts. */
export function weekdayRows(rows: readonly Mark[], w: DayWindow): WeekdayRow[] {
  const byDay = new Map<number, Counts>(
    [1, 2, 3, 4, 5, 6].map((d) => [d, emptyCounts()]),
  );
  for (const r of rows) {
    if (!inWindow(r.date, w)) continue;
    const day = dayOfWeekForDateStr(r.date) || 7;
    let c = byDay.get(day);
    if (!c) {
      c = emptyCounts();
      byDay.set(day, c);
    }
    addRow(c, r);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, counts]) => ({ day, counts, rate: rateOf(counts) }));
}

/** The loader reads every group a mark points at (no deletedAt filter), so a miss is a broken load. */
export function groupOf(
  groups: ReadonlyMap<string, GroupFact>,
  id: string,
): GroupFact {
  const g = groups.get(id);
  if (!g) throw new Error(`Davomat: ${id} guruhi yuklanmagan`);
  return g;
}

/** The cut row a group belongs to: itself, its current teacher («Ustozsiz»: `none`), its current course. */
export function cutOf(
  g: GroupFact,
  cut: CutKey,
): { key: string; name: string; deleted: boolean } {
  if (cut === 'group') {
    return {
      key: g.id,
      name: g.teacherName ? `${g.name} · ${g.teacherName}` : g.name,
      deleted: g.deleted,
    };
  }
  if (cut === 'teacher') {
    return g.teacherId === null
      ? { key: 'none', name: 'Ustozsiz', deleted: false }
      : { key: String(g.teacherId), name: g.teacherName ?? '', deleted: false };
  }
  return { key: g.courseId, name: g.courseName, deleted: false };
}

/** Every (student, group) pair of the window with 3+ «Kelmadi» (spec §2, «Ko'p qoldiruvchi»). */
export function missPairs(rows: readonly AttRow[], w: DayWindow): MisserPair[] {
  const byPair = new Map<string, MisserPair>();
  for (const r of rows) {
    if (r.cancelled || r.status === 'EXCUSED' || !inWindow(r.date, w)) continue;
    const k = `${r.studentId}|${r.groupId}`;
    const p = byPair.get(k) ?? {
      studentId: r.studentId,
      groupId: r.groupId,
      absent: 0,
      lessons: 0,
    };
    p.lessons++;
    if (r.status === 'ABSENT') p.absent++;
    byPair.set(k, p);
  }
  return [...byPair.values()].filter((p) => p.absent >= MISS_MIN);
}

function lowestFirst(a: CutRow, b: CutRow): number {
  const ra = a.rate ?? Number.POSITIVE_INFINITY;
  const rb = b.rate ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return (
    b.lessons - a.lessons ||
    a.name.localeCompare(b.name, 'uz', { numeric: true })
  );
}

/**
 * Every row of a cut over the window — the min-row rule is the caller's — so
 * Σ rows = the window's counts (pinned by the overview parity test).
 */
export function cutRows(
  facts: AttendanceFacts,
  w: DayWindow,
  cut: CutKey,
): CutRow[] {
  const acc = new Map<string, { row: CutRow; misserIds: Set<number> }>();
  const entryOf = (groupId: string) => {
    const k = cutOf(groupOf(facts.groups, groupId), cut);
    let e = acc.get(k.key);
    if (!e) {
      e = {
        row: {
          ...k,
          counts: emptyCounts(),
          lessons: 0,
          rate: null,
          missers: 0,
        },
        misserIds: new Set(),
      };
      acc.set(k.key, e);
    }
    return e;
  };
  for (const r of facts.rows)
    if (inWindow(r.date, w)) addRow(entryOf(r.groupId).row.counts, r);
  for (const p of missPairs(facts.rows, w))
    entryOf(p.groupId).misserIds.add(p.studentId);
  return [...acc.values()]
    .map(({ row, misserIds }) => ({
      ...row,
      lessons: lessonsOf(row.counts),
      rate: rateOf(row.counts),
      missers: misserIds.size,
    }))
    .sort(lowestFirst);
}
