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
  sprachStuecke,
  teileZeilen,
  type HoerspielRegie,
  type Stueck,
} from './hoerspiel';
import { zusammenFfmpegArgs, type Platz } from './mehrstimmig';

const run = promisify(execFile);

/** Offline whisper.cpp model on this Mac; runs locally, costs nothing. */
export const WHISPER_MODELL =
  process.env.WHISPER_MODEL ??
  join(homedir(), 'whisper-models', 'ggml-small.bin');

/** Runs a local tool; `nurStdout` drops the log lines a tool writes to stderr. */
async function tool(
  cmd: string,
  args: string[],
  nurStdout = false,
): Promise<string> {
  try {
    const { stdout, stderr } = await run(cmd, args, {
      maxBuffer: 64 * 1024 * 1024,
    });
    return nurStdout ? stdout : `${stdout}\n${stderr}`;
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
 * The cut times between the lines of a raw dialog (see `teileZeilen`).
 * Exported for the cut check, which listens to every piece it produces.
 */
export async function findeSchnitte(
  dir: string,
  roh: string,
  dauer: number,
  zeilen: string[],
): Promise<number[]> {
  const still = await tool('ffmpeg', [
    '-i',
    roh,
    '-af',
    'silencedetect=noise=-38dB:d=0.18',
    '-f',
    'null',
    '-',
  ]);
  // Each piece of speech is transcribed alone, padded with silence so
  // whisper hears a short piece as speech.
  const stuecke: Stueck[] = [];
  for (const [i, p] of sprachStuecke(parseStille(still), dauer).entries()) {
    const wav = join(dir, `p${i}.wav`);
    await tool('ffmpeg', [
      '-y',
      '-ss',
      String(Math.max(0, p.start - 0.05)),
      '-to',
      String(p.ende + 0.05),
      '-i',
      roh,
      '-af',
      'adelay=400|400,apad=pad_dur=0.4',
      '-ar',
      '16000',
      '-ac',
      '1',
      wav,
    ]);
    const text = await tool(
      'whisper-cli',
      ['-m', WHISPER_MODELL, '-l', 'de', '-nt', '-np', '-f', wav],
      true,
    );
    stuecke.push({ ...p, text: text.replace(/\s+/g, ' ').trim() });
  }
  return teileZeilen(zeilen, stuecke);
}

/**
 * Turns one raw Gemini dialog into the realistic version. Every step is
 * local (ffmpeg, whisper.cpp); nothing here is paid. A line the pieces
 * cannot be matched to stops the mix with an error instead of cutting in
 * the wrong place.
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

    const cuts = await findeSchnitte(dir, roh, dauer, input.zeilen);

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

/**
 * A dialog of more than two speakers, rebuilt from its pieces: the main
 * take (the two busiest speakers) is cut at its turns and every single line
 * goes back into its place (`mehrstimmig.ts`). The result is one recording,
 * like any other dialog's.
 */
export async function setzeZusammen(input: {
  /** absent when every line was voiced alone */
  haupt?: Buffer;
  /** spoken text of the main take's lines, in order */
  hauptZeilen: string[];
  /** 0-based dialog line → its single-voice recording */
  einzeln: Map<number, Buffer>;
  reihenfolge: Platz[];
}): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'daf-mehrstimmig-'));
  try {
    const haupt = join(dir, 'haupt.mp3');
    let dauer = 0;
    let schnitte: number[] = [];
    if (input.haupt) {
      await writeFile(haupt, input.haupt);
      dauer = await dauerSek(haupt);
      schnitte = await findeSchnitte(dir, haupt, dauer, input.hauptZeilen);
    }
    const einzeln = new Map<number, string>();
    for (const [i, bytes] of input.einzeln) {
      const datei = join(dir, `e${i}.mp3`);
      await writeFile(datei, bytes);
      einzeln.set(i, datei);
    }
    const ausgabe = join(dir, 'dialog.mp3');
    await tool(
      'ffmpeg',
      zusammenFfmpegArgs({
        reihenfolge: input.reihenfolge,
        schnitte,
        dauer,
        haupt,
        einzeln,
        ausgabe,
      }),
    );
    return await readFile(ausgabe);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
