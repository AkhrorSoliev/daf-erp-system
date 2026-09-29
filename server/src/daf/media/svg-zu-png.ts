import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Code-drawn pictures are 1024 px squares, like the model's, then shrunk. */
export const SVG_GROESSE = 1024;

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
  const dir = await mkdtemp(join(tmpdir(), 'daf-svg-'));
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
      `--window-size=${SVG_GROESSE},${SVG_GROESSE}`,
      `--screenshot=${png}`,
      `file://${html}`,
    ]);
    return await readFile(png);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
