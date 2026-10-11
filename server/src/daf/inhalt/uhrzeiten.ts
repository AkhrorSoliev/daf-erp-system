import { createHash } from 'crypto';
import { parseZeit, sprechtext } from '../uebung/uhrzeit-text';

/**
 * The clock times each section teaches — `content/daf/a1/uhrzeiten.json`,
 * `{ "u05-s1": [{ "zeit": "03:30" }, …] }`. Only the time is written: the
 * German words are made in code (`uhrzeit-text.ts`). A clock face shows 12
 * hours, so `zeit` is `HH:MM` with hours 01–12 and minutes in fives.
 */
export type UhrzeitenFile = Record<string, Array<{ zeit: string }>>;

/**
 * Audio of the spoken times — `content/daf/a1/uhr-audio.json`, keyed by
 * `zeit` (one recording serves every section that teaches the time). Like
 * `satz-audio.json`: a random `key`, and the `textHash` of what was
 * spoken. Written by `scripts/daf-gen-uhr-audio.ts`.
 */
export type UhrAudioManifest = Record<
  string,
  { key: string; textHash: string }
>;

const BOLIM_KALITI = /^u\d{2}-s\d+$/;

/** Every problem in the file, in Uzbek; empty when it is valid. */
export function validateUhrzeiten(file: UhrzeitenFile): string[] {
  const fehler: string[] = [];
  for (const [bolim, zeiten] of Object.entries(file)) {
    if (!BOLIM_KALITI.test(bolim)) {
      fehler.push(`${bolim}: bo'lim kaliti \`u05-s1\` shaklida bo'lishi kerak`);
      continue;
    }
    const korilgan = new Set<string>();
    for (const { zeit } of zeiten) {
      const z = parseZeit(zeit);
      if (!z || z.h < 1 || z.h > 12 || z.m % 5 !== 0) {
        fehler.push(
          `${bolim}: ${zeit} — soat 01–12, daqiqa 5 ga karrali (HH:MM) bo'lishi kerak`,
        );
      } else if (korilgan.has(zeit)) {
        fehler.push(`${bolim}: ${zeit} takror yozilgan`);
      }
      korilgan.add(zeit);
    }
  }
  return fehler;
}

/** One unit's sections and their times. */
export function uhrzeitenDesUnits(
  file: UhrzeitenFile,
  unitCode: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [bolim, zeiten] of Object.entries(file)) {
    if (bolim.startsWith(`${unitCode}-`))
      out[bolim] = zeiten.map((z) => z.zeit);
  }
  return out;
}

/** The fingerprint of what the recording says (`sprechtext`). */
export function uhrTextHash(zeit: string): string {
  const z = parseZeit(zeit);
  if (!z) throw new Error(`uhrTextHash: noto'g'ri vaqt ${zeit}`);
  return createHash('sha256')
    .update(sprechtext(z.h, z.m), 'utf8')
    .digest('hex')
    .slice(0, 16);
}

/** The R2 key — only for a recording of the text spoken today. */
export function uhrAudioSchluessel(
  manifest: UhrAudioManifest,
  zeit: string,
): string | null {
  const eintrag = manifest[zeit];
  return eintrag && eintrag.textHash === uhrTextHash(zeit) ? eintrag.key : null;
}
