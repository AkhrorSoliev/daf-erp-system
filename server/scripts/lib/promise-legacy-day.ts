/**
 * The day an already-stored `PaymentPromise.promiseDate` meant. Every writer
 * so far stored an instant whose UTC calendar date is that day:
 *   00:00:00.000Z — the payment dialog's 'YYYY-MM-DD' (05:00 Tashkent)
 *   18:00:00.000Z — the debt drawer and call dialog's 23:00 Tashkent
 *   18:59:59.999Z — `promiseDayEnd` itself
 *   18:59:59 / 20:59:59 / 21:59:59 .000Z — the old dialogs' browser-local
 *     23:59:59 (`setHours`) from a UTC+5 / +3 / +2 browser
 * Read by Tashkent day, the last two land a day late: a note «28 kuni
 * to'laydi» was stored as 29.06 01:59:59 Tashkent (production, 05.10.2026).
 * Null for any other time of day — a form nobody has explained is not guessed.
 */
const KNOWN_UTC_TIMES = new Set([
  '00:00:00.000',
  '18:00:00.000',
  '18:59:59.999',
  '18:59:59.000',
  '20:59:59.000',
  '21:59:59.000',
]);

export function legacyPromiseDay(stored: Date): string | null {
  const iso = stored.toISOString();
  return KNOWN_UTC_TIMES.has(iso.slice(11, 23)) ? iso.slice(0, 10) : null;
}
