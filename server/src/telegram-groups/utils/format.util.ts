/**
 * Uzbek-locale formatters for bot replies. Mirrors the client-side
 * `src/lib/format-utils.ts` conventions: space thousands separator, "so'm"
 * currency suffix, `dd.MM.yyyy` dates.
 */

const NBSP = ' ';

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  const str = abs.toString();
  const parts: string[] = [];
  for (let i = str.length; i > 0; i -= 3) {
    parts.unshift(str.slice(Math.max(0, i - 3), i));
  }
  return sign + parts.join(NBSP);
}

export function formatSum(amount: number): string {
  return `${formatNumber(amount)} so'm`;
}

/**
 * Signed money — prefixes a leading "+" for strictly-positive amounts so a
 * net/profit line reads "+6 550 000 so'm". Negatives already carry the "-"
 * from `formatNumber`; zero stays bare.
 */
export function formatSignedSum(amount: number): string {
  const rounded = Math.round(amount);
  return `${rounded > 0 ? '+' : ''}${formatSum(rounded)}`;
}

/**
 * Escapes the three characters that break Telegram `parse_mode: 'HTML'`.
 * Interpolated free text (company/branch names) MUST pass through this — a
 * name containing `&`, `<` or `>` otherwise makes Telegram reject the message.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/**
 * `dd.MM.yyyy, HH:mm` in Asia/Tashkent (fixed UTC+5, no DST). Used for
 * event-time stamps in instant Telegram messages (e.g. when an admin freezes
 * or reactivates a student). Defaults to "now" since the status-change event
 * carries no timestamp of its own.
 */
export function formatDateTime(d: Date | string = new Date()): string {
  const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
  const date = d instanceof Date ? d : new Date(d);
  const tz = new Date(date.getTime() + TASHKENT_OFFSET_MS);
  const dd = String(tz.getUTCDate()).padStart(2, '0');
  const mm = String(tz.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = tz.getUTCFullYear();
  const hh = String(tz.getUTCHours()).padStart(2, '0');
  const min = String(tz.getUTCMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy}, ${hh}:${min}`;
}

/**
 * "Today" in Asia/Tashkent (UTC+5). Returns [startUtc, endUtc) so we can
 * filter Postgres timestamps that are stored in UTC.
 */
export function tashkentDayRange(now: Date = new Date()): {
  start: Date;
  end: Date;
  label: string;
} {
  // Asia/Tashkent has no DST and is fixed UTC+5.
  const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
  const tashkentNow = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const y = tashkentNow.getUTCFullYear();
  const m = tashkentNow.getUTCMonth();
  const d = tashkentNow.getUTCDate();
  // Tashkent midnight today, expressed in UTC = Tashkent date 00:00 − 5h.
  const startUtcMs = Date.UTC(y, m, d) - TASHKENT_OFFSET_MS;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;
  return {
    start: new Date(startUtcMs),
    end: new Date(endUtcMs),
    label: formatDate(new Date(Date.UTC(y, m, d))),
  };
}

export function firstOfThisMonthUtc(now: Date = new Date()): Date {
  const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
  const tashkentNow = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const y = tashkentNow.getUTCFullYear();
  const m = tashkentNow.getUTCMonth();
  return new Date(Date.UTC(y, m, 1) - TASHKENT_OFFSET_MS);
}

/**
 * Today's Tashkent calendar date as a Date at 00:00 UTC. Use this when
 * filtering against PostgreSQL `DATE` columns (e.g. `Attendance.date`).
 *
 * `tashkentDayRange` returns a UTC-timestamp window shifted by -5h to mark
 * Tashkent midnight. That window is correct for TIMESTAMP columns
 * (`createdAt` etc.), but Prisma coerces timestamps to the UTC calendar
 * date when comparing against a DATE column, so the -5h shift produces an
 * off-by-one and silently selects "yesterday in Tashkent" instead of today.
 */
export function tashkentTodayDate(now: Date = new Date()): Date {
  const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
  const tashkentNow = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const y = tashkentNow.getUTCFullYear();
  const m = tashkentNow.getUTCMonth();
  const d = tashkentNow.getUTCDate();
  return new Date(Date.UTC(y, m, d));
}

/**
 * True when `now` falls on a Sunday in Asia/Tashkent (UTC+5). Used by the
 * Telegram report crons to skip the weekly day off — the center has no
 * business activity on Sundays so any stats report would be all zeros.
 */
export function isTashkentSunday(now: Date = new Date()): boolean {
  const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
  const tashkentNow = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  return tashkentNow.getUTCDay() === 0;
}
