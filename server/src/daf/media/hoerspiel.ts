import { createHash } from 'crypto';

/**
 * Realistic dialog audio («hayotiy ovoz», CEO 06.10.2026): the Gemini
 * dialog is cut at the speaker turns, a line spoken from another room is
 * filtered to sound far away, sound effects go between the lines and a
 * room tone loops under everything. This file is the pure part (plans and
 * ffmpeg arguments); `hoerspiel-mix.ts` runs ffmpeg and whisper.
 *
 * Where a line starts and ends: the recording is split into speech pieces at
 * every silence, whisper.cpp transcribes each piece on its own, and the
 * pieces are grouped into the script's lines (every line gets at least one
 * piece, the grouping whose words fit the script best wins). A pause inside
 * a line only makes that line two pieces, and two speakers saying the same
 * words in a row («Guten Tag!» — «Guten Tag!») stay two pieces, which a
 * transcript of the whole dialog merged into one. Every cut is therefore in
 * a silence.
 */

/** One sound effect placed before line `vor` (1-based; N+1 = after the last). */
export interface Geraeusch {
  vor: number;
  sfx: string;
  sek: number;
  lautstaerke?: number;
}

/** `dialog-regie.json` → `hoerspiel`: optional per dialog. */
export interface HoerspielRegie {
  atmo?: { sfx: string; sek: number; lautstaerke?: number };
  geraeusche?: Geraeusch[];
  /** 1-based lines spoken from another room. */
  fern?: number[];
  /**
   * Playback speed of the voices, applied to the raw recording before the
   * mix (ffmpeg atempo, pitch kept). CEO 2026-10-11: 0.9 for the Gemini 3.8
   * dialogs — slowed locally, not by asking the model to speak slower.
   */
  tempo?: number;
}

export const TEMPO_MIN_DIALOG = 0.8;
export const TEMPO_MAX_DIALOG = 1;

export interface Spanne {
  start: number;
  ende: number;
}

/** Heard in sample 1 (06.10): another room, behind a door. */
export const FERN_FILTER =
  'highpass=f=250,lowpass=f=2300,aecho=0.8:0.7:40|80:0.35|0.25,volume=0.45';
export const ATMO_LAUTSTAERKE = 0.12;
export const GERAEUSCH_LAUTSTAERKE = 0.7;
/** Same lead-in and tail as every course dialog (`audio-polster.ts`). */
export const VORLAUF = 0.7;
export const NACHLAUF = 1.0;
/** Breath between an effect and the next line. */
export const LUFT = 0.2;
/** ElevenLabs sound effects v2 limits. */
export const SFX_MIN_SEK = 0.5;
export const SFX_MAX_SEK = 22;

const sha16 = (s: string) =>
  createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Cache key of one generated sound: the same request is paid once. */
export function geraeuschId(g: {
  sfx: string;
  sek: number;
  loop?: boolean;
}): string {
  return sha16(JSON.stringify([g.sfx.trim(), g.sek, g.loop === true]));
}

/** Changes whenever any direction of the mix changes (manifest check). */
export function hoerspielHash(h: HoerspielRegie): string {
  return sha16(JSON.stringify(h));
}

