/**
 * Compute the list of actual lesson dates for a group in a date range.
 * A "lesson date" is one where the day-of-week is in `exactDays` AND
 * falls between (inclusive) `groupStartDate`/`groupEndDate`.
 */

const WEEKDAY_INDEX: Record<string, number> = {
  // JS Date.getDay(): 0=Sun, 1=Mon, ..., 6=Sat
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const WEEKDAY_LABEL_FULL: Record<number, string> = {
  0: "Yakshanba",
  1: "Dushanba",
  2: "Seshanba",
  3: "Chorshanba",
  4: "Payshanba",
  5: "Juma",
  6: "Shanba",
};

export function getLessonDatesInRange(opts: {
  exactDays: string[]; // ["monday", "wednesday", ...]
  groupStartDate?: string | Date | null;
  groupEndDate?: string | Date | null;
  from: Date; // inclusive
  to: Date; // inclusive
}): Date[] {
  const dayIndexes = new Set(
    opts.exactDays
      .map((d) => WEEKDAY_INDEX[d.toLowerCase()])
      .filter((n): n is number => Number.isInteger(n)),
  );
  if (dayIndexes.size === 0) return [];

  const groupStart = opts.groupStartDate ? new Date(opts.groupStartDate) : null;
  const groupEnd = opts.groupEndDate ? new Date(opts.groupEndDate) : null;

  const out: Date[] = [];
  const cursor = new Date(opts.from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(opts.to);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const matchesDay = dayIndexes.has(cursor.getDay());
    const inGroupRange =
      (!groupStart || cursor >= stripTime(groupStart)) &&
      (!groupEnd || cursor <= stripTime(groupEnd));
    if (matchesDay && inGroupRange) {
      out.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function stripTime(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function fullWeekdayLabel(date: Date): string {
  return WEEKDAY_LABEL_FULL[date.getDay()] ?? "";
}

export interface LessonDateOption {
  date: Date;
  /**
   * True when this date is in the picker because a lesson was rescheduled
   * onto it — i.e. it isn't part of the group's regular `exactDays` weekly
   * schedule, but a `LessonReschedule.newDate` points here.
   */
  isRescheduleDestination: boolean;
}

/**
 * Same idea as `getLessonDatesInRange`, but layers reschedule destinations
 * (extra valid lesson days outside the regular schedule) and excludes
 * cancellation dates + reschedule origins (lesson has moved away).
 *
 * Used by every lesson-aware date picker so the override / cancellation /
 * reschedule dialogs see the SAME notion of "what counts as a lesson day"
 * — no more "I rescheduled to Saturday but the override picker doesn't
 * show Saturday" UX bug.
 */
export function getEffectiveLessonDates(opts: {
  exactDays: string[];
  groupStartDate?: string | Date | null;
  groupEndDate?: string | Date | null;
  from: Date; // inclusive
  to: Date; // inclusive
  /** Dates a lesson was MOVED TO (LessonReschedule.newDate) — included even if outside `exactDays`. */
  rescheduleDestinations?: (Date | string)[];
  /** Dates to remove: cancellations + LessonReschedule.originalDate (lesson has moved away). */
  excludeDates?: (Date | string)[];
}): LessonDateOption[] {
  const base = getLessonDatesInRange({
    exactDays: opts.exactDays,
    groupStartDate: opts.groupStartDate,
    groupEndDate: opts.groupEndDate,
    from: opts.from,
    to: opts.to,
  });

  const excludeKeys = new Set((opts.excludeDates ?? []).map(toDateKey));
  const filteredBase = base.filter((d) => !excludeKeys.has(toDateKey(d)));
  const baseKeys = new Set(filteredBase.map(toDateKey));

  const fromKey = toDateKey(opts.from);
  const toKey = toDateKey(opts.to);
  const extras: Date[] = [];
  for (const raw of opts.rescheduleDestinations ?? []) {
    const key = toDateKey(raw);
    if (excludeKeys.has(key)) continue; // already removed (cancellation on the new date)
    if (baseKeys.has(key)) continue; // already in the regular schedule
    if (key < fromKey || key > toKey) continue; // out of window
    extras.push(parseKey(key));
  }

  const merged: LessonDateOption[] = [
    ...filteredBase.map((date) => ({ date, isRescheduleDestination: false })),
    ...extras.map((date) => ({ date, isRescheduleDestination: true })),
  ];
  merged.sort((a, b) => a.date.getTime() - b.date.getTime());
  return merged;
}

function toDateKey(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  // Use local-day components so a Date constructed via `new Date(y, m, d)`
  // round-trips to the same key — `toISOString().slice(0,10)` would
  // shift across timezones.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
