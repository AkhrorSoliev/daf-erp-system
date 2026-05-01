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