export function pruefeHoerspiel(h: HoerspielRegie, zeilen: number): string[] {
  const probleme: string[] = [];
  const sfxOk = (sfx: string, sek: number, wo: string) => {
    if (!sfx.trim() || sfx.length > 450) {
      probleme.push(`${wo}: effekt matni bo'sh yoki 450 belgidan uzun`);
    }
    if (!(sek >= SFX_MIN_SEK && sek <= SFX_MAX_SEK)) {
      probleme.push(
        `${wo}: davomiylik ${sek} s (${SFX_MIN_SEK}–${SFX_MAX_SEK})`,
      );
    }
  };
  if (h.atmo) sfxOk(h.atmo.sfx, h.atmo.sek, 'atmo');
  for (const g of h.geraeusche ?? []) {
    if (!Number.isInteger(g.vor) || g.vor < 1 || g.vor > zeilen + 1) {
      probleme.push(`effekt «${g.sfx}»: vor=${g.vor} (1–${zeilen + 1})`);
    }
    sfxOk(g.sfx, g.sek, `effekt «${g.sfx}»`);
  }
  for (const n of h.fern ?? []) {
    if (!Number.isInteger(n) || n < 1 || n > zeilen) {
      probleme.push(`fern: ${n}-satr yo'q (1–${zeilen})`);
    }
  }
  if (
    h.tempo !== undefined &&
    !(h.tempo >= TEMPO_MIN_DIALOG && h.tempo <= TEMPO_MAX_DIALOG)
  ) {
    probleme.push(`tempo ${h.tempo} (${TEMPO_MIN_DIALOG}–${TEMPO_MAX_DIALOG})`);
  }
  return probleme;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

function aehnlich(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  // One letter off (Halo/Hallo, Brötchen/Brötschen) still counts.
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  let ea = a.length - 1;
  let eb = b.length - 1;
  while (ea >= i && eb >= i && a[ea] === b[eb]) {
    ea--;
    eb--;
  }
  return Math.max(ea - i + 1, eb - i + 1) <= 1;
}

/** ffmpeg `silencedetect` stderr → silences. */
export function parseStille(stderr: string): Spanne[] {
  const out: Spanne[] = [];
  let start: number | null = null;
  for (const line of stderr.split('\n')) {
    const s = /silence_start: (-?[\d.]+)/.exec(line);
    if (s) start = Math.max(0, Number(s[1]));
    const e = /silence_end: ([\d.]+)/.exec(line);
    if (e && start !== null) {
      out.push({ start, ende: Number(e[1]) });
      start = null;
    }
  }
  return out;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Speech between the silences; a burst under 0.08 s is a click, not speech. */
export function sprachStuecke(stille: Spanne[], dauer: number): Spanne[] {
  const out: Spanne[] = [];
  let t = 0;
  for (const st of [...stille].sort((x, y) => x.start - y.start)) {
    if (st.start - t >= 0.08) out.push({ start: r3(t), ende: r3(st.start) });
    t = Math.max(t, st.ende);
  }
  if (dauer - t >= 0.08) out.push({ start: r3(t), ende: r3(dauer) });
  return out;
}

export interface Stueck extends Spanne {
  /** whisper's transcript of this piece alone */
  text: string;
}

const woerterVon = (s: string) =>
  s
    .split(/\s+/)
    .map(norm)
    .filter((w) => w !== '');

/** Word edit distance; a misheard word costs as much as a missing one. */
function wortAbstand(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (aehnlich(a[i - 1], b[j - 1]) ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Groups the pieces into the lines and returns the cut times, one between
 * every two lines, in the middle of the silence that separates them.
 */
export function teileZeilen(zeilen: string[], stuecke: Stueck[]): number[] {
  const n = zeilen.length;
  const m = stuecke.length;
  if (m < n) {
    throw new Error(
      `ovozda ${m} ta bo'lak, dialogda ${n} ta satr — har satrga bo'lak yetmaydi`,
    );
  }
  const soll = zeilen.map(woerterVon);
  const ist = stuecke.map((s) => woerterVon(s.text));
  const gruppe = (j: number, k: number) => ist.slice(j, k).flat();
  // best[i][k]: lowest cost of the first i lines over the first k pieces.
  const best = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(Infinity),
  );
  const von = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(-1),
  );
  best[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let k = i; k <= m - (n - i); k++) {
      for (let j = i - 1; j < k; j++) {
        if (best[i - 1][j] === Infinity) continue;
        const c = best[i - 1][j] + wortAbstand(soll[i - 1], gruppe(j, k));
        if (c < best[i][k]) {
          best[i][k] = c;
          von[i][k] = j;
        }
      }
    }
  }
  const grenzen: number[] = [m];
  for (let i = n, k = m; i > 0; i--) {
    k = von[i][k];
    grenzen.unshift(k);
  }
  for (let i = 0; i < n; i++) {
    const w = gruppe(grenzen[i], grenzen[i + 1]);
    const treffer = soll[i].some((x) => w.some((y) => aehnlich(x, y)));
    if (!treffer && soll[i].length > 1) {
      throw new Error(`${i + 1}-satr ovozda topilmadi`);
    }
  }
  return grenzen
    .slice(1, -1)
    .map((g) => r3((stuecke[g - 1].ende + stuecke[g].start) / 2));
}

export interface Clip {
  /** 'roh' = the dialog itself; otherwise a sound's `geraeuschId`. */
  quelle: string;
  von: number;
  bis: number;
  at: number;
  fern: boolean;
  lautstaerke: number;
}

export interface MischPlan {
  clips: Clip[];
  gesamt: number;
  atmo: { id: string; lautstaerke: number } | null;
}

export function mischPlan(input: {
  dauer: number;
  schnitte: number[];
  regie: HoerspielRegie;
  geraeuschDauer: Map<string, number>;
}): MischPlan {
  const { dauer, regie } = input;
  const grenzen = [0, ...input.schnitte, dauer];
  const fern = new Set(regie.fern ?? []);
  const clips: Clip[] = [];
  let t = VORLAUF;
  const effekte = (vor: number) => {
    for (const g of (regie.geraeusche ?? []).filter((x) => x.vor === vor)) {
      const id = geraeuschId(g);
      const d = input.geraeuschDauer.get(id) ?? g.sek;
      clips.push({
        quelle: id,
        von: 0,
        bis: d,
        at: r3(t),
        fern: false,
        lautstaerke: g.lautstaerke ?? GERAEUSCH_LAUTSTAERKE,
      });
      t += d + LUFT;
    }
  };
  for (let k = 1; k < grenzen.length; k++) {
    effekte(k);
    clips.push({
      quelle: 'roh',
      von: grenzen[k - 1],
      bis: grenzen[k],
      at: r3(t),
      fern: fern.has(k),
      lautstaerke: 1,
    });
    t += grenzen[k] - grenzen[k - 1];
  }
  effekte(grenzen.length);
  return {
    clips,
    gesamt: r3(t + NACHLAUF),
    atmo: regie.atmo
      ? {
          id: geraeuschId({ ...regie.atmo, loop: true }),
          lautstaerke: regie.atmo.lautstaerke ?? ATMO_LAUTSTAERKE,
        }
      : null,
  };
}

/**
 * One ffmpeg call: each clip trimmed, resampled to stereo 44.1 kHz,
 * filtered if far, placed with `adelay`, all mixed over the looped room
 * tone, then loudness-normalised (−16 LUFS) and encoded as mp3.
 */
export function mischFfmpegArgs(
  plan: MischPlan,
  dateien: { roh: string; geraeusche: Map<string, string>; ausgabe: string },
): string[] {
  const args: string[] = ['-y', '-i', dateien.roh];
  const index = new Map<string, number>();
  const datei = (id: string) => {
    const d = dateien.geraeusche.get(id);
    if (!d) throw new Error(`effekt fayli yo'q: ${id}`);
    return d;
  };
  for (const c of plan.clips) {
    if (c.quelle === 'roh' || index.has(c.quelle)) continue;
    index.set(c.quelle, index.size + 1);
    args.push('-i', datei(c.quelle));
  }
  let atmoIndex = -1;
  if (plan.atmo) {
    atmoIndex = index.size + 1;
    args.push('-stream_loop', '-1', '-i', datei(plan.atmo.id));
  }
  const fmt = 'aresample=44100,aformat=channel_layouts=stereo';
  const teile: string[] = [];
  const marken: string[] = [];
  plan.clips.forEach((c, n) => {
    const i = c.quelle === 'roh' ? 0 : index.get(c.quelle)!;
    const ms = Math.round(c.at * 1000);
    const f = [
      `atrim=start=${c.von}:end=${c.bis}`,
      'asetpts=PTS-STARTPTS',
      fmt,
      ...(c.fern ? [FERN_FILTER] : []),
      ...(c.lautstaerke !== 1 ? [`volume=${c.lautstaerke}`] : []),
      `adelay=${ms}|${ms}`,
    ].join(',');
    teile.push(`[${i}:a]${f}[c${n}]`);
    marken.push(`[c${n}]`);
  });
  if (plan.atmo) {
    const ende = plan.gesamt;
    teile.push(
      `[${atmoIndex}:a]atrim=end=${ende},asetpts=PTS-STARTPTS,${fmt},` +
        `volume=${plan.atmo.lautstaerke},afade=t=in:d=0.5,` +
        `afade=t=out:st=${r3(Math.max(0, ende - 1))}:d=1[atmo]`,
    );
    marken.push('[atmo]');
  }
  teile.push(
    `${marken.join('')}amix=inputs=${marken.length}:normalize=0:duration=longest,` +
      `apad=whole_dur=${plan.gesamt},atrim=end=${plan.gesamt},` +
      'loudnorm=I=-16:TP=-1.5:LRA=11[out]',
  );
  args.push(
    '-filter_complex',
    teile.join(';'),
    '-map',
    '[out]',
    '-ar',
    '44100',
    '-c:a',
    'libmp3lame',
    '-q:a',
    '2',
    dateien.ausgabe,
  );
  return args;
}
