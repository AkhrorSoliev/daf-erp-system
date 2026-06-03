import { DAY_NAME_TO_JS, tashkentDateStr } from './date-utils';

export interface ScheduleSnapshotRow {
  exactDays: string[];
  validFrom: Date;
  validTo: Date | null;
}

const mapDays = (days: string[]): number[] =>
  days.map((d) => DAY_NAME_TO_JS[d]).filter((d) => d !== undefined);

/**
 * Builds a resolver that answers "which weekdays did this group hold lessons
 * on, as of a given calendar date?" — honouring historical schedule changes
 * recorded in `GroupScheduleSnapshot`.
 *
 * Why this exists: lesson-day reconstruction (`getLessonDates`, the month
 * calendar, the dots sequence, stats) walks the group lifecycle and asks
 * "is this weekday a lesson day?". Using the *current* `exactDays` for every
 * date is wrong once the schedule has changed — past months get rebuilt under
 * the NEW weekdays, so attendance taken under the OLD schedule disappears and
 * the new weekdays surface as phantom "Davomat olinmagan" rows.
 *
 * Resolution for a date string (Tashkent calendar `YYYY-MM-DD`):
 *   - group has NO snapshots  → current `exactDays` for every date
 *     (schedule never changed — the common case, behaviour unchanged);
 *   - a snapshot covers the date → that snapshot's weekdays;
 *   - the date is after the latest snapshot / falls in a gap → current
 *     `exactDays` (safe fallback);
 *   - the group HAS snapshots but the date predates the earliest one →
 *     `null`. The weekdays of that old period are unknown, so the caller must
 *     treat the date as a lesson **only if attendance actually exists** — we
 *     never project today's schedule backwards into an unknown period.
 */
export function buildScheduleDayResolver(
  snapshots: ScheduleSnapshotRow[],
  currentExactDays: string[],
): (dateStr: string) => number[] | null {
  const current = mapDays(currentExactDays);
  if (!snapshots || snapshots.length === 0) {
    return () => current;
  }

  const rows = snapshots
    .map((s) => ({
      days: mapDays(s.exactDays),
      from: tashkentDateStr(s.validFrom),
      to: s.validTo ? tashkentDateStr(s.validTo) : null,
    }))
    .sort((a, b) => a.from.localeCompare(b.from));
  const earliestFrom = rows[0].from;

  return (dateStr: string): number[] | null => {
    for (const r of rows) {
      if (dateStr >= r.from && (r.to === null || dateStr < r.to)) {
        return r.days;
      }
    }
    if (dateStr < earliestFrom) return null; // unknown old period → attendance-only
    return current; // gap between snapshots or after the open row → safe fallback
  };
}
