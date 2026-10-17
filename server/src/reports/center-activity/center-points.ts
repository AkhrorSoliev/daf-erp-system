import { enrollmentStatusOn } from '../../students/shared/enrollment-status-on';
import {
  DEFAULT_WORK_END,
  DEFAULT_WORK_START,
  type GroupFact,
  type Point,
  type RoomFact,
  type WorkWindow,
} from './center-activity.types';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The version of an SCD2 history valid at `at`; `fallback` when none covers it (un-backfilled data). */
export function pointOn<T>(history: Point<T>[], at: Date, fallback: T): T {
  const t = at.getTime();
  for (const p of history) {
    if (
      p.validFrom.getTime() <= t &&
      (p.validTo === null || p.validTo.getTime() > t)
    ) {
      return p.value;
    }
  }
  return fallback;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** A branch's working window; an unreadable or reversed one is replaced by the default. */
export function normalizeWorkWindow(
  start: string | null,
  end: string | null,
): WorkWindow {
  if (
    start &&
    end &&
    HHMM.test(start) &&
    HHMM.test(end) &&
    toMinutes(start) < toMinutes(end)
  ) {
    return { start, end };
  }
  return { start: DEFAULT_WORK_START, end: DEFAULT_WORK_END };
}

/**
 * The half-hour slots (minutes / 30) a lesson covers, clipped to the room's
 * working window so occupancy cannot pass 100%. A missing or reversed time
 * covers nothing.
 */
export function lessonSlots(
  start: string | null,
  end: string | null,
  w: WorkWindow,
): number[] {
  if (!start || !end || !HHMM.test(start) || !HHMM.test(end)) return [];
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (to <= from) return [];
  const first = Math.max(
    Math.floor(from / 30),
    Math.ceil(toMinutes(w.start) / 30),
  );
  const last = Math.min(Math.ceil(to / 30), Math.floor(toMinutes(w.end) / 30));
  const out: number[] = [];
  for (let s = first; s < last; s++) out.push(s);
  return out;
}

/** The group's status at `at` from `StatusHistory`; ACTIVE from creation when it has no rows yet. */
export function groupStatusOn(g: GroupFact, at: Date): string {
  const t = at.getTime();
  let status: string | null = null;
  for (const row of g.statusLog) {
    if (row.at.getTime() <= t) status = row.status;
    else break;
  }
  return status ?? 'ACTIVE';
}

/** Does the group hold its room and seats at `at`? Closed, deleted, paused and not-yet-started groups do not. */
export function isGroupOpen(g: GroupFact, at: Date): boolean {
  const t = at.getTime();
  const opened = Math.max(g.createdAt.getTime(), g.startDate?.getTime() ?? 0);
  if (opened > t) return false;
  if (g.endDate && t > g.endDate.getTime()) return false;
  if (g.deletedAt && t >= g.deletedAt.getTime()) return false;
  const s = groupStatusOn(g, at);
  return s === 'ACTIVE' || s === 'FORMING';
}

/**
 * Is the room part of the centre at `at`? A past month has no status history
 * for rooms, so only creation and deletion count; the current month also needs
 * ACTIVE, so a room under repair is not offered for a new group.
 */
export function roomExistsOn(r: RoomFact, at: Date, current: boolean): boolean {
  const t = at.getTime();
  if (r.createdAt.getTime() > t) return false;
  if (r.deletedAt && t >= r.deletedAt.getTime()) return false;
  return current ? r.status === 'ACTIVE' : true;
}

/** Enrollments of the group that are ACTIVE at `at` (the activity report's own reader, ADR-0035). */
export function enrolledOn(g: GroupFact, at: Date): number {
  return g.enrollments.filter(
    (e) =>
      enrollmentStatusOn(e.log.length > 0 ? e.log : undefined, at, {
        createdAt: e.createdAt,
        statusChangedAt: e.statusChangedAt,
        status: e.status,
      }) === 'ACTIVE',
  ).length;
}
