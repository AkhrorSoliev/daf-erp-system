import type { GeminiDialog } from './fal-client';

/**
 * Gemini's dialogue mode takes exactly two voices (fal answered 422 for a
 * third, 10.10.2026), but a restaurant scene has a waiter and two guests.
 * The two speakers with the most lines are voiced together, so their turns
 * still answer each other; every line of another speaker is voiced alone in
 * that speaker's voice. The pieces are put back in the script's order
 * afterwards (`setzeZusammen` in `hoerspiel-mix.ts`).
 */
export interface EinzelZeile {
  /** 0-based line of the dialog */
  index: number;
  /** "[tone] text", as in the dialogue prompt but without the speaker */
  prompt: string;
  voice: string;
  styleInstructions: string;
}

export type Platz = { haupt: number } | { einzeln: number };

export interface MehrstimmigerAuftrag {
  haupt: GeminiDialog;
  einzeln: EinzelZeile[];
  /** for every dialog line: its place in the main take, or a single line */
  reihenfolge: Platz[];
}

/**
 * `alleEinzeln`: every line is voiced alone, no main take. Used while
 * Gemini's two-voice dialogue mode is down (24.10.2026: 422 for every
 * request). Each request is billed with its style note, so the note is the
 * short pace line, not the whole scene.
 */
export const EINZEL_STIL =
  'Hochdeutsch aus Deutschland, langsam und sehr deutlich, wie in einer Hörübung für Anfänger (A1).';

export function teileMehrstimmig(
  anfrage: GeminiDialog,
  alleEinzeln = false,
): MehrstimmigerAuftrag {
  const zeilen = anfrage.prompt.split('\n').map((z) => {
    const i = z.indexOf(': ');
    return { sprecher: z.slice(0, i), rest: z.slice(i + 2), roh: z };
  });
  const anzahl = new Map<string, number>();
  for (const z of zeilen)
    anzahl.set(z.sprecher, (anzahl.get(z.sprecher) ?? 0) + 1);
  const reihe = anfrage.speakers.map((s) => s.speakerId);
  const zwei = alleEinzeln
    ? []
    : [...reihe]
        .sort(
          (a, b) =>
            (anzahl.get(b) ?? 0) - (anzahl.get(a) ?? 0) ||
            reihe.indexOf(a) - reihe.indexOf(b),
        )
        .slice(0, 2);
  const stimme = new Map(anfrage.speakers.map((s) => [s.speakerId, s.voice]));
  const hauptZeilen: string[] = [];
  const einzeln: EinzelZeile[] = [];
  const reihenfolge: Platz[] = [];
  zeilen.forEach((z, index) => {
    if (zwei.includes(z.sprecher)) {
      reihenfolge.push({ haupt: hauptZeilen.length });
      hauptZeilen.push(z.roh);
    } else {
      reihenfolge.push({ einzeln: index });
      einzeln.push({
        index,
        prompt: z.rest,
        voice: stimme.get(z.sprecher)!,
        styleInstructions: alleEinzeln
          ? EINZEL_STIL
          : anfrage.styleInstructions,
      });
    }
  });
  return {
    haupt: {
      prompt: hauptZeilen.join('\n'),
      speakers: anfrage.speakers.filter((s) => zwei.includes(s.speakerId)),
      styleInstructions: anfrage.styleInstructions,
    },
    einzeln,
    reihenfolge,
  };
}

const FMT = 'aresample=24000,aformat=channel_layouts=mono';
// A single line is cut to its speech and given a breath on both sides, the
// gap the main take already has between its turns.
const EINZEL =
  'silenceremove=start_periods=1:start_threshold=-45dB,areverse,' +
  'silenceremove=start_periods=1:start_threshold=-45dB,areverse,' +
  'adelay=250|250,apad=pad_dur=0.25';

/** One ffmpeg call that rebuilds the dialog in the script's order. */
export function zusammenFfmpegArgs(input: {
  reihenfolge: Platz[];
  /** cuts between the main take's lines */
  schnitte: number[];
  dauer: number;
  haupt: string;
  einzeln: Map<number, string>;
  ausgabe: string;
}): string[] {
  const hatHaupt = input.reihenfolge.some((p) => 'haupt' in p);
  const args = hatHaupt ? ['-y', '-i', input.haupt] : ['-y'];
  const index = new Map<number, number>();
  for (const p of input.reihenfolge) {
    if ('einzeln' in p) {
      const datei = input.einzeln.get(p.einzeln);
      if (!datei) throw new Error(`${p.einzeln + 1}-satr ovozi yo'q`);
      index.set(p.einzeln, index.size + (hatHaupt ? 1 : 0));
      args.push('-i', datei);
    }
  }
  const grenzen = [0, ...input.schnitte, input.dauer];
  const teile = input.reihenfolge.map((p, k) =>
    'haupt' in p
      ? `[0:a]atrim=start=${grenzen[p.haupt]}:end=${grenzen[p.haupt + 1]},asetpts=PTS-STARTPTS,${FMT}[p${k}]`
      : `[${index.get(p.einzeln)}:a]${EINZEL},${FMT}[p${k}]`,
  );
  const marken = input.reihenfolge.map((_, k) => `[p${k}]`).join('');
  teile.push(`${marken}concat=n=${input.reihenfolge.length}:v=0:a=1[out]`);
  return [
    ...args,
    '-filter_complex',
    teile.join(';'),
    '-map',
    '[out]',
    '-c:a',
    'libmp3lame',
    '-q:a',
    '2',
    input.ausgabe,
  ];
}

/** Billed characters: every request carries the scene again. */
export function zeichenMehrstimmig(t: MehrstimmigerAuftrag): number {
  return (
    t.haupt.prompt.length +
    t.haupt.styleInstructions.length +
    t.einzeln.reduce(
      (n, e) => n + e.prompt.length + e.styleInstructions.length,
      0,
    )
  );
}
