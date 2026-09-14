/**
 * Tashkent (UTC+5) timezone helpers for client-side date/time logic.
 *
 * The lesson schedule lives in Tashkent time on the backend
 * (`attendance-validation.service.ts` formats with `timeZone: "Asia/Tashkent"`).
 * Browser-local `new Date()` calls disagree for users outside Uzbekistan —
 * a teacher in Berlin opening the form at 16:00 CEST sees their local time
 * while the server is checking against 19:00 Tashkent. Routing every
 * "now" through these helpers keeps both layers aligned.
 */

export interface TashkentNow {
  /** Calendar date in Tashkent, formatted YYYY-MM-DD. */
  dateStr: string;
  /** Minutes since 00:00 in Tashkent (0–1439). */
  minutes: number;
  /** Seconds since 00:00 in Tashkent (0–86399). */
  seconds: number;
}

const FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tashkent",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function tashkentNow(now: Date = new Date()): TashkentNow {
  const parts = FORMATTER.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + minute,
    seconds: hour * 3600 + minute * 60 + second,
  };
}

/**
 * Local midnight of the TASHKENT calendar day an instant falls on — the value
 * to hand a `<DatePicker>`, or `format(…, "dd.MM.yyyy")`, for a column the
 * server reads as a Tashkent day (`Group.startDate`, `Group.endDate`).
 *
 * Those columns hold local midnight of whichever browser saved them, so one
 * calendar day arrives as `…T19:00Z` (Tashkent), `…T21:00Z` (UTC+3) or
 * `…T00:00Z` (the calendar-date shape of ADR-0016). `new Date(stored)` shows —
 * and a form then saves — the PREVIOUS day for a reader in another zone.
 */
export function tashkentDayAsLocalDate(instant: string | Date): Date {
  const [year, month, day] = tashkentNow(new Date(instant))
    .dateStr.split("-")
    .map(Number);
  return new Date(year, month - 1, day);
}
