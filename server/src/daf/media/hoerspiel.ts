import { createHash } from 'crypto';

/**
 * Realistic dialog audio («hayotiy ovoz», CEO 06.10.2026): the Gemini
 * dialog is cut at the speaker turns, a line spoken from another room is
 * filtered to sound far away, sound effects go between the lines and a
 * room tone loops under everything. This file is the pure part (plans and
 * ffmpeg arguments); `hoerspiel-mix.ts` runs ffmpeg and whisper.
 *
 * Where a line starts and ends is not guessed from silences alone: a pause
 * inside a line ("Hm... Käse, Butter...") can be longer than the gap between
 * two speakers. whisper.cpp gives every word a time, the words are aligned
 * to the script, and only then is the cut snapped to the nearest silence.
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
}

export interface Wort {
  text: string;
  from: number;
  to: number;
}

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
  return probleme;
}

/** whisper-cli `-ml 1 -sow -oj` JSON → words with times in seconds. */
export function whisperWoerter(json: {
  transcription: Array<{ offsets: { from: number; to: number }; text: string }>;
}): Wort[] {
  return json.transcription
    .map((t) => ({
      text: t.text.trim(),
      from: t.offsets.from / 1000,
      to: t.offsets.to / 1000,
    }))
    .filter((x) => x.text !== '');
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

/**
 * Aligns the script's words to the heard words (edit-distance alignment,
 * misheard and extra words allowed) and returns each line's first start and
 * last end. A line with no word matched is a broken recording: refuse.
 */
export function zeilenSpannen(zeilen: string[], woerter: Wort[]): Spanne[] {
  const soll: Array<{ w: string; zeile: number }> = [];
  zeilen.forEach((z, i) => {
    for (const t of z.split(/\s+/)) {
      const n = norm(t);
      if (n) soll.push({ w: n, zeile: i });
    }
  });
  const ist = woerter.map((x) => norm(x.text));
  const m = soll.length;
  const n = ist.length;
  // dp[i][j]: cost of aligning soll[0..i) with ist[0..j)
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) dp[i][0] = i;
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const passt = aehnlich(soll[i - 1].w, ist[j - 1]) ? 0 : 2;
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + passt,
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
      );
    }
  }
  const spannen: Array<Spanne | null> = zeilen.map(() => null);
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    const kosten = aehnlich(soll[i - 1].w, ist[j - 1]) ? 0 : 2;
    // A diagonal step places the heard word in that line even when it was
    // misheard: a one-word line ("Danke!" heard as "Gankke") must not lose
    // its place.
    if (dp[i][j] === dp[i - 1][j - 1] + kosten) {
      const z = soll[i - 1].zeile;
      const wort = woerter[j - 1];
      const s = spannen[z];
      spannen[z] = s
        ? {
            start: Math.min(s.start, wort.from),
            ende: Math.max(s.ende, wort.to),
          }
        : { start: wort.from, ende: wort.to };
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j] + 1) {
      i--;
    } else if (dp[i][j] === dp[i][j - 1] + 1) {
      j--;
    } else {
      i--;
      j--;
    }
  }
  return spannen.map((s, k) => {
    if (!s) throw new Error(`${k + 1}-satr ovozda topilmadi`);
    return s;
  });
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

/**
 * One cut between every two lines: the middle of the silence that best
 * covers the gap whisper heard, else the middle of that gap.
 */
export function schnitte(spannen: Spanne[], stille: Spanne[]): number[] {
  const cuts: number[] = [];
  for (let k = 1; k < spannen.length; k++) {
    const von = spannen[k - 1].ende - 0.3;
    const bis = spannen[k].start + 0.3;
    let best: Spanne | null = null;
    let bestUeberlappung = 0;
    for (const s of stille) {
      const u = Math.min(bis, s.ende) - Math.max(von, s.start);
      if (u > bestUeberlappung) {
        best = s;
        bestUeberlappung = u;
      }
    }
    const cut = best
      ? (best.start + best.ende) / 2
      : (spannen[k - 1].ende + spannen[k].start) / 2;
    cuts.push(r3(Math.max(cut, cuts[cuts.length - 1] ?? 0)));
  }
  return cuts;
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
