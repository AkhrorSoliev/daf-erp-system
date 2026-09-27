export type Artikel = "der" | "die" | "das";

const MIT_NOMEN = /^(der|die|das) ([A-ZÄÖÜ]\S*)$/;

/**
 * Splits a word shown with its article ("der Bahnhof"). Only a lowercase
 * article followed by ONE capitalised noun counts, so a sentence — even
 * one that starts "Der Bus …" or "die Frau ist …" — is left alone, and so
 * is anything Uzbek. A bare article (the ARTIKEL options) is an article
 * with no rest.
 */
export function artikelTeilen(text: string): {
  artikel: Artikel | null;
  rest: string;
} {
  if (text === "der" || text === "die" || text === "das") {
    return { artikel: text, rest: "" };
  }
  const m = MIT_NOMEN.exec(text);
  if (!m) return { artikel: null, rest: text };
  return { artikel: m[1] as Artikel, rest: m[2] };
}

/**
 * der blue, die red, das green (CEO, 2026-09-27) — tokens under `.lumio`
 * in globals.css, so the dark theme gets its own lighter shades.
 */
export function artikelKlasse(artikel: Artikel | null): string {
  if (!artikel) return "";
  return `text-artikel-${artikel}`;
}
