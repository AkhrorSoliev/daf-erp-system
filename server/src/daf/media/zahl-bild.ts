import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Number pictures (u01-s4, 0–20), drawn in code — free, and exact: an image
 * model cannot be trusted to draw seven of something. Dots in ten-frames
 * (two rows of five), the way children learn to count: 7 is one full row and
 * two more, 13 is a full frame and three. No digit on the picture — it would
 * give the answer in `BILD_WORT`.
 *
 * Colours follow the flat style B the CEO chose (2026-09-27): a warm light
 * background, one strong colour.
 */

const GROESSE = 1024;
const HINTERGRUND = '#FDF3E7';
const RAHMEN = '#E8D5BE';
const ZELLE = '#FFFFFF';
const PUNKT = '#EF6C4A';
const MAX_ZAHL = 20;

function rahmen(y: number, gefuellt: number): string {
  const zelle = 150;
  const abstand = 18;
  const breite = 5 * zelle + 4 * abstand;
  const x0 = (GROESSE - breite) / 2;
  const teile = [
    `<rect x="${x0 - 30}" y="${y - 30}" width="${breite + 60}" height="${2 * zelle + abstand + 60}" rx="36" fill="${RAHMEN}"/>`,
  ];
  for (let i = 0; i < 10; i += 1) {
    const zeile = Math.floor(i / 5);
    const spalte = i % 5;
    const x = x0 + spalte * (zelle + abstand);
    const yz = y + zeile * (zelle + abstand);
    teile.push(
      `<rect class="zelle" x="${x}" y="${yz}" width="${zelle}" height="${zelle}" rx="24" fill="${ZELLE}"/>`,
    );
    if (i < gefuellt) {
      teile.push(
        `<circle class="punkt" cx="${x + zelle / 2}" cy="${yz + zelle / 2}" r="52" fill="${PUNKT}"/>`,
      );
    }
  }
  return teile.join('');
}

export function zahlBildSvg(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > MAX_ZAHL) {
    throw new Error(`Son rasmi 0–${MAX_ZAHL} butun son uchun: ${n}`);
  }
  const hoehe = 2 * 150 + 18;
  const rahmenInhalt =
    n <= 10
      ? rahmen((GROESSE - hoehe) / 2, n)
      : rahmen(GROESSE / 2 - hoehe - 60, 10) + rahmen(GROESSE / 2 + 60, n - 10);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GROESSE} ${GROESSE}" width="${GROESSE}" height="${GROESSE}">` +
    `<rect width="${GROESSE}" height="${GROESSE}" fill="${HINTERGRUND}"/>` +
    rahmenInhalt +
    `</svg>`
  );
}

/** Chrome on a Mac unless `CHROME_PATH` names another one. */
export const CHROME_STANDARD =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * SVG → PNG bytes with headless Chrome (no image library in the repo). A
 * missing Chrome throws: a local tool, run by a person, not by the server.
 */
export async function svgZuPng(
  svg: string,
  chrome: string = process.env.CHROME_PATH ?? CHROME_STANDARD,
): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'daf-zahl-'));
  const html = join(dir, 'bild.html');
  const png = join(dir, 'bild.png');
  try {
    await writeFile(
      html,
      `<!doctype html><html><body style="margin:0">${svg}</body></html>`,
    );
    await execFileAsync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${GROESSE},${GROESSE}`,
      `--screenshot=${png}`,
      `file://${html}`,
    ]);
    return await readFile(png);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
