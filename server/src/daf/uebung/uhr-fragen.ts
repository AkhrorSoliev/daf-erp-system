import { BadRequestException } from '@nestjs/common';
import { mischen } from './dialog-fragen';
import {
  materialSchluessel,
  type Frage,
  type FrageFormat,
  type MaterialUhrzeit,
} from './frage.types';
import {
  gleicheUhr,
  informell,
  kanonisch,
  parseZeit,
  uhrAntworten,
  type Zeit,
} from './uhrzeit-text';
import type { MediaUrlResolver } from './wort-fragen';

/**
 * The clock exercises (unit 5, «Wie spät ist es?»). The clock face is drawn
 * by the client from `HH:MM`; the German words come from `uhrzeit-text.ts`.
 *
 * - `UHR_LESEN` — a clock; pick its time from four German texts.
 * - `UHR_HOEREN` — hear the time; pick its clock from four (`options` are
 *   `HH:MM`). Not built until the time has audio, like `AUDIO_WORT`.
 * - `UHR_TIPPEN` — a clock; type its time in German.
 *
 * A clock shows 12 hours, so the material holds hours 1–12 only; anything
 * else builds nothing (the seed refuses it too). Distractors are other
 * times, never another way of saying the same time: options are the taught
 * form of each time, and no form fits two times (`uhrzeit-text.spec.ts`).
 */

const UHR_FORMATE = new Set<FrageFormat>([
  'UHR_LESEN',
  'UHR_HOEREN',
  'UHR_TIPPEN',
]);

export function istUhrFormat(format: FrageFormat): boolean {
  return UHR_FORMATE.has(format);
}

/** The material's time, when it is a five-minute step on a clock face. */
function zifferblattZeit(zeit: string): Zeit | null {
  const z = parseZeit(zeit);
  if (!z || z.h < 1 || z.h > 12 || z.m % 5 !== 0) return null;
  return z;
}

function aufUhr(h: number, m: number): Zeit {
  const stunde = ((((h - 1) % 12) + 12) % 12) + 1;
  return { h: stunde, m: ((m % 60) + 60) % 60 };
}

/**
 * Three other times, each a mistake a beginner makes: the next or previous
 * hour («halb vier» read as 4:30), «nach» and «vor» swapped (3:15 / 3:45),
 * half an hour off («zehn vor halb vier» / «zehn vor vier»), the hands
 * swapped, five minutes off. All are five-minute steps; none shows the
 * same clock face as the target or as each other.
 */
export function uhrAblenker(ziel: Zeit, rnd: () => number): Zeit[] {
  const { h, m } = ziel;
  const kandidaten: Zeit[] = [
    aufUhr(h + 1, m),
    aufUhr(h - 1, m),
    aufUhr(h, 60 - m),
    aufUhr(h, m + 30),
    aufUhr(m === 0 ? 12 : m / 5, (h % 12) * 5),
    aufUhr(h, m + 5),
    aufUhr(h, m - 5),
  ];
  const out: Zeit[] = [];
  for (const k of mischen(kandidaten, rnd)) {
    if ([ziel, ...out].some((z) => gleicheUhr(z, k))) continue;
    out.push(k);
    if (out.length === 3) break;
  }
  return out;
}

function grundFrage(
  format: FrageFormat,
  u: MaterialUhrzeit,
): Pick<Frage, 'format' | 'itemType' | 'itemId' | 'hilfe' | 'belegteItems'> {
  return {
    format,
    itemType: 'UHRZEIT',
    itemId: u.id,
    hilfe: null,
    belegteItems: [materialSchluessel('UHRZEIT', u.id)],
  };
}

export function uhrLesen(u: MaterialUhrzeit, rnd: () => number): Frage | null {
  const z = zifferblattZeit(u.zeit);
  if (!z) return null;
  const richtig = informell(z.h, z.m)[0];
  const falsch = uhrAblenker(z, rnd).map((a) => informell(a.h, a.m)[0]);
  return {
    ...grundFrage('UHR_LESEN', u),
    prompt: '',
    options: mischen([richtig, ...falsch], rnd),
    richtig,
    akzeptiert: [],
    audioUrl: null,
    uhrzeit: kanonisch(z.h, z.m),
  };
}

export function uhrHoeren(
  u: MaterialUhrzeit,
  rnd: () => number,
  mediaUrl: MediaUrlResolver,
): Frage | null {
  const z = zifferblattZeit(u.zeit);
  if (!z || !u.audioKey) return null;
  // No public R2 URL is the same as no audio: the question is not built.
  const audioUrl = mediaUrl(u.audioKey);
  if (!audioUrl) return null;
  const richtig = kanonisch(z.h, z.m);
  const falsch = uhrAblenker(z, rnd).map((a) => kanonisch(a.h, a.m));
  return {
    ...grundFrage('UHR_HOEREN', u),
    // EMPTY, and no `uhrzeit`: either would give the answer away.
    prompt: '',
    options: mischen([richtig, ...falsch], rnd),
    richtig,
    akzeptiert: [],
    audioUrl,
  };
}

export function uhrTippen(u: MaterialUhrzeit): Frage | null {
  const z = zifferblattZeit(u.zeit);
  if (!z) return null;
  return {
    ...grundFrage('UHR_TIPPEN', u),
    prompt: '',
    options: [],
    richtig: informell(z.h, z.m)[0],
    akzeptiert: [],
    audioUrl: null,
    uhrzeit: kanonisch(z.h, z.m),
  };
}

/**
 * The material `pruefen` checks a typed or chosen German time against
 * (`richtigeAntwort` reads `de` and `akzeptiert`): the taught form and
 * every other correct one.
 */
export function uhrMaterial(zeit: string): {
  de: string;
  uz: string;
  akzeptiert: string[];
} {
  const z = zifferblattZeit(zeit);
  if (!z) throw new BadRequestException(`Soat vaqti noto'g'ri: ${zeit}`);
  const { richtig, akzeptiert } = uhrAntworten(z.h, z.m);
  return { de: richtig, uz: '', akzeptiert };
}

/**
 * `UHR_HOEREN`: the picked clock (`HH:MM`) against the stored time, by the
 * clock face. `loesungWort` — the words that were heard, sent after the
 * answer so the student learns them.
 */
export function uhrHoerenAntwort(
  zeit: string,
  given: string,
): { isCorrect: boolean; richtig: string; loesungWort: string } {
  const z = zifferblattZeit(zeit);
  if (!z) throw new BadRequestException(`Soat vaqti noto'g'ri: ${zeit}`);
  const g = parseZeit(given);
  return {
    isCorrect: g !== null && gleicheUhr(g, z),
    richtig: kanonisch(z.h, z.m),
    loesungWort: informell(z.h, z.m)[0],
  };
}
