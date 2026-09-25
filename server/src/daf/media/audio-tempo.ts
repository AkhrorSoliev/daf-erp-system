import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * The range a single ffmpeg `atempo` filter accepts. Outside it the filter
 * has to be chained; nothing here needs that, so a value outside is a mistake.
 */
export const TEMPO_MIN = 0.5;
export const TEMPO_MAX = 2;

/**
 * ffmpeg arguments that change the speed without changing the pitch. Pure.
 *
 * Mono, 44.1 kHz, 128k mp3 is exactly what the CEO listened to in the
 * voice test of 2026-09-25, so the course files come out the same way.
 */
export function tempoFfmpegArgs(
  eingabe: string,
  ausgabe: string,
  faktor: number,
): string[] {
  return [
    '-i',
    eingabe,
    '-af',
    `atempo=${faktor}`,
    '-ac',
    '1',
    '-ar',
    '44100',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    '-y',
    ausgabe,
  ];
}

/**
 * Plays mp3 bytes at `faktor` of their speed, pitch unchanged. The course
 * word voice (Gemini TTS) has no speed setting and the course speaks slowly
 * (0.85), so the word script runs every clip through this.
 *
 * Like `polstereMp3`, a missing or failing ffmpeg throws. Returning the
 * original bytes instead would store a clip at the wrong speed as if it
 * were finished.
 */
export async function verlangsameMp3(
  eingabe: Buffer,
  faktor: number,
): Promise<Buffer> {
  if (!Number.isFinite(faktor) || faktor < TEMPO_MIN || faktor > TEMPO_MAX) {
    throw new Error(
      `Tezlik ${faktor} ffmpeg atempo oralig'idan tashqarida: ${TEMPO_MIN}–${TEMPO_MAX}.`,
    );
  }
  const dir = await mkdtemp(join(tmpdir(), 'daf-tempo-'));
  const kirishYoli = join(dir, 'kirish.mp3');
  const chiqishYoli = join(dir, 'chiqish.mp3');
  try {
    await writeFile(kirishYoli, eingabe);
    try {
      await execFileAsync(
        'ffmpeg',
        tempoFfmpegArgs(kirishYoli, chiqishYoli, faktor),
      );
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      const tafsilot = e.stderr?.trim() || e.message;
      throw new Error(`ffmpeg tezlikni o'zgartira olmadi: ${tafsilot}`);
    }
    return await readFile(chiqishYoli);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
