import { execFile } from 'child_process';
import { homedir } from 'os';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import {
  mischFfmpegArgs,
  mischPlan,
  parseStille,
  schnitte,
  whisperWoerter,
  zeilenSpannen,
  type HoerspielRegie,
} from './hoerspiel';

const run = promisify(execFile);

/** Offline whisper.cpp model on this Mac; runs locally, costs nothing. */
export const WHISPER_MODELL =
  process.env.WHISPER_MODEL ??
  join(homedir(), 'whisper-models', 'ggml-small.bin');

async function tool(cmd: string, args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await run(cmd, args, {
      maxBuffer: 64 * 1024 * 1024,
    });
    return `${stdout}\n${stderr}`;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    throw new Error(`${cmd} ishlamadi: ${e.stderr?.trim() || e.message}`);
  }
}

export async function dauerSek(datei: string): Promise<number> {
  const out = await tool('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    datei,
  ]);
  const d = Number(out.trim().split('\n')[0]);
  if (!(d > 0)) throw new Error(`davomiylik o'qilmadi: ${datei}`);
  return d;
}

/**
 * Turns one raw Gemini dialog into the realistic version. Every step is
 * local (ffmpeg, whisper.cpp); nothing here is paid. A line whisper cannot
 * find stops the mix with an error instead of cutting in the wrong place.
 */
export async function mischeHoerspiel(input: {
  roh: Buffer;
  zeilen: string[];
  regie: HoerspielRegie;
  /** geraeuschId → local mp3 */
  geraeusche: Map<string, string>;
}): Promise<{ mp3: Buffer; schnitte: number[] }> {
  const dir = await mkdtemp(join(tmpdir(), 'daf-hoerspiel-'));
  try {
    const roh = join(dir, 'roh.mp3');
    await writeFile(roh, input.roh);
    const dauer = await dauerSek(roh);

    const wav = join(dir, 'roh.wav');
    await tool('ffmpeg', ['-y', '-i', roh, '-ar', '16000', '-ac', '1', wav]);
    await tool('whisper-cli', [
      '-m',
      WHISPER_MODELL,
      '-l',
      'de',
      '-ml',
      '1',
      '-sow',
      '-oj',
      '-of',
      join(dir, 'roh'),
      '-np',
      '-f',
      wav,
    ]);
    const json = JSON.parse(await readFile(join(dir, 'roh.json'), 'utf8'));
    const spannen = zeilenSpannen(input.zeilen, whisperWoerter(json));

    const still = await tool('ffmpeg', [
      '-i',
      roh,
      '-af',
      'silencedetect=noise=-38dB:d=0.18',
      '-f',
      'null',
      '-',
    ]);
    const cuts = schnitte(spannen, parseStille(still));

    const geraeuschDauer = new Map<string, number>();
    for (const [id, datei] of input.geraeusche) {
      geraeuschDauer.set(id, await dauerSek(datei));
    }
    const plan = mischPlan({
      dauer,
      schnitte: cuts,
      regie: input.regie,
      geraeuschDauer,
    });
    const ausgabe = join(dir, 'hoerspiel.mp3');
    await tool(
      'ffmpeg',
      mischFfmpegArgs(plan, {
        roh,
        geraeusche: input.geraeusche,
        ausgabe,
      }),
    );
    return { mp3: await readFile(ausgabe), schnitte: cuts };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
