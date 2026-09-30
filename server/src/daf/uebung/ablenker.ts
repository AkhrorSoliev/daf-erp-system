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

  const zielZahl = zahlVon(ziel);
  const gesehen = new Set<string>([zielText]);
  const kandidaten: T[] = [];
  for (const w of mischen(andere, opt.rnd)) {
    if (w.id === ziel.id) continue;
    const text = normalisieren(opt.feld(w));
    if (gesehen.has(text)) continue;
    // Two numbers mean the same only when they are the same number:
    // "o'n yetti" contains "yetti" but is no answer to "sieben".
    const wZahl = zahlVon(w);
    const gleicheBedeutung =
      zielZahl !== null && wZahl !== null
        ? zielZahl === wZahl
        : bedeutungUeberlappt(ziel.uz, w.uz);
    if (opt.bedeutung && gleicheBedeutung) continue;
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

  if (zielZahl !== null) {
    const reihe = [
      ...mischen(sortiert.slice(0, fenster), opt.rnd),
      ...sortiert.slice(fenster),
    ];
    const zahlen = zahlenAuswahl(zielZahl, reihe, anzahl, opt.rnd);
    if (zahlen) return zahlen;
  }

  const gleiche = sortiert.filter(gleicheArt).length;
  const breite =
    gleiche >= anzahl ? Math.max(anzahl, Math.min(fenster, gleiche)) : anzahl;
  return mischen(sortiert.slice(0, breite), opt.rnd).slice(0, anzahl);
}

function zahlVon(w: Pick<MaterialWort, 'anzeige'>): number | null {
  return w.anzeige && /^\d+$/.test(w.anzeige) ? Number(w.anzeige) : null;
}

/**
 * Distractors for a number, from `reihe` (best first), such that every
 * option has as many traps among the options as the answer has.
 *
 * A trap beside the answer alone gives it away: 30 between 20 and 40, or 7
 * in the only linked pair beside two unrelated numbers, is found with no
 * German at all (review 2026-09-30: blind guessing rose from 25% to 48–60%).
 * So the answer's trap comes with pairs of traps of their own — 7 · 17 ·
 * 4 · 14 — and when that cannot be built, no option is a trap of another.
 * `null` when neither can be built from the numbers in `reihe`.
 */
function zahlenAuswahl<T extends MaterialWort>(
  zielZahl: number,
  reihe: T[],
  anzahl: number,
  rnd: () => number,
): T[] | null {
  const zahlen = reihe.filter((w) => zahlVon(w) !== null);
  const wert = (w: T) => zahlVon(w) as number;
  const frei = (w: T, werte: number[]) =>
    werte.every((z) => !zahlenFalle(z, wert(w)));

  if (anzahl % 2 === 1) {
    const fallen = zahlen.filter((w) => zahlenFalle(zielZahl, wert(w)));
    for (const falle of mischen(fallen, rnd)) {
      const gewaehlt = [falle];
      const werte = [zielZahl, wert(falle)];
      for (const x of zahlen) {
        if (gewaehlt.length === anzahl) break;
        if (gewaehlt.includes(x) || !frei(x, werte)) continue;
        const partner = zahlen.find(
          (y) =>
            y !== x &&
            !gewaehlt.includes(y) &&
            zahlenFalle(wert(x), wert(y)) &&
            frei(y, werte),
        );
        if (!partner) continue;
        gewaehlt.push(x, partner);
        werte.push(wert(x), wert(partner));
      }
      if (gewaehlt.length === anzahl) return gewaehlt;
    }
  }

  const gewaehlt: T[] = [];
  const werte = [zielZahl];
  for (const x of zahlen) {
    if (gewaehlt.length === anzahl) break;
    if (!frei(x, werte)) continue;
    gewaehlt.push(x);
    werte.push(wert(x));
  }
  return gewaehlt.length === anzahl ? gewaehlt : null;
}

/**
 * Two numbers German makes easy to mix up: the digits swapped (35/53 — the
 * unit is said first), -zehn against -zig (13/30, 17/70), and ten apart
 * (7/17).
 */
export function zahlenFalle(a: number, b: number): boolean {
  const s = String(a);
  if (s.length === 2 && String(b) === s[1] + s[0] && a !== b) return true;
  const teen = (x: number) => x >= 13 && x <= 19;
  if (teen(a) && b === (a - 10) * 10) return true;
  if (teen(b) && a === (b - 10) * 10) return true;
  return Math.abs(a - b) === 10;
}
