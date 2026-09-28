import { randomBytes } from 'crypto';

/**
 * Picture file key in R2 — random, like audio keys (`audio-keys.ts`).
 *
 * A key derived from the word (`daf/img/u03-s1-bahnhof.jpg`) would give the
 * answer away: in `BILD_WORT` and `AUDIO_BILD` the four OPTIONS are pictures,
 * so each option's URL would name its word. The key is stored in
 * `content/daf/a1/bilder.json` because it cannot be recomputed; without the
 * manifest every run would draw a new file and orphan the old one in R2.
 */
export function neuerBildSchluessel(): string {
  return `daf/bild/${randomBytes(16).toString('hex')}.jpg`;
}

/** `sourceId` → R2 key. Content, kept in git. */
export type BildManifest = Record<string, string>;

export function bildSchluesselFuer(
  manifest: BildManifest,
  sourceId: string,
): string | null {
  return manifest[sourceId] ?? null;
}
