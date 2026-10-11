import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** A RIFF/WAVE header: "RIFF", four size bytes, "WAVE". */
export function istWav(bytes: Buffer): boolean {
  return (
    bytes.length >= 12 &&
    bytes.toString('latin1', 0, 4) === 'RIFF' &&
    bytes.toString('latin1', 8, 12) === 'WAVE'
  );
}

/**
 * Gemini 3.8 answers with WAV (ADR-0085); every dialog file on R2 and in
 * the players is mp3. A WAV is re-encoded at 128 kbit/s, anything else is
 * returned untouched. A failed encode throws: a WAV stored under an .mp3
 * key would play in some browsers and not in others.
 */
export async function zuMp3(bytes: Buffer): Promise<Buffer> {
  if (!istWav(bytes)) return bytes;
  const dir = await mkdtemp(join(tmpdir(), 'daf-mp3-'));
  const kirish = join(dir, 'kirish.wav');
  const chiqish = join(dir, 'chiqish.mp3');
  try {
    await writeFile(kirish, bytes);
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-i',
        kirish,
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '128k',
        chiqish,
      ]);
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      throw new Error(
        `ffmpeg WAV ni mp3 ga o'tkaza olmadi: ${e.stderr?.trim() || e.message}`,
      );
    }
    return await readFile(chiqish);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
