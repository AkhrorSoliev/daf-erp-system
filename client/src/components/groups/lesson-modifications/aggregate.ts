/**
 * Merge cancellations + reschedules + overrides into a single per-date row
 * shape so the "Dars o'zgarishlari" tab can show one chronological feed
 * instead of three independent tables.
 *
 * Aggregation key is the **lesson date** as it appears on the calendar:
 *   - Cancellation → its `date`
 *   - Override     → its `date`
 *   - Reschedule   → its `newDate` (the date the lesson now lives on)
 *
 * The `originalDate` of a reschedule is intentionally NOT a row of its
 * own — that date no longer hosts a lesson. The reschedule row at
 * `newDate` carries the "moved from <originalDate>" detail instead.
 */

export interface LessonCancellationRow {
  id: string;
  date: string;
  reason: string;
  createdAt: string;
  cancelledBy: { id: number; firstName: string; lastName: string };
}

export interface LessonOverrideRow {
  id: string;
  date: string;
  teacherIds: number[];
  reason: string | null;
  createdAt: string;
  setBy: { id: number; firstName: string; lastName: string };
}

export interface LessonRescheduleRow {
  id: string;
  originalDate: string;
  newDate: string;
  newRoomId: string | null;
  newRoom: { id: string; name: string } | null;
  newLessonStartTime: string | null;
  newLessonEndTime: string | null;
  reason: string | null;
  createdAt: string;
  scheduledBy: { id: number; firstName: string; lastName: string };
}

export interface LessonModificationRow {
  /** Calendar key — `YYYY-MM-DD`. */
  dateKey: string;
  /** The lesson date as a Date object (local midnight). */
  date: Date;
  cancellation?: LessonCancellationRow;
  override?: LessonOverrideRow;
  reschedule?: LessonRescheduleRow;
  /**
   * Display info for the "Belgilagan / Vaqti" cell — picked from the most
   * recent of the three (so a row that was first rescheduled, then later
   * cancelled, attributes the latest action).
   */
  latestActor: { firstName: string; lastName: string };
  latestAt: string;
}

function dateKey(d: string): string {
  // Always slice to 10 chars so backend ISO strings + plain "YYYY-MM-DD"
  // both collapse to the same key.
  return d.slice(0, 10);
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function aggregateLessonModifications(input: {
  cancellations?: LessonCancellationRow[];
  overrides?: LessonOverrideRow[];
  reschedules?: LessonRescheduleRow[];
}): LessonModificationRow[] {
  const map = new Map<string, LessonModificationRow>();

  const ensure = (key: string): LessonModificationRow => {
    let row = map.get(key);
    if (!row) {
      row = {
        dateKey: key,
        date: parseDateKey(key),
        latestActor: { firstName: "", lastName: "" },
        latestAt: "",
      };
      map.set(key, row);
    }
    return row;
  };

  const updateLatest = (
    row: LessonModificationRow,
    actor: { firstName: string; lastName: string },
    at: string,
  ) => {
    if (!row.latestAt || at > row.latestAt) {
      row.latestActor = actor;
      row.latestAt = at;
    }
  };

  for (const c of input.cancellations ?? []) {
    const row = ensure(dateKey(c.date));
    row.cancellation = c;
    updateLatest(row, c.cancelledBy, c.createdAt);
  }
  for (const o of input.overrides ?? []) {
    const row = ensure(dateKey(o.date));
    row.override = o;
    updateLatest(row, o.setBy, o.createdAt);
  }
  for (const r of input.reschedules ?? []) {
    const row = ensure(dateKey(r.newDate));
    row.reschedule = r;
    updateLatest(row, r.scheduledBy, r.createdAt);
  }

  // Newest-first matches user expectation when scanning the audit feed.
  return Array.from(map.values()).sort((a, b) =>
    b.dateKey.localeCompare(a.dateKey),
  );
}
