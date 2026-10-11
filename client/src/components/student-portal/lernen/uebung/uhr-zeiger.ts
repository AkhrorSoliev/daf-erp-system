/**
 * Clock geometry for `uhr.tsx`, kept pure so it is tested without a DOM.
 * Angles are degrees clockwise from twelve o'clock.
 */

/**
 * Hand angles for `HH:MM` (00:00–23:59). The hour hand moves with the
 * minutes — at 3:30 it stands halfway between 3 and 4, which is exactly
 * what «halb vier» means. `null` for anything else.
 */
export function zeigerWinkel(zeit: string): { stunde: number; minute: number } | null {
  const treffer = /^(\d{2}):(\d{2})$/.exec(zeit);
  if (!treffer) return null;
  const h = Number(treffer[1]);
  const m = Number(treffer[2]);
  if (h > 23 || m > 59) return null;
  return { stunde: (h % 12) * 30 + m * 0.5, minute: m * 6 };
}

/** A point at `radius` from the centre (50, 50) of a 100×100 face. */
export function punktAufKreis(winkel: number, radius: number): { x: number; y: number } {
  const rad = (winkel * Math.PI) / 180;
  const runde = (v: number) => Math.round(v * 1000) / 1000;
  return { x: runde(50 + radius * Math.sin(rad)), y: runde(50 - radius * Math.cos(rad)) };
}
