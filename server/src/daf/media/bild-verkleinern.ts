import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * A picture is shown at about 150 px, and one picture question carries four
 * of them: the model's 1024 px files would spend a phone's data for nothing,
 * so every picture is stored at 512 px.
 */
export const BILD_PX = 512;

/** ffmpeg arguments: scale to a px square, JPEG quality 4. Pure. */
export function bildFfmpegArgs(
  eingabe: string,
  ausgabe: string,
  px: number,
): string[] {
  return [
    '-i',
    eingabe,
    '-vf',
    `scale=${px}:${px}`,
    '-q:v',
    '4',
    '-y',
    ausgabe,
  ];
}

/**
 * Shrinks picture bytes to a `px` square JPEG. Like `verlangsameMp3`, a
 * missing or failing ffmpeg throws: returning the original bytes would
 * store a full-size picture as if it were finished.
 */
export async function verkleinereBild(
  eingabe: Buffer,
  px: number = BILD_PX,
): Promise<Buffer> {
  if (!Number.isInteger(px) || px <= 0) {
    throw new Error(`Rasm o'lchami musbat butun son bo'lishi kerak: ${px}`);
  }
  const dir = await mkdtemp(join(tmpdir(), 'daf-bild-'));
  const kirishYoli = join(dir, 'kirish.jpg');
  const chiqishYoli = join(dir, 'chiqish.jpg');
  try {
    await writeFile(kirishYoli, eingabe);
    try {
      await execFileAsync(
        'ffmpeg',
        bildFfmpegArgs(kirishYoli, chiqishYoli, px),
      );
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      const tafsilot = e.stderr?.trim() || e.message;
      throw new Error(`ffmpeg rasmni kichraytira olmadi: ${tafsilot}`);
    }
    return await readFile(chiqishYoli);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
