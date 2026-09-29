import { editAbstand, normalisieren } from './antwort';
import type { MaterialWort } from './frage.types';

/**
 * Wrong options for word questions (2026-09-30).
 *
 * Picked at random from the section they made most choice questions trivial:
 * first-try accuracy on production was 92–98% (21–29.09), because "drei"
 * stood beside "hallo", "Bahnhof" and "danke". Now a distractor is, in this
 * order:
 * 1. never a second right answer — no word whose Uzbek meaning overlaps
 *    the answer's (`bedeutungUeberlappt`), for questions about meaning;
 * 2. of the same kind — a number beside numbers, a noun beside nouns;
 * 3. for questions whose options are German (`aehnlich`), close in spelling —
 *    "dreißig" beside "drei", "vierzig" beside "vier".
 * Chance stays: three are drawn from the best `fenster`.
 */

export type WortArt =
  | 'BUCHSTABE'
  | 'ZAHL'
  | 'NOMEN'
  | 'VERB'
  | 'PHRASE'
  | 'SONST';

type WortFelder = Pick<MaterialWort, 'de' | 'uz' | 'artikel' | 'anzeige'>;

/** One letter of the alphabet (u01-s5): only listening can ask it. */
export function istBuchstabe(w: Pick<MaterialWort, 'de'>): boolean {
  return /^\p{L}$/u.test(w.de.trim());
}

/** The Uzbek meaning without the note in brackets: "yurmoq (piyoda bormoq)" → "yurmoq". */
function kern(uz: string): string {
  return uz.replace(/\([^)]*\)/g, ' ').trim();
}

export function wortArt(w: WortFelder): WortArt {
  if (istBuchstabe(w)) return 'BUCHSTABE';
  if (w.anzeige && /^\d+$/.test(w.anzeige)) return 'ZAHL';
  if (w.artikel) return 'NOMEN';
  if (/moq$/.test(kern(w.uz))) return 'VERB';
  if (/\s/.test(w.de.trim())) return 'PHRASE';
  return 'SONST';
}

function woerterVon(uz: string): Set<string> {
  return new Set(
    kern(uz)
      .toLowerCase()
      .split(/[^\p{L}\p{N}'ʻ’-]+/u)
      .map((t) => t.replace(/^-+|-+$/g, ''))
      .filter(Boolean),
  );
}

/**
 * One meaning contains the other ("o'qituvchi" / "o'qituvchi ayol",
 * "-da" / "-da, oldida", "xayr" / "xayr"): offering one beside the other
 * would make a second answer right. The note in brackets does not count —
 * it is what tells such words apart for a reader, not for a learner.
 */
export function bedeutungUeberlappt(a: string, b: string): boolean {
  const wa = woerterVon(a);
  const wb = woerterVon(b);
  if (wa.size === 0 || wb.size === 0) return false;
  const teil = (x: Set<string>, y: Set<string>) =>
    [...x].every((t) => y.has(t));
  return teil(wa, wb) || teil(wb, wa);
}

export interface AblenkerOptionen<T> {
  /** The text shown as the option — no two options may read the same. */
  feld: (w: T) => string;
  /** Options are German: rank by closeness in spelling. */
  aehnlich: boolean;
  /** The question is about meaning: leave out overlapping meanings. */
  bedeutung: boolean;
  rnd: () => number;
  anzahl?: number;
  /** How many of the best to draw from. */
  fenster?: number;
}

function mischen<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function abstand(a: string, b: string): number {
  const x = normalisieren(a);
  const y = normalisieren(b);
  return editAbstand(x, y) / Math.max(x.length, y.length, 1);
}

/**
 * `anzahl` distractors for `ziel`, or `null` when the pool cannot give that
 * many — the session then asks another format.
 */
export function waehleAblenker<T extends MaterialWort>(
  ziel: T,
  andere: T[],
  opt: AblenkerOptionen<T>,
): T[] | null {
  const anzahl = opt.anzahl ?? 3;
  const fenster = opt.fenster ?? 6;
  const zielText = normalisieren(opt.feld(ziel));
  const art = wortArt(ziel);

  const gesehen = new Set<string>([zielText]);
  const kandidaten: T[] = [];
  for (const w of mischen(andere, opt.rnd)) {
    if (w.id === ziel.id) continue;
    const text = normalisieren(opt.feld(w));
    if (gesehen.has(text)) continue;
    if (opt.bedeutung && bedeutungUeberlappt(ziel.uz, w.uz)) continue;
    gesehen.add(text);
    kandidaten.push(w);
  }
  if (kandidaten.length < anzahl) return null;

  const gleicheArt = (w: T) => wortArt(w) === art;
  // Stable sort over the shuffled list: equal keys keep a random order.
  const sortiert = [...kandidaten].sort((a, b) => {
    const artA = gleicheArt(a) ? 0 : 1;
    const artB = gleicheArt(b) ? 0 : 1;
    if (artA !== artB) return artA - artB;
    return opt.aehnlich ? abstand(ziel.de, a.de) - abstand(ziel.de, b.de) : 0;
  });

  const gleiche = sortiert.filter(gleicheArt).length;
  const breite =
    gleiche >= anzahl ? Math.max(anzahl, Math.min(fenster, gleiche)) : anzahl;
  return mischen(sortiert.slice(0, breite), opt.rnd).slice(0, anzahl);
}
