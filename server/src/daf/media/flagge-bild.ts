import { SVG_GROESSE } from './svg-zu-png';

/**
 * Country pictures as flags, drawn in code from the official construction —
 * exact and free. An image model draws a vague domed building for
 * "Usbekistan" (the CEO found it unclear, 2026-09-30) and cannot be trusted
 * with 12 stars and a crescent.
 *
 * Uzbekistan: law No. 407-XII, art. 4 (1:2; three 40 cm bands with 2.5 cm
 * red lines; a crescent in a 30 cm circle 20 cm from the hoist; 12 stars in
 * rows of 3-4-5), coordinates as the Wikimedia Commons construction on a
 * 1000 × 500 canvas; colours as Commons (the law names no hex values).
 * Germany: 3:5, black-red-gold, Commons colours.
 */
export type Land = 'UZ' | 'DE';
export const LAENDER: readonly Land[] = ['UZ', 'DE'];

const HINTERGRUND = '#FDF3E7';
const UMRISS = '#1E2A4A';
const STANGE = '#8A6A4B';

/** A five-pointed star of outer radius 12, one point up, centred on 0,0. */
const STERN =
  'M0,-12 L2.694,-3.708 L11.413,-3.708 L4.359,1.416 L7.053,9.708 L0,4.584 ' +
  'L-7.053,9.708 L-4.359,1.416 L-11.413,-3.708 L-2.694,-3.708 Z';

/** Star centres on the 1000 × 500 canvas: rows of 3, 4, 5, right-aligned. */
const STERNE: Array<[number, number]> = [
  ...[272, 320, 368].map((x): [number, number] => [x, 32]),
  ...[224, 272, 320, 368].map((x): [number, number] => [x, 80]),
  ...[176, 224, 272, 320, 368].map((x): [number, number] => [x, 128]),
];

/** The flag itself on its own canvas (width × height), without the pole. */
function flagge(land: Land): { breite: number; hoehe: number; inhalt: string } {
  if (land === 'UZ') {
    const sterne = STERNE.map(
      ([x, y]) =>
        `<path class="stern" d="${STERN}" transform="translate(${x},${y})" fill="#FFFFFF"/>`,
    ).join('');
    return {
      breite: 1000,
      hoehe: 500,
      inhalt:
        `<rect width="1000" height="500" fill="#1EB53A"/>` +
        `<rect width="1000" height="250" fill="#0099B5"/>` +
        `<rect y="160" width="1000" height="180" fill="#CE1126"/>` +
        `<rect y="170" width="1000" height="160" fill="#FFFFFF"/>` +
        `<circle cx="140" cy="80" r="60" fill="#FFFFFF"/>` +
        `<circle cx="160" cy="80" r="60" fill="#0099B5"/>` +
        sterne,
    };
  }
  return {
    breite: 1000,
    hoehe: 600,
    inhalt:
      `<rect width="1000" height="200" fill="#000000"/>` +
      `<rect y="200" width="1000" height="200" fill="#DD0000"/>` +
      `<rect y="400" width="1000" height="200" fill="#FFCE00"/>`,
  };
}

export function flaggeSvg(land: Land): string {
  if (!LAENDER.includes(land)) {
    throw new Error(`Bayroq chizilmaydi: ${String(land)}`);
  }
  const { breite, hoehe, inhalt } = flagge(land);
  // The flag hangs from a pole on the left, so it reads as a flag and not
  // as a striped pattern; it fills most of the frame like every picture.
  const massstab = 780 / breite;
  const w = breite * massstab;
  const h = hoehe * massstab;
  const x = 176;
  const y = Math.round((SVG_GROESSE - h) / 2) - 40;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_GROESSE} ${SVG_GROESSE}" width="${SVG_GROESSE}" height="${SVG_GROESSE}">` +
    `<rect width="${SVG_GROESSE}" height="${SVG_GROESSE}" fill="${HINTERGRUND}"/>` +
    `<rect x="128" y="${y - 40}" width="32" height="${SVG_GROESSE - y - 40 - 70}" rx="10" fill="${STANGE}" stroke="${UMRISS}" stroke-width="10"/>` +
    `<circle cx="144" cy="${y - 48}" r="26" fill="#E0B84F" stroke="${UMRISS}" stroke-width="10"/>` +
    `<g transform="translate(${x},${y}) scale(${massstab})">${inhalt}</g>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${UMRISS}" stroke-width="14"/>` +
    `</svg>`
  );
}
