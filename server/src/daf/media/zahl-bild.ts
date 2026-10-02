import { SVG_GROESSE } from './svg-zu-png';

/**
 * Number pictures, drawn in code — free and exact: an image model cannot be
 * trusted to draw seven of something, or a clean digit.
 *
 * A blue German house-number plate (Hausnummer) with one white numeral, the
 * same plate for every number from 0 to 100. The first version, dots in
 * ten-frames, made the student count on top of the German — nobody counts
 * 17 dots at 150 px — and the CEO found it incomprehensible (2026-09-30).
 *
 * The numeral does not give the answer away: `BILD_WORT` shows the German
 * word (never `anzeige`) and `AUDIO_BILD` only plays it, so the student still
 * has to decode "fünfunddreißig" to pick 35 over 53. The numeral is the
 * meaning, as an apple is the meaning of "Apfel". Every option in a grid is
 * the same plate, so only the number tells them apart; size and colour never
 * vary, or students would learn "the red one" instead of the numeral.
 */

const HINTERGRUND = '#FDF3E7';
const SCHILD = '#1E4FA3';
const UMRISS = '#1E2A4A';
const WEISS = '#FFFFFF';
const SCHRAUBE = '#C9CED8';
const MAX_ZAHL = 100;
/** Arial Black's digits are 0.716 em tall: half of that centres them. */
const ZIFFER_MITTE = 0.358;

export function zahlBildSvg(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > MAX_ZAHL) {
    throw new Error(`Son rasmi 0–${MAX_ZAHL} butun son uchun: ${n}`);
  }
  const text = String(n);
  const schrift = text.length < 3 ? 440 : 300;
  const grundlinie = Math.round(SVG_GROESSE / 2 + ZIFFER_MITTE * schrift);
  const schrauben = [
    [132, 244],
    [892, 244],
    [132, 780],
    [892, 780],
  ]
    .map(
      ([x, y]) =>
        `<circle cx="${x}" cy="${y}" r="16" fill="${SCHRAUBE}" stroke="${UMRISS}" stroke-width="6"/>`,
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_GROESSE} ${SVG_GROESSE}" width="${SVG_GROESSE}" height="${SVG_GROESSE}">` +
    `<rect width="${SVG_GROESSE}" height="${SVG_GROESSE}" fill="${HINTERGRUND}"/>` +
    `<rect x="80" y="192" width="864" height="640" rx="64" fill="${SCHILD}" stroke="${UMRISS}" stroke-width="24"/>` +
    `<rect x="124" y="236" width="776" height="552" rx="32" fill="none" stroke="${WEISS}" stroke-width="14"/>` +
    schrauben +
    `<text x="512" y="${grundlinie}" text-anchor="middle" font-family="Arial Black, Arial Rounded MT Bold, Arial, sans-serif" font-weight="900" font-size="${schrift}" fill="${WEISS}">${text}</text>` +
    `</svg>`
  );
}
