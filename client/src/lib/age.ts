// Age from a calendar birth date. Plain 'YYYY-MM-DD' arithmetic, so neither
// the browser's nor the server's timezone can move a birthday by a day.

/** 'YYYY-MM-DD' of a Date in the browser's own calendar. */
export function localDateStr(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Full years between two 'YYYY-MM-DD' dates. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/**
 * Age for a stored birth date, read on the calendar day the card DISPLAYS.
 *
 * Stored birth dates are not all the same instant: the staff form's date
 * picker sends local midnight (in Tashkent, 19:00Z the day before), the
 * student's first-run form sends UTC midnight. Both land on the intended day
 * in the viewer's calendar — the day `format(new Date(iso), …)` shows — so the
 * age is taken from that day, never from the ISO string's first ten characters.
 */
export function ageFromStoredDate(
  iso: string,
  today: string = localDateStr(),
): number {
  return ageOn(localDateStr(new Date(iso)), today);
}
