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

export function formatDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
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
